import { v4 as uuidv4 } from "uuid";

export interface CircleLike {
  getLatLng(): { lat: number; lng: number };
  getRadius(): number; // meters
}

export interface CakeLayerOptions {
  circles: CircleLike[];
  steps?: number;
}

type Position = [number, number]; // [lng, lat]

const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function destinationPoint(
  center: { lat: number; lng: number },
  distanceMeters: number,
  bearingDegrees: number,
): { lat: number; lng: number } {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(center.lat);
  const lon1 = toRadians(center.lng);

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngular = Math.sin(angularDistance);
  const cosAngular = Math.cos(angularDistance);

  const sinLat2 =
    sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearing);
  const lat2 = Math.asin(sinLat2);

  const y = Math.sin(bearing) * sinAngular * cosLat1;
  const x = cosAngular - sinLat1 * sinLat2;
  const lon2 = lon1 + Math.atan2(y, x);

  return { lat: toDegrees(lat2), lng: toDegrees(lon2) };
}

function signedRingArea(coords: Position[]): number {
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function ensureClosedRing(coords: Position[]): Position[] {
  const first = coords[0];
  const last = coords.at(-1);
  if (!first || !last) return coords;
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, first];
}

function ensureWinding(coords: Position[], clockwise: boolean): Position[] {
  const closed = ensureClosedRing(coords);
  const area = signedRingArea(closed);
  const isClockwise = area < 0;
  if (isClockwise === clockwise) return closed;
  const reversed = [...closed].reverse();
  return ensureClosedRing(reversed);
}

function circleToRing(
  center: { lat: number; lng: number },
  radiusMeters: number,
  steps: number,
): Position[] {
  if (steps < 4) throw new Error("steps must be >= 4");
  const pts: Position[] = [];
  for (let i = 0; i < steps; i++) {
    const bearing = (i / steps) * 360;
    const p = destinationPoint(center, radiusMeters, bearing);
    pts.push([p.lng, p.lat]);
  }
  return ensureClosedRing(pts);
}

function bakeCoreFeature(args: {
  id: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  layerIndex: number;
  steps: number;
}): GeoJSON.Feature {
  const { id, center, radiusMeters, layerIndex, steps } = args;
  const outer = ensureWinding(circleToRing(center, radiusMeters, steps), false);

  return {
    type: "Feature",
    properties: {
      id,
      layer_index: layerIndex,
      radius_outer: radiusMeters,
      type: "core",
      _meta: {
        lat: center.lat,
        lng: center.lng,
        radius: radiusMeters,
      },
    },
    geometry: { type: "Polygon", coordinates: [outer] },
  };
}

function bakeRingFeature(args: {
  id: string;
  center: { lat: number; lng: number };
  radiusOuterMeters: number;
  radiusInnerMeters: number;
  layerIndex: number;
  steps: number;
}): GeoJSON.Feature {
  const { id, center, radiusOuterMeters, radiusInnerMeters, layerIndex, steps } =
    args;
  const outer = ensureWinding(
    circleToRing(center, radiusOuterMeters, steps),
    false,
  );
  const inner = ensureWinding(
    circleToRing(center, radiusInnerMeters, steps),
    true,
  );

  return {
    type: "Feature",
    properties: {
      id,
      layer_index: layerIndex,
      radius_outer: radiusOuterMeters,
      type: "ring",
      _meta: {
        lat: center.lat,
        lng: center.lng,
        radius: radiusOuterMeters,
      },
    },
    geometry: { type: "Polygon", coordinates: [outer, inner] },
  };
}

export function bakeLayerCake(
  options: CakeLayerOptions,
): GeoJSON.FeatureCollection {
  const { circles, steps = 64 } = options;

  const sorted = [...circles].sort((a, b) => a.getRadius() - b.getRadius());
  const features: GeoJSON.Feature[] = [];

  sorted.forEach((circle, index) => {
    const center = circle.getLatLng();
    const radiusMeters = circle.getRadius();
    const id = uuidv4();

    if (index === 0) {
      features.push(
        bakeCoreFeature({ id, center, radiusMeters, layerIndex: index, steps }),
      );
      return;
    }

    const prev = sorted[index - 1];
    const prevRadiusMeters = prev.getRadius();

    features.push(
      bakeRingFeature({
        id,
        center,
        radiusOuterMeters: radiusMeters,
        radiusInnerMeters: prevRadiusMeters,
        layerIndex: index,
        steps,
      }),
    );
  });

  return { type: "FeatureCollection", features };
}

