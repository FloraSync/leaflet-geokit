import { area as turfArea } from "@turf/area";
import { bbox as turfBbox } from "@turf/bbox";
import { booleanValid } from "@turf/boolean-valid";
import { buffer as turfBuffer } from "@turf/buffer";
import { centroid as turfCentroid } from "@turf/centroid";
import { kinks } from "@turf/kinks";
import { lineOffset } from "@turf/line-offset";
import { lineSplit } from "@turf/line-split";
import { simplify as turfSimplify } from "@turf/simplify";
import { union as turfUnion } from "@turf/union";
import type {
  BBox,
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  GeometryCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";
import { bakeLayerCake } from "../lib/layer-cake/CakeBaker";
import { computePreciseDistance } from "./geodesic";
import { validateGeoJSON } from "./geojson-pipeline";

export type SupportedGeoJSON =
  | Geometry
  | Feature<Geometry>
  | FeatureCollection<Geometry>;

export type GrowerGeometryErrorCode =
  | "invalid-input"
  | "invalid-options"
  | "unsupported-geometry"
  | "topology-error"
  | "empty-result"
  | "operation-failed";

export interface GrowerGeometryError {
  code: GrowerGeometryErrorCode;
  message: string;
  details?: readonly string[];
}

export type GrowerGeometryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GrowerGeometryError };

export type BufferedGeoJSON =
  | Feature<Polygon | MultiPolygon>
  | FeatureCollection<Polygon | MultiPolygon>;

export type SplitterGeometry =
  | Point
  | MultiPoint
  | LineString
  | MultiLineString
  | Polygon
  | MultiPolygon;

export interface BufferGeoJSONOptions {
  /** Polygonization resolution per quadrant. */
  steps?: number;
}

export interface SimplifyGeoJSONOptions {
  /** Ramer-Douglas-Peucker tolerance in longitude/latitude degrees. */
  toleranceDegrees: number;
  highQuality?: boolean;
}

export interface GeoJSONMeasurements {
  /** Open LineString and MultiLineString distance. */
  lengthMeters: number;
  /** Total exterior and hole-ring boundary distance. */
  perimeterMeters: number;
  /** Geodesic Polygon and MultiPolygon area, with holes removed. */
  areaSquareMeters: number;
}

export type MeasurementSystem = "metric" | "imperial";
export type DistanceUnit = "m" | "km" | "ft" | "mi";
export type AreaUnit = "m²" | "ha" | "ft²" | "ac";

export interface FormattedQuantity<Unit extends string> {
  /** Converted, unrounded value. */
  value: number;
  unit: Unit;
  /** Locale-formatted value and unit label. */
  text: string;
}

export interface FormattedGeoJSONMeasurements {
  length: FormattedQuantity<DistanceUnit>;
  perimeter: FormattedQuantity<DistanceUnit>;
  area: FormattedQuantity<AreaUnit>;
}

export interface MeasurementFormatOptions {
  locale?: string;
  maximumFractionDigits?: number;
  /** Switch large values to km/mi and ha/ac. Defaults to false. */
  autoScale?: boolean;
}

export interface RowSpacingGuideOptions {
  /** Number of parallel guides on each side of the baseline. Defaults to 2. */
  rowsPerSide?: number;
  /** Include an unchanged clone of the baseline. Defaults to true. */
  includeBaseline?: boolean;
}

export interface IrrigationZoneOptions {
  /** Number of equal-width concentric zones. Defaults to 1. */
  zoneCount?: number;
  /** Vertices used to approximate each circle. Defaults to 64. */
  steps?: number;
}

/** Practical starting values only; callers remain responsible for crop/system design. */
export const GROWER_PRESETS = {
  bedWidthMeters: {
    compact: 0.75,
    standard: 1,
    wide: 1.2,
  },
  rowSpacingMeters: {
    dense: 0.15,
    vegetables: 0.3,
    orchard: 3,
  },
  irrigationRadiusMeters: {
    dripEmitter: 0.3,
    microSprinkler: 3,
    sprinkler: 12,
  },
} as const;

