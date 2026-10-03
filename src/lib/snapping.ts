import type { Feature, Geometry, Position } from "geojson";
import type { SnapMode, SnappingOptions } from "@src/types/public";

export interface SnapScreenPoint {
  x: number;
  y: number;
}

export interface SnapLatLng {
  lat: number;
  lng: number;
}

export interface SnapTarget {
  featureId: string;
  layerId: string;
  layerKind: string;
  visible: boolean;
  feature: Feature;
}

export interface SnapResult {
  latlng: SnapLatLng;
  point: SnapScreenPoint;
  distancePx: number;
  mode: SnapMode;
  targetFeatureId?: string;
  targetLayerId?: string;
}

const DEFAULT_MODES: SnapMode[] = ["vertex", "edge", "grid", "guide"];
const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const DEG_TO_RAD = Math.PI / 180;
const MAX_GRID_LATITUDE = 89.9;

function finitePosition(position: Position): [number, number] | null {
  const lng = position[0];
  const lat = position[1];
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function eachLine(
  geometry: Geometry | null,
  callback: (positions: Position[]) => void,
): void {
  if (!geometry) return;
  switch (geometry.type) {
    case "LineString":
      callback(geometry.coordinates);
      return;
    case "MultiLineString":
      geometry.coordinates.forEach(callback);
      return;
    case "Polygon":
      geometry.coordinates.forEach(callback);
      return;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) => polygon.forEach(callback));
      return;
    case "GeometryCollection":
      geometry.geometries.forEach((child) => eachLine(child, callback));
      return;
    default:
      return;
  }
}

