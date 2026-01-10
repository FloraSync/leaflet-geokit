import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
  Polygon,
  MultiPolygon,
  GeoJsonProperties,
} from "geojson";

export type BBox = [
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
];
export type BoundsPair = [[number, number], [number, number]]; // [[south, west], [north, east]]

export function normalizeId(feature: Feature): string | undefined {
  const id = (feature as any).id ?? (feature.properties as any)?.id;
  if (id == null) return undefined;
  return String(id);
}

/**
 * Callback function for processing a single coordinate position
 */
export type CoordinateProcessor = (coord: Position) => void;

/**
 * Iterate all coordinates of a Geometry and call the processor function for each Position.
 */
export function eachCoord(geom: Geometry, cb: CoordinateProcessor): void {
  const walk = (g: Geometry) => {
    switch (g.type) {
      case "Point":
        cb(g.coordinates);
        break;
      case "MultiPoint":
      case "LineString":
        for (const c of g.coordinates) cb(c);
        break;
      case "MultiLineString":
      case "Polygon":
        for (const ring of g.coordinates as Position[][]) {
          for (const c of ring) cb(c);
        }
        break;
      case "MultiPolygon":
        for (const poly of g.coordinates as Position[][][]) {
          for (const ring of poly) {
            for (const c of ring) cb(c);
          }
        }
        break;
      case "GeometryCollection":
        for (const child of g.geometries) walk(child);
        break;
      default:
        // Unsupported geometry type
        break;
    }
  };
  walk(geom);
}

/**
 * Compute bounding box [minLng, minLat, maxLng, maxLat] for a single feature.
 * Returns null when the feature has no geometry.
 */
export function bboxOfFeature(feature: Feature): BBox | null {
  const geom = feature.geometry;
  if (!geom) return null;

  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  let seen = false;

  eachCoord(geom, (coord) => {
    // GeoJSON Position is [lng, lat, ...]
    const [lng, lat] = coord;
    if (typeof lng !== "number" || typeof lat !== "number") return;
    seen = true;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });

  if (!seen) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Compute bounding box for a FeatureCollection. Returns null if no features have geometry.
 */
export function bboxOfFeatureCollection(fc: FeatureCollection): BBox | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  let seen = false;

  for (const f of fc.features) {
    const b = bboxOfFeature(f);
    if (!b) continue;
    seen = true;
    minLng = Math.min(minLng, b[0]);
    minLat = Math.min(minLat, b[1]);
    maxLng = Math.max(maxLng, b[2]);
    maxLat = Math.max(maxLat, b[3]);
  }

  if (!seen) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Convert a bbox to [[south, west], [north, east]] tuple.
 */
export function bboxToBoundsPair(b: BBox): BoundsPair {
  const [minLng, minLat, maxLng, maxLat] = b;
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

/**
 * Expand Multi* geometries and GeometryCollections into multiple single-geometry Features.
 * - MultiPolygon → multiple Polygon features
 * - MultiLineString → multiple LineString features
 * - MultiPoint → multiple Point features
 * - GeometryCollection → one feature per child geometry
 * Other geometry types are returned unchanged.
 */
export function expandMultiGeometries(
  fc: FeatureCollection,
): FeatureCollection {
  const out: Feature[] = [];
  for (const f of fc.features) {
    if (!f || f.type !== "Feature") continue;
    const baseProps = f.properties ?? {};
    const geom = f.geometry;
    if (!geom) continue; // skip null geometry
    switch (geom.type) {
      case "MultiPolygon":
        for (const poly of geom.coordinates) {
          out.push({
            type: "Feature",
            properties: { ...baseProps },
            geometry: { type: "Polygon", coordinates: poly },
          });
        }
        break;
      case "MultiLineString":
        for (const line of geom.coordinates) {
          out.push({
            type: "Feature",
            properties: { ...baseProps },
            geometry: { type: "LineString", coordinates: line },
          });
        }
        break;
      case "MultiPoint":
        for (const pt of geom.coordinates) {
          out.push({
            type: "Feature",
            properties: { ...baseProps },
            geometry: { type: "Point", coordinates: pt },
          });
        }
        break;
      case "GeometryCollection":
        for (const child of geom.geometries) {
          out.push({
            type: "Feature",
            properties: { ...baseProps },
            geometry: child,
          });
        }
        break;
      default:
        out.push(f);
        break;
    }
  }
  return { type: "FeatureCollection", features: out };
}

/**
 * Check if a geometry is a Polygon
 */
export function isPolygon(geometry: Geometry | null): geometry is Polygon {
  return geometry?.type === "Polygon";
}

/**
 * Check if a geometry is a MultiPolygon
 */
export function isMultiPolygon(
  geometry: Geometry | null,
): geometry is MultiPolygon {
  return geometry?.type === "MultiPolygon";
}

/**
 * Extract polygon coordinates from a feature
 * Returns array of rings for each polygon (outer + inner rings)
 */
export function extractPolygonCoordinates(feature: Feature): Position[][][] {
  const geometry = feature.geometry;

  if (!geometry) return [];

  if (isPolygon(geometry)) {
    // Single polygon: return its rings as a one-element array
    return [geometry.coordinates];
  } else if (isMultiPolygon(geometry)) {
    // MultiPolygon: return all polygon rings
    return geometry.coordinates;
  }

  return []; // Not a polygon feature
}

/**
 * Merge multiple polygon features into a single polygon feature.
 * Attempts to create a topological union of the polygons, falling back to
 * a MultiPolygon if the union operation fails.
 *
 * @param features Array of features to merge (only polygon features will be used)
 * @param properties Properties for the resulting feature (defaults to first feature's properties)
 * @returns A new Feature with a unified Polygon or MultiPolygon, or null if no valid polygons found
 */
export function mergePolygons(
  features: Feature[],
  properties?: GeoJsonProperties,
): Feature | null {
  // Extract all polygon coordinates
  const allPolygons: Position[][][] = [];

  for (const feature of features) {
    const coords = extractPolygonCoordinates(feature);
    if (coords.length > 0) {
      allPolygons.push(...coords);
    }
  }

  if (allPolygons.length === 0) return null;

  const baseProps = properties ?? features[0]?.properties ?? {};

  // If only one polygon, return it directly as a Polygon
  if (allPolygons.length === 1) {
    return {
      type: "Feature",
      properties: { ...baseProps },
      geometry: {
        type: "Polygon",
        coordinates: allPolygons[0],
      },
    };
  }

  // Otherwise, return a MultiPolygon
  return {
    type: "Feature",
    properties: { ...baseProps },
    geometry: {
      type: "MultiPolygon",
      coordinates: allPolygons,
    },
  };
}

/**
 * Merge polygons from a FeatureCollection into a single polygon feature.
 *
 * @param fc FeatureCollection containing polygons to merge
 * @param properties Properties for the resulting feature (defaults to first feature's properties)
 * @returns A Feature with a merged Polygon/MultiPolygon, or null if no polygon features found
 */
export function mergePolygonsFromCollection(
  fc: FeatureCollection,
  properties?: GeoJsonProperties,
): Feature | null {
  if (!fc?.features?.length) return null;

  // Filter to only include polygon features
  const polygonFeatures = fc.features.filter((feature) => {
    const geom = feature.geometry;
    return geom && (isPolygon(geom) || isMultiPolygon(geom));
  });

  return mergePolygons(polygonFeatures, properties);
}
