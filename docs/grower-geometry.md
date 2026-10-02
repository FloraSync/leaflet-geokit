# Safe GeoJSON geometry and grower presets

`src/utils/grower-geometry.ts` is a framework-agnostic, map-free module. It
does not mutate GeoJSON, Leaflet layers, or caller-owned metadata. Every public
operation returns an explicit discriminated result instead of throwing geometry
errors into an application event handler.

The geometry helpers and grower presets are exported from both package
entry points (`src/index.ts` and `src/external.ts`). They remain framework-
agnostic and can be used independently of a map instance.

## Result contract

```ts
type GrowerGeometryResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code:
          | "invalid-input"
          | "invalid-options"
          | "unsupported-geometry"
          | "topology-error"
          | "empty-result"
          | "operation-failed";
        message: string;
        details?: readonly string[];
      };
    };
```

Inputs first pass `validateGeoJSON` from `src/utils/geojson-pipeline.ts`, then
WGS84 range, degeneracy, OGC validity, and self-intersection checks. Generated
geometry goes through the same checks before success is returned. Inputs and
nested properties are JSON-cloned before maintained Turf algorithms receive
them.

## Geometry operation signatures

```ts
type SupportedGeoJSON =
  | Geometry
  | Feature<Geometry>
  | FeatureCollection<Geometry>;

function bufferGeoJSON(
  input: SupportedGeoJSON,
  distanceMeters: number,
  options?: { steps?: number },
): GrowerGeometryResult<
  Feature<Polygon | MultiPolygon> | FeatureCollection<Polygon | MultiPolygon>
>;

function splitGeoJSON(
  line: Feature<LineString>,
  splitter: Feature<
    Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon
  >,
): GrowerGeometryResult<FeatureCollection<LineString>>;

function mergeGeoJSON(
  polygons: FeatureCollection<Polygon | MultiPolygon>,
  properties?: GeoJsonProperties,
): GrowerGeometryResult<Feature<Polygon | MultiPolygon>>;

function simplifyGeoJSON<T extends SupportedGeoJSON>(
  input: T,
  options: {
    toleranceDegrees: number;
    highQuality?: boolean;
  },
): GrowerGeometryResult<T>;

function centroidGeoJSON(
  input: SupportedGeoJSON,
  properties?: GeoJsonProperties,
): GrowerGeometryResult<Feature<Point>>;

function boundingBoxGeoJSON(
  input: SupportedGeoJSON,
): GrowerGeometryResult<
  [west: number, south: number, east: number, north: number]
>;
```

- Buffer distance is signed, finite, non-zero meters. Negative erosion that
  removes any member fails with `empty-result`; a partial collection is never
  silently returned. `steps` is 4–256.
- Split currently supports one `LineString`. A splitter that does not cut it is
  `empty-result`. Nested properties are copied. Top-level and fallback
  `properties.id` values become `<source>:split:<one-based-index>` so the output
  does not contain duplicate IDs.
- Merge requires at least two polygon features and invokes polygon overlay
  union. It never implements “merge” as coordinate concatenation. Disconnected
  inputs correctly produce a `MultiPolygon`. Output properties are the supplied
  properties, or a clone of the first feature's properties.
- Simplification supports line and polygon members only. The tolerance is
  deliberately named `toleranceDegrees`: Turf's Ramer–Douglas–Peucker
  implementation operates in coordinate units, not meters. An invalid or
  degenerate simplified result is rejected.
- Centroid is the arithmetic mean of vertices, not an area-weighted center of
  mass and not a guaranteed interior point.
- Bounding boxes always recompute coordinate extents and ignore a stale input
  `bbox` field.

## Measurement and formatting signatures

```ts
interface GeoJSONMeasurements {
  lengthMeters: number;
  perimeterMeters: number;
  areaSquareMeters: number;
}

function measureGeoJSON(
  input: SupportedGeoJSON,
): GrowerGeometryResult<GeoJSONMeasurements>;

function formatMeasurements(
  measurements: GeoJSONMeasurements,
  system: "metric" | "imperial",
  options?: {
    locale?: string;
    maximumFractionDigits?: number;
    autoScale?: boolean;
  },
): GrowerGeometryResult<{
  length: { value: number; unit: "m" | "km" | "ft" | "mi"; text: string };
  perimeter: { value: number; unit: "m" | "km" | "ft" | "mi"; text: string };
  area: { value: number; unit: "m²" | "ha" | "ft²" | "ac"; text: string };
}>;
```