const FEET_PER_METER = 3.280839895013123;
const SQUARE_FEET_PER_SQUARE_METER = 10.763910416709722;
const METERS_PER_MILE = 1609.344;
const SQUARE_METERS_PER_ACRE = 4046.8564224;
const SQUARE_METERS_PER_HECTARE = 10_000;

const success = <T>(value: T): GrowerGeometryResult<T> => ({
  ok: true,
  value,
});

const failure = <T>(
  code: GrowerGeometryErrorCode,
  message: string,
  details?: readonly string[],
): GrowerGeometryResult<T> => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isSupportedRoot = (value: unknown): value is SupportedGeoJSON => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  return [
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
    "Feature",
    "FeatureCollection",
  ].includes(value.type);
};

function forEachGeometry(
  input: SupportedGeoJSON,
  visit: (geometry: Geometry, path: string) => void,
): void {
  if (input.type === "FeatureCollection") {
    input.features.forEach((feature, index) =>
      forEachGeometry(feature, (geometry, path) =>
        visit(geometry, `features[${index}].${path}`),
      ),
    );
    return;
  }
  if (input.type === "Feature") {
    visit(input.geometry, "geometry");
    return;
  }
  visit(input, "geometry");
}

function visitGeometryTree(
  geometry: Geometry,
  path: string,
  visit: (
    geometry: Exclude<Geometry, GeometryCollection>,
    path: string,
  ) => void,
): void {
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((child, index) =>
      visitGeometryTree(child, `${path}.geometries[${index}]`, visit),
    );
    return;
  }
  visit(geometry, path);
}

function positionsEqual(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function lineIsDegenerate(coordinates: Position[]): boolean {
  const first = coordinates[0];
  return (
    !first || coordinates.every((position) => positionsEqual(first, position))
  );
}

function signedRingArea(coordinates: Position[]): number {
  let sum = 0;
  for (let index = 0; index < coordinates.length - 1; index++) {
    const current = coordinates[index];
    const next = coordinates[index + 1];
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return sum / 2;
}

function coordinateBoundsError(
  geometry: Exclude<Geometry, GeometryCollection>,
  path: string,
): string | null {
  const inspectPosition = (position: Position, positionPath: string) => {
    if (Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90)
      return `${positionPath} is outside WGS84 longitude/latitude bounds.`;
    return null;
  };
  const inspectLine = (line: Position[], linePath: string) => {
    for (let index = 0; index < line.length; index++) {
      const error = inspectPosition(line[index], `${linePath}[${index}]`);
      if (error) return error;
    }
    return null;
  };

  switch (geometry.type) {
    case "Point":
      return inspectPosition(geometry.coordinates, `${path}.coordinates`);
    case "MultiPoint":
    case "LineString":
      return inspectLine(geometry.coordinates, `${path}.coordinates`);
    case "MultiLineString":
    case "Polygon":
      for (let index = 0; index < geometry.coordinates.length; index++) {
        const error = inspectLine(
          geometry.coordinates[index],
          `${path}.coordinates[${index}]`,
        );
        if (error) return error;
      }
      return null;
    case "MultiPolygon":
      for (
        let polygonIndex = 0;
        polygonIndex < geometry.coordinates.length;
        polygonIndex++
      ) {
        const polygon = geometry.coordinates[polygonIndex];
        for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
          const error = inspectLine(
            polygon[ringIndex],
            `${path}.coordinates[${polygonIndex}][${ringIndex}]`,
          );
          if (error) return error;
        }
      }
      return null;
  }
}

function topologyError(
  geometry: Exclude<Geometry, GeometryCollection>,
  path: string,
): string | null {
  const boundsError = coordinateBoundsError(geometry, path);
  if (boundsError) return boundsError;

  if (geometry.type === "LineString" && lineIsDegenerate(geometry.coordinates))
    return `${path} has no non-zero line segment.`;

  if (geometry.type === "MultiLineString") {
    const index = geometry.coordinates.findIndex(lineIsDegenerate);
    if (index >= 0)
      return `${path}.coordinates[${index}] has no non-zero line segment.`;
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
      for (
        let ringIndex = 0;
        ringIndex < polygons[polygonIndex].length;
        ringIndex++
      ) {
        const ring = polygons[polygonIndex][ringIndex];
        if (Math.abs(signedRingArea(ring)) <= Number.EPSILON)
          return `${path} contains a degenerate zero-area ring.`;
      }
    }
  }

  if (!booleanValid(geometry))
    return `${path} is not valid under OGC Simple Feature topology rules.`;

  if (
    geometry.type === "LineString" ||
    geometry.type === "MultiLineString" ||
    geometry.type === "Polygon" ||
    geometry.type === "MultiPolygon"
  ) {
    if (kinks(geometry).features.length > 0)
      return `${path} contains one or more self-intersections.`;
  }

  return null;
}