function eachVertex(
  geometry: Geometry | null,
  callback: (position: Position) => void,
): void {
  if (!geometry) return;
  switch (geometry.type) {
    case "Point":
      callback(geometry.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(callback);
      return;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.flat().forEach(callback);
      return;
    case "MultiPolygon":
      geometry.coordinates.flat(2).forEach(callback);
      return;
    case "GeometryCollection":
      geometry.geometries.forEach((child) => eachVertex(child, callback));
      return;
  }
}

function distance(a: SnapScreenPoint, b: SnapScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function closestOnSegment(
  point: SnapScreenPoint,
  start: SnapScreenPoint,
  end: SnapScreenPoint,
): SnapScreenPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { ...start };
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return { x: start.x + t * dx, y: start.y + t * dy };
}

function optionModes(options: SnappingOptions): SnapMode[] {
  const requested = options.modes?.length ? options.modes : DEFAULT_MODES;
  return [...new Set(requested)];
}

function meridionalRadius(latitudeRadians: number): number {
  const sinLatitude = Math.sin(latitudeRadians);
  return (WGS84_A * (1 - WGS84_E2)) / (1 - WGS84_E2 * sinLatitude ** 2) ** 1.5;
}

/**
 * Meridional arc from the equator, in meters. The series is accurate enough
 * for the small local grid cells supported by this module and makes latitude
 * nodes stable relative to a fixed origin.
 */
function meridionalArc(latitudeRadians: number): number {
  const e4 = WGS84_E2 ** 2;
  const e6 = WGS84_E2 ** 3;
  return (
    WGS84_A *
    ((1 - WGS84_E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latitudeRadians -
      ((3 * WGS84_E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) *
        Math.sin(2 * latitudeRadians) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latitudeRadians) -
      ((35 * e6) / 3072) * Math.sin(6 * latitudeRadians))
  );
}

function latitudeFromMeridionalArc(northing: number): number {
  let latitude = Math.max(
    -Math.PI / 2,
    Math.min(Math.PI / 2, northing / WGS84_A),
  );
  for (let iteration = 0; iteration < 8; iteration++) {
    latitude -=
      (meridionalArc(latitude) - northing) / meridionalRadius(latitude);
  }
  return latitude / DEG_TO_RAD;
}

function metersPerDegreeLongitude(latitudeDegrees: number): number {
  const latitudeRadians = latitudeDegrees * DEG_TO_RAD;
  const primeVerticalRadius =
    WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(latitudeRadians) ** 2);
  return primeVerticalRadius * Math.cos(latitudeRadians) * DEG_TO_RAD;
}

function physicalGridNode(
  raw: SnapLatLng,
  options: SnappingOptions,
): SnapLatLng | null {
  const size = options.gridSizeMeters;
  const [originLng, originLat] = options.gridOrigin ?? [0, 0];
  if (
    !Number.isFinite(size) ||
    size! <= 0 ||
    !Number.isFinite(raw.lat) ||
    !Number.isFinite(raw.lng) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(originLat) ||
    Math.abs(raw.lat) > MAX_GRID_LATITUDE ||
    Math.abs(originLat) > MAX_GRID_LATITUDE
  )
    return null;

  const originNorthing = meridionalArc(originLat * DEG_TO_RAD);
  const rawNorthing = meridionalArc(raw.lat * DEG_TO_RAD);
  const gridNorthing =
    originNorthing + Math.round((rawNorthing - originNorthing) / size!) * size!;
  const gridLat = latitudeFromMeridionalArc(gridNorthing);
  if (!Number.isFinite(gridLat) || Math.abs(gridLat) > MAX_GRID_LATITUDE)
    return null;

  const longitudeScale = metersPerDegreeLongitude(gridLat);
  if (!Number.isFinite(longitudeScale) || longitudeScale <= 0) return null;
  const gridLng =
    originLng +
    (Math.round(((raw.lng - originLng) * longitudeScale) / size!) * size!) /
      longitudeScale;
  return { lng: gridLng, lat: gridLat };
}
/**
 * Find the closest candidate in rendered screen space. This deliberately receives
 * projection functions so it can be unit-tested without a Leaflet map.
 */
export function findSnap(
  raw: SnapLatLng,
  targets: readonly SnapTarget[],
  project: (latlng: SnapLatLng) => SnapScreenPoint,
  unproject: (point: SnapScreenPoint) => SnapLatLng,
  options: SnappingOptions = {},
  excludedFeatureId?: string,
): SnapResult | null {
  if (options.enabled === false) return null;
  const modes = optionModes(options);
  const tolerancePx = options.tolerancePx ?? 12;
  if (!Number.isFinite(tolerancePx) || tolerancePx <= 0) return null;
  const pointer = project(raw);
  let best: SnapResult | null = null;

  const consider = (
    point: SnapScreenPoint,
    mode: SnapMode,
    metadata: Pick<SnapResult, "targetFeatureId" | "targetLayerId"> = {},
    exactLatLng?: SnapLatLng,
  ) => {
    const distancePx = distance(pointer, point);
    if (distancePx > tolerancePx) return;
    const modeRank = modes.indexOf(mode);
    const bestRank = best ? modes.indexOf(best.mode) : Number.MAX_SAFE_INTEGER;
    if (
      best &&
      (distancePx > best.distancePx + 0.001 ||
        (distancePx >= best.distancePx - 0.001 && modeRank > bestRank))
    )
      return;
    best = {
      latlng: exactLatLng ?? unproject(point),
      point,
      distancePx,
      mode,
      ...metadata,
    };
  };

  for (const target of targets) {
    if (
      !target.visible ||
      target.layerKind === "measurement" ||
      target.featureId === excludedFeatureId
    )
      continue;
    const targetModes: SnapMode[] =
      target.layerKind === "guide"
        ? modes.includes("guide")
          ? ["guide"]
          : []
        : modes.filter(
            (mode): mode is "vertex" | "edge" =>
              mode === "vertex" || mode === "edge",
          );
    for (const mode of targetModes) {
      if (mode === "vertex") {
        eachVertex(target.feature.geometry, (position) => {
          const coordinate = finitePosition(position);
          if (coordinate)
            consider(
              project({ lng: coordinate[0], lat: coordinate[1] }),
              mode,
              {
                targetFeatureId: target.featureId,
                targetLayerId: target.layerId,
              },
              { lng: coordinate[0], lat: coordinate[1] },
            );
        });
      } else {
        eachLine(target.feature.geometry, (positions) => {
          for (let index = 1; index < positions.length; index++) {
            const start = finitePosition(positions[index - 1]);
            const end = finitePosition(positions[index]);
            if (!start || !end) continue;
            const startPoint = project({ lng: start[0], lat: start[1] });
            const endPoint = project({ lng: end[0], lat: end[1] });
            const projected = closestOnSegment(pointer, startPoint, endPoint);
            const segmentLengthSquared =
              (endPoint.x - startPoint.x) ** 2 +
              (endPoint.y - startPoint.y) ** 2;
            const t =
              segmentLengthSquared === 0
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      1,
                      ((projected.x - startPoint.x) *
                        (endPoint.x - startPoint.x) +
                        (projected.y - startPoint.y) *
                          (endPoint.y - startPoint.y)) /
                        segmentLengthSquared,
                    ),
                  );
            consider(
              projected,
              mode,
              {
                targetFeatureId: target.featureId,
                targetLayerId: target.layerId,
              },
              {
                lng: start[0] + (end[0] - start[0]) * t,
                lat: start[1] + (end[1] - start[1]) * t,
              },
            );
          }
        });
      }
    }
  }

  if (
    modes.includes("grid") &&
    Number.isFinite(options.gridSizeMeters) &&
    (options.gridSizeMeters ?? 0) > 0
  ) {
    const gridNode = physicalGridNode(raw, options);
    if (gridNode) {
      const point = project(gridNode);
      consider(point, "grid", {}, gridNode);
    }
  }

  return best;
}