`lengthMeters` sums open `LineString` and `MultiLineString` members.
`perimeterMeters` sums every polygon exterior and hole ring.
`areaSquareMeters` sums polygon and multipolygon geodesic area with holes
removed. Geometry collections and feature collections accumulate their members.
Points contribute zero.

Line and ring distance uses `computePreciseDistance`, including its Vincenty
path and existing fallback. Area uses Turf's geodesic-area implementation.
Formatting preserves the unrounded converted value and separately provides a
locale-rounded display string. With `autoScale: false` (the default), metric
uses meters and square meters while imperial uses feet and square feet. With
`autoScale: true`, large values switch to kilometers/miles and hectares/acres.
Conversions use 1 m = 3.280839895013123 ft and 1 m² =
10.763910416709722 ft².

## Grower presets and guide signatures

```ts
const GROWER_PRESETS = {
  bedWidthMeters: { compact: 0.75, standard: 1, wide: 1.2 },
  rowSpacingMeters: { dense: 0.15, vegetables: 0.3, orchard: 3 },
  irrigationRadiusMeters: {
    dripEmitter: 0.3,
    microSprinkler: 3,
    sprinkler: 12,
  },
} as const;

function createBedWidthGuides<T extends LineString | MultiLineString>(
  centerLine: Feature<T>,
  bedWidthMeters: number,
): GrowerGeometryResult<FeatureCollection<T>>;

function createRowSpacingGuides<T extends LineString | MultiLineString>(
  baseline: Feature<T>,
  spacingMeters: number,
  options?: {
    rowsPerSide?: number; // default 2, range 1–100
    includeBaseline?: boolean; // default true
  },
): GrowerGeometryResult<FeatureCollection<T>>;

function createIrrigationZones(
  center: Position, // [longitude, latitude]
  outerRadiusMeters: number,
  options?: {
    zoneCount?: number; // default 1, range 1–32
    steps?: number; // default 64, range 8–256
  },
): GrowerGeometryResult<FeatureCollection<Polygon>>;
```

Bed guides are offset by half the full width on opposite sides. Row guides are
symmetric offsets from the baseline. Each guide receives a `geokit:guide`
property with its type and signed meter offset; existing nested metadata is
cloned and IDs receive a guide suffix.

Turf line offsets use spherical calculations. Focused tests compare them with
the WGS84 ellipsoidal distance helper; at one-meter scale around the equator the
observed difference is about 0.1% (roughly 1 mm). These guide lines are planning
aids rather than survey or machine-control boundaries.

Irrigation zones reuse `bakeLayerCake` from
`src/lib/layer-cake/CakeBaker.ts`. `zoneCount` divides the outer radius into
equal-width concentric polygons: the first is a core and later zones are rings
with holes. CakeBaker assigns UUID feature IDs. The preset dimensions are
positive defaults, not agronomic recommendations; callers must select values
appropriate to crop, emitter, pressure, soil, and local practice.

## Limits

- Coordinates must be finite WGS84 longitude/latitude and remain within
  ±180/±90 degrees. No CRS reprojection is performed.
- Algorithms operate on ordinary RFC 7946 planar coordinate topology. Geometry
  that crosses the antimeridian or encloses a pole should be normalized or
  handled by a specialized geodesic engine first.
- Zero-area rings, zero-length lines, invalid hole relationships,
  self-intersections, empty collections, and invalid generated outputs are
  rejected.
- `GeometryCollection` is supported by validation, measurement, centroid,
  bounds, and buffering. Simplification succeeds only when every leaf is a line
  or polygon. Split and merge intentionally use the narrower signatures above.
- Input metadata must be finite, acyclic JSON, matching `validateGeoJSON`.
- These helpers produce GeoJSON only. They do not create, edit, or provision
  Leaflet layers and do not call FloraSync APIs.

## Maintained algorithm dependencies

The manifest includes only the Turf modules used by this file: area, bbox,
boolean-valid, buffer, centroid, kinks, line-offset, line-split, simplify, and
union. This keeps robust clipping/overlay behavior in maintained libraries
instead of an ad-hoc implementation while allowing bundlers to tree-shake each
operation.


## Public grower presets

`GROWER_PRESETS` contains practical starting values for `bedWidthMeters`,
`rowSpacingMeters`, and `irrigationRadiusMeters`. Use `createBedWidthGuides`,
`createRowSpacingGuides`, or `createIrrigationZones` with a preset and add the
returned features through `importGeoJSON({ ... }, { behavior: "add", layer: { kind: "guide" } })`
when they should participate in guide-layer snapping. Every helper returns
`{ ok: false, error }` for invalid inputs; callers should surface the actionable
message and leave the existing FeatureCollection unchanged.