function validateInput(input: unknown): GrowerGeometryResult<SupportedGeoJSON> {
  const summary = validateGeoJSON(input);
  if (!summary.valid) {
    const unsupported = summary.diagnostics.some(
      (diagnostic) => diagnostic.code === "unsupported-geometry",
    );
    return failure(
      unsupported ? "unsupported-geometry" : "invalid-input",
      "GeoJSON structural validation failed.",
      summary.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map(
          (diagnostic) =>
            `${diagnostic.path}: ${diagnostic.code}: ${diagnostic.message}`,
        ),
    );
  }
  if (!isSupportedRoot(input))
    return failure("invalid-input", "Expected a supported GeoJSON object.");
  if (input.type === "FeatureCollection" && input.features.length === 0)
    return failure("invalid-input", "FeatureCollection must not be empty.");

  let inspected = 0;
  let error: string | null = null;
  forEachGeometry(input, (geometry, path) => {
    if (error) return;
    if (
      geometry.type === "GeometryCollection" &&
      geometry.geometries.length === 0
    ) {
      error = `${path} must not be an empty GeometryCollection.`;
      return;
    }
    visitGeometryTree(geometry, path, (child, childPath) => {
      inspected += 1;
      error ??= topologyError(child, childPath);
    });
  });
  if (inspected === 0)
    return failure("invalid-input", "GeoJSON contains no geometry.");
  if (error) return failure("topology-error", error);
  return success(input);
}

function validateResult<T extends SupportedGeoJSON>(
  result: T,
): GrowerGeometryResult<T> {
  const validation = validateInput(result);
  if (!validation.ok)
    return failure(
      validation.error.code === "invalid-input"
        ? "operation-failed"
        : validation.error.code,
      `Generated GeoJSON was rejected: ${validation.error.message}`,
      validation.error.details,
    );
  return success(result);
}

function caughtFailure<T>(
  operation: string,
  error: unknown,
): GrowerGeometryResult<T> {
  return failure(
    "operation-failed",
    `${operation} failed safely: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function finiteNonZero(value: number): boolean {
  return Number.isFinite(value) && value !== 0;
}

/** Buffer valid WGS84 GeoJSON by a signed distance in meters. */
export function bufferGeoJSON(
  input: SupportedGeoJSON,
  distanceMeters: number,
  options: BufferGeoJSONOptions = {},
): GrowerGeometryResult<BufferedGeoJSON> {
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  if (!finiteNonZero(distanceMeters))
    return failure(
      "invalid-options",
      "distanceMeters must be a finite, non-zero number.",
    );
  const steps = options.steps ?? 8;
  if (!Number.isInteger(steps) || steps < 4 || steps > 256)
    return failure(
      "invalid-options",
      "steps must be an integer from 4 through 256.",
    );

  try {
    const working = clone(input);
    let result: BufferedGeoJSON | undefined;
    if (working.type === "FeatureCollection") {
      const features: Array<Feature<Polygon | MultiPolygon>> = [];
      for (const feature of working.features) {
        const buffered = turfBuffer(feature, distanceMeters, {
          units: "meters",
          steps,
        });
        if (!buffered)
          return failure(
            "empty-result",
            "Buffer removed at least one input feature; no partial result was returned.",
          );
        features.push(buffered);
      }
      result = { type: "FeatureCollection", features };
    } else {
      const buffered = turfBuffer(working, distanceMeters, {
        units: "meters",
        steps,
      });
      if (buffered?.type === "FeatureCollection") result = buffered;
      else result = buffered;
    }
    if (
      !result ||
      (result.type === "FeatureCollection" && result.features.length === 0)
    )
      return failure("empty-result", "Buffer produced no geometry.");
    return validateResult(result);
  } catch (error) {
    return caughtFailure("Buffer", error);
  }
}

/** Split one LineString feature. A non-intersecting splitter is an explicit error. */
export function splitGeoJSON(
  line: Feature<LineString>,
  splitter: Feature<SplitterGeometry>,
): GrowerGeometryResult<FeatureCollection<LineString>> {
  const checkedLine = validateInput(line);
  if (!checkedLine.ok) return checkedLine;
  const checkedSplitter = validateInput(splitter);
  if (!checkedSplitter.ok) return checkedSplitter;
  if (line.geometry.type !== "LineString")
    return failure(
      "unsupported-geometry",
      "splitGeoJSON requires a LineString feature.",
    );
  if (
    ![
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
    ].includes(splitter.geometry.type)
  )
    return failure("unsupported-geometry", "Unsupported splitter geometry.");

  try {
    const workingLine = clone(line);
    const result = lineSplit(workingLine, clone(splitter));
    if (result.features.length < 2)
      return failure("empty-result", "Splitter does not cut the LineString.");
    result.features = result.features.map((segment, index) => {
      const properties = clone(workingLine.properties ?? {});
      if (properties.id !== undefined)
        properties.id = `${String(properties.id)}:split:${index + 1}`;
      return {
        ...segment,
        ...(workingLine.id !== undefined
          ? { id: `${String(workingLine.id)}:split:${index + 1}` }
          : {}),
        properties,
      };
    });
    return validateResult(result);
  } catch (error) {
    return caughtFailure("Split", error);
  }
}

/** Perform a real polygon overlay union; disconnected inputs become a MultiPolygon. */
export function mergeGeoJSON(
  polygons: FeatureCollection<Polygon | MultiPolygon>,
  properties?: GeoJsonProperties,
): GrowerGeometryResult<Feature<Polygon | MultiPolygon>> {
  const checked = validateInput(polygons);
  if (!checked.ok) return checked;
  if (polygons.features.length < 2)
    return failure(
      "invalid-options",
      "mergeGeoJSON requires at least two polygon features.",
    );
  if (
    polygons.features.some(
      (feature) =>
        feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon",
    )
  )
    return failure(
      "unsupported-geometry",
      "mergeGeoJSON supports only Polygon inputs.",
    );

  try {
    const outputProperties = clone(
      properties ?? polygons.features[0].properties ?? {},
    );
    const result = turfUnion(clone(polygons), {
      properties: outputProperties,
    });
    if (!result)
      return failure("empty-result", "Polygon union produced no geometry.");
    return validateResult(result);
  } catch (error) {
    return caughtFailure("Polygon union", error);
  }
}

/** Simplify line/polygon GeoJSON without mutating input; tolerance is explicitly degrees. */
export function simplifyGeoJSON<T extends SupportedGeoJSON>(
  input: T,
  options: SimplifyGeoJSONOptions,
): GrowerGeometryResult<T> {
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  if (
    !Number.isFinite(options.toleranceDegrees) ||
    options.toleranceDegrees <= 0
  )
    return failure(
      "invalid-options",
      "toleranceDegrees must be a finite number greater than zero.",
    );
  let unsupported: string | null = null;
  forEachGeometry(input, (geometry) => {
    visitGeometryTree(geometry, "geometry", (child) => {
      if (
        child.type !== "LineString" &&
        child.type !== "MultiLineString" &&
        child.type !== "Polygon" &&
        child.type !== "MultiPolygon"
      )
        unsupported = child.type;
    });
  });
  if (unsupported)
    return failure(
      "unsupported-geometry",
      `simplifyGeoJSON does not simplify ${unsupported} geometry.`,
    );

  try {
    const result = turfSimplify(clone(input), {
      tolerance: options.toleranceDegrees,
      highQuality: options.highQuality ?? false,
      mutate: false,
    });
    return validateResult(result);
  } catch (error) {
    return caughtFailure("Simplify", error);
  }
}

/** Return Turf's vertex-mean centroid as a Point feature. */
export function centroidGeoJSON(
  input: SupportedGeoJSON,
  properties: GeoJsonProperties = {},
): GrowerGeometryResult<Feature<Point>> {
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  try {
    const result = turfCentroid(clone(input), {
      properties: clone(properties),
    });
    return validateResult(result);
  } catch (error) {
    return caughtFailure("Centroid", error);
  }
}

/** Return [west, south, east, north], always recomputing stale GeoJSON bbox fields. */
export function boundingBoxGeoJSON(
  input: SupportedGeoJSON,
): GrowerGeometryResult<[number, number, number, number]> {
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  try {
    const bounds = turfBbox(clone(input), { recompute: true }) as BBox;
    if (
      bounds.length !== 4 ||
      bounds.some((coordinate) => !Number.isFinite(coordinate))
    )
      return failure(
        "operation-failed",
        "Bounding box was not a finite 2D extent.",
      );
    return success([bounds[0], bounds[1], bounds[2], bounds[3]]);
  } catch (error) {
    return caughtFailure("Bounding box", error);
  }
}

function lineDistance(coordinates: Position[]): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    total += computePreciseDistance(from[1], from[0], to[1], to[0]).meters;
  }
  return total;
}

function accumulateLinearMeasurements(
  geometry: Geometry,
  measurements: Pick<GeoJSONMeasurements, "lengthMeters" | "perimeterMeters">,
): void {
  switch (geometry.type) {
    case "LineString":
      measurements.lengthMeters += lineDistance(geometry.coordinates);
      break;
    case "MultiLineString":
      geometry.coordinates.forEach((line) => {
        measurements.lengthMeters += lineDistance(line);
      });
      break;
    case "Polygon":
      geometry.coordinates.forEach((ring) => {
        measurements.perimeterMeters += lineDistance(ring);
      });
      break;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) =>
        polygon.forEach((ring) => {
          measurements.perimeterMeters += lineDistance(ring);
        }),
      );
      break;
    case "GeometryCollection":
      geometry.geometries.forEach((child) =>
        accumulateLinearMeasurements(child, measurements),
      );
      break;
  }
}

/** Measure all geometries; holes and multipart members are accumulated. */
export function measureGeoJSON(
  input: SupportedGeoJSON,
): GrowerGeometryResult<GeoJSONMeasurements> {
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  try {
    const measurements: GeoJSONMeasurements = {
      lengthMeters: 0,
      perimeterMeters: 0,
      areaSquareMeters: turfArea(clone(input)),
    };
    forEachGeometry(input, (geometry) =>
      accumulateLinearMeasurements(geometry, measurements),
    );
    if (
      Object.values(measurements).some(
        (measurement) => !Number.isFinite(measurement) || measurement < 0,
      )
    )
      return failure(
        "operation-failed",
        "Measurement produced a non-finite result.",
      );
    return success(measurements);
  } catch (error) {
    return caughtFailure("Measurement", error);
  }
}

function formatQuantity<Unit extends string>(
  value: number,
  unit: Unit,
  formatter: Intl.NumberFormat,
): FormattedQuantity<Unit> {
  return { value, unit, text: `${formatter.format(value)} ${unit}` };
}

/** Convert and format an existing SI measurement result. */
export function formatMeasurements(
  measurements: GeoJSONMeasurements,
  system: MeasurementSystem,
  options: MeasurementFormatOptions = {},
): GrowerGeometryResult<FormattedGeoJSONMeasurements> {
  if (
    Object.values(measurements).some(
      (measurement) => !Number.isFinite(measurement) || measurement < 0,
    )
  )
    return failure(
      "invalid-input",
      "Measurements must contain finite, non-negative SI values.",
    );
  const digits = options.maximumFractionDigits ?? 2;
  if (!Number.isInteger(digits) || digits < 0 || digits > 20)
    return failure(
      "invalid-options",
      "maximumFractionDigits must be an integer from 0 through 20.",
    );

  try {
    const formatter = new Intl.NumberFormat(options.locale, {
      maximumFractionDigits: digits,
    });
    const distance = (meters: number): FormattedQuantity<DistanceUnit> => {
      if (system === "metric") {
        if (options.autoScale && meters >= 1000)
          return formatQuantity(meters / 1000, "km", formatter);
        return formatQuantity(meters, "m", formatter);
      }
      if (options.autoScale && meters >= METERS_PER_MILE)
        return formatQuantity(meters / METERS_PER_MILE, "mi", formatter);
      return formatQuantity(meters * FEET_PER_METER, "ft", formatter);
    };
    const area = (squareMeters: number): FormattedQuantity<AreaUnit> => {
      if (system === "metric") {
        if (options.autoScale && squareMeters >= SQUARE_METERS_PER_HECTARE)
          return formatQuantity(
            squareMeters / SQUARE_METERS_PER_HECTARE,
            "ha",
            formatter,
          );
        return formatQuantity(squareMeters, "m²", formatter);
      }
      if (options.autoScale && squareMeters >= SQUARE_METERS_PER_ACRE)
        return formatQuantity(
          squareMeters / SQUARE_METERS_PER_ACRE,
          "ac",
          formatter,
        );
      return formatQuantity(
        squareMeters * SQUARE_FEET_PER_SQUARE_METER,
        "ft²",
        formatter,
      );
    };

    return success({
      length: distance(measurements.lengthMeters),
      perimeter: distance(measurements.perimeterMeters),
      area: area(measurements.areaSquareMeters),
    });
  } catch (error) {
    return caughtFailure("Measurement formatting", error);
  }
}

function guideFeature<T extends LineString | MultiLineString>(
  feature: Feature<T>,
  guideType: "bed-edge" | "row-spacing",
  offsetMeters: number,
  suffix: string,
): Feature<T> {
  const properties = clone(feature.properties ?? {});
  if (properties.id !== undefined)
    properties.id = `${String(properties.id)}:${suffix}`;
  properties["geokit:guide"] = { type: guideType, offsetMeters };
  return {
    ...feature,
    ...(feature.id !== undefined
      ? { id: `${String(feature.id)}:${suffix}` }
      : {}),
    properties,
  };
}

/** Create the two parallel edge guides for a centerline and full bed width. */
export function createBedWidthGuides<T extends LineString | MultiLineString>(
  centerLine: Feature<T>,
  bedWidthMeters: number,
): GrowerGeometryResult<FeatureCollection<T>> {
  const checked = validateInput(centerLine);
  if (!checked.ok) return checked;
  if (
    centerLine.geometry.type !== "LineString" &&
    centerLine.geometry.type !== "MultiLineString"
  )
    return failure("unsupported-geometry", "Bed guides require line geometry.");
  if (!Number.isFinite(bedWidthMeters) || bedWidthMeters <= 0)
    return failure(
      "invalid-options",
      "bedWidthMeters must be a finite number greater than zero.",
    );

  try {
    const working = clone(centerLine);
    const halfWidth = bedWidthMeters / 2;
    const left = guideFeature(
      lineOffset(working, halfWidth, { units: "meters" }),
      "bed-edge",
      halfWidth,
      "bed-left",
    );
    const right = guideFeature(
      lineOffset(working, -halfWidth, { units: "meters" }),
      "bed-edge",
      -halfWidth,
      "bed-right",
    );
    return validateResult({
      type: "FeatureCollection",
      features: [left, right],
    });
  } catch (error) {
    return caughtFailure("Bed-width guide generation", error);
  }
}

/** Create evenly spaced guide lines on both sides of a baseline. */
export function createRowSpacingGuides<T extends LineString | MultiLineString>(
  baseline: Feature<T>,
  spacingMeters: number,
  options: RowSpacingGuideOptions = {},
): GrowerGeometryResult<FeatureCollection<T>> {
  const checked = validateInput(baseline);
  if (!checked.ok) return checked;
  if (
    baseline.geometry.type !== "LineString" &&
    baseline.geometry.type !== "MultiLineString"
  )
    return failure("unsupported-geometry", "Row guides require line geometry.");
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0)
    return failure(
      "invalid-options",
      "spacingMeters must be a finite number greater than zero.",
    );
  const rowsPerSide = options.rowsPerSide ?? 2;
  if (!Number.isInteger(rowsPerSide) || rowsPerSide < 1 || rowsPerSide > 100)
    return failure(
      "invalid-options",
      "rowsPerSide must be an integer from 1 through 100.",
    );

  try {
    const working = clone(baseline);
    const offsets: number[] = [];
    for (let index = rowsPerSide; index >= 1; index--)
      offsets.push(-index * spacingMeters);
    if (options.includeBaseline ?? true) offsets.push(0);
    for (let index = 1; index <= rowsPerSide; index++)
      offsets.push(index * spacingMeters);

    const features = offsets.map((offsetMeters) => {
      const feature =
        offsetMeters === 0
          ? working
          : lineOffset(working, offsetMeters, { units: "meters" });
      const suffix =
        offsetMeters === 0
          ? "row-center"
          : `row-${offsetMeters < 0 ? "right" : "left"}-${Math.abs(offsetMeters)}`;
      return guideFeature(feature, "row-spacing", offsetMeters, suffix);
    });
    return validateResult({ type: "FeatureCollection", features });
  } catch (error) {
    return caughtFailure("Row-spacing guide generation", error);
  }
}

/** Bake one or more equal-width concentric irrigation zones. */
export function createIrrigationZones(
  center: Position,
  outerRadiusMeters: number,
  options: IrrigationZoneOptions = {},
): GrowerGeometryResult<FeatureCollection<Polygon>> {
  const point: Point = { type: "Point", coordinates: clone(center) };
  const checked = validateInput(point);
  if (!checked.ok) return checked;
  if (!Number.isFinite(outerRadiusMeters) || outerRadiusMeters <= 0)
    return failure(
      "invalid-options",
      "outerRadiusMeters must be a finite number greater than zero.",
    );
  const zoneCount = options.zoneCount ?? 1;
  const steps = options.steps ?? 64;
  if (!Number.isInteger(zoneCount) || zoneCount < 1 || zoneCount > 32)
    return failure(
      "invalid-options",
      "zoneCount must be an integer from 1 through 32.",
    );
  if (!Number.isInteger(steps) || steps < 8 || steps > 256)
    return failure(
      "invalid-options",
      "steps must be an integer from 8 through 256.",
    );

  try {
    const [lng, lat] = center;
    const circles = Array.from({ length: zoneCount }, (_, index) => ({
      getLatLng: () => ({ lat, lng }),
      getRadius: () => (outerRadiusMeters * (index + 1)) / zoneCount,
    }));
    const result = bakeLayerCake({
      circles,
      steps,
    }) as FeatureCollection<Polygon>;
    return validateResult(result);
  } catch (error) {
    return caughtFailure("Irrigation-zone generation", error);
  }
}
