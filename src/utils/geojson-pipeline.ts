import type { Feature, FeatureCollection } from "geojson";
import { v4 as uuidv4 } from "uuid";
import {
  adaptFeatureCollectionForExport,
  expandMultiGeometries,
  normalizeId,
  type GeoJSONExportOptions,
} from "./geojson.js";

export interface GeoJSONDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  path: string;
  message: string;
}
export interface GeoJSONValidationSummary {
  valid: boolean;
  featureCount: number;
  diagnostics: GeoJSONDiagnostic[];
}
export interface GeoJSONNormalizationOptions {
  /** Opt in to Leaflet.draw-compatible single geometries. */
  expandMulti?: boolean;
}
export interface GeoJSONImportResult extends GeoJSONValidationSummary {
  data: FeatureCollection | null;
}
export interface GeoJSONPatch {
  created: Feature[];
  updated: Feature[];
  deleted: string[];
}
export interface GeoJSONDiff extends GeoJSONPatch {
  createdIds: string[];
  updatedIds: string[];
  deletedIds: string[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Structural RFC 7946 preflight; never mutates its input or a map. */
export function validateGeoJSON(input: unknown): GeoJSONValidationSummary {
  const diagnostics: GeoJSONDiagnostic[] = [];
  let featureCount = 0;
  const ids = new Set<string>();
  const report = (
    code: string,
    path: string,
    message: string,
    severity: GeoJSONDiagnostic["severity"] = "error",
  ) => {
    diagnostics.push({ code, path, message, severity });
  };
  const crs = (value: Record<string, unknown>, path: string) => {
    if ("crs" in value)
      report(
        "crs-mismatch",
        `${path}.crs`,
        "RFC 7946 uses WGS84 longitude/latitude; legacy CRS is not reprojected.",
        "warning",
      );
  };
  const position = (value: unknown, path: string) => {
    if (Array.isArray(value) && value.length === 0)
      report("empty-geometry", path, "Point has no coordinates.");
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      !value.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      report(
        "invalid-position",
        path,
        "Expected at least two finite ordinates.",
      );
      return;
    }
    if (Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90)
      report(
        "crs-mismatch",
        path,
        "Position outside WGS84 longitude/latitude range.",
        "warning",
      );
  };
  const array = (
    value: unknown,
    path: string,
    visit: (v: unknown, p: string) => void,
  ) => {
    if (!Array.isArray(value) || value.length === 0) {
      report(
        "empty-geometry",
        path,
        "Expected a non-empty coordinate/geometry array.",
      );
      return;
    }
    value.forEach((v, i) => visit(v, `${path}[${i}]`));
  };
  const line = (value: unknown, path: string) => {
    array(value, path, position);
    if (Array.isArray(value) && value.length < 2)
      report(
        "invalid-line",
        path,
        "LineString requires at least two positions.",
      );
  };
  const ring = (value: unknown, path: string) => {
    array(value, path, position);
    const first = Array.isArray(value) ? value[0] : undefined;
    const last = Array.isArray(value) ? value[value.length - 1] : undefined;
    const closed =
      Array.isArray(first) &&
      Array.isArray(last) &&
      first.length === last.length &&
      first.every((n, i) => n === last[i]);
    if (Array.isArray(value) && (value.length < 4 || !closed))
      report(
        "invalid-ring",
        path,
        "Linear rings require four positions and exact closure.",
      );
  };
  const polygon = (value: unknown, path: string) => array(value, path, ring);
  const geometry = (value: unknown, path: string, depth: number) => {
    if (depth > 64) {
      report("nesting-limit", path, "Geometry nesting exceeds 64.");
      return;
    }
    if (!record(value)) {
      report("empty-geometry", path, "Missing or null geometry.");
      return;
    }
    crs(value, path);
    const coords = `${path}.coordinates`;
    switch (value.type) {
      case "Point":
        position(value.coordinates, coords);
        break;
      case "LineString":
        line(value.coordinates, coords);
        break;
      case "Polygon":
        polygon(value.coordinates, coords);
        break;
      case "MultiPoint":
        array(value.coordinates, coords, position);
        break;
      case "MultiLineString":
        array(value.coordinates, coords, line);
        break;
      case "MultiPolygon":
        array(value.coordinates, coords, polygon);
        break;
      case "GeometryCollection":
        array(value.geometries, `${path}.geometries`, (v, p) =>
          geometry(v, p, depth + 1),
        );
        break;
      default:
        report(
          "unsupported-geometry",
          path,
          `Unsupported geometry: ${typeof value.type === "string" ? value.type : "missing or non-string type"}.`,
        );
    }
    if (
      typeof value.type === "string" &&
      (value.type.startsWith("Multi") || value.type === "GeometryCollection")
    )
      report(
        "multi-expansion",
        path,
        "Editing adapters expand this geometry into single-geometry features.",
        "info",
      );
  };
  const feature = (value: unknown, path: string) => {
    featureCount++;
    if (!record(value) || value.type !== "Feature") {
      report("invalid-feature", path, "Expected a Feature.");
      return;
    }
    crs(value, path);
    if (!(value.properties === null || record(value.properties)))
      report(
        "invalid-properties",
        `${path}.properties`,
        "Expected an object or null.",
      );
    if (record(value.properties)) {
      const fallback = value.properties.id;
      if (
        value.id === undefined &&
        fallback !== undefined &&
        !(typeof fallback === "string" && fallback.length > 0) &&
        !(typeof fallback === "number" && Number.isFinite(fallback))
      )
        report(
          "invalid-id",
          `${path}.properties.id`,
          "Fallback ID must be a non-empty string or finite number.",
        );
      const sources = value.properties["geokit:source"];
      if (
        sources !== undefined &&
        (!Array.isArray(sources) ||
          sources.length === 0 ||
          sources.length > 64 ||
          !sources.every(
            (s) =>
              record(s) &&
              typeof s.type === "string" &&
              [
                "MultiPoint",
                "MultiLineString",
                "MultiPolygon",
                "GeometryCollection",
              ].includes(s.type) &&
              (typeof s.id === "string" || typeof s.id === "number") &&
              typeof s.hasPropertyId === "boolean" &&
              typeof s.nullProperties === "boolean",
          ))
      )
        report(
          "invalid-provenance",
          `${path}.properties.geokit:source`,
          "Reserved expansion provenance is malformed.",
        );
    }
    if (
      value.id !== undefined &&
      !(typeof value.id === "string" && value.id.length > 0) &&
      !(typeof value.id === "number" && Number.isFinite(value.id))
    )
      report(
        "invalid-id",
        `${path}.id`,
        "Feature ID must be a non-empty string or finite number.",
      );
    const candidate =
      value.id ?? (record(value.properties) ? value.properties.id : undefined);
    const id =
      typeof candidate === "string" || typeof candidate === "number"
        ? String(candidate)
        : undefined;
    if (id !== undefined) {
      if (ids.has(id))
        report("duplicate-id", `${path}.id`, `Duplicate feature ID: ${id}.`);
      ids.add(id);
    }
    geometry(value.geometry, `${path}.geometry`, 0);
  };
  // Guard serialization so cyclic/non-JSON metadata cannot fail later, after mutation.
  const active = new Set<object>();
  let unsafeGraph = false;
  const json = (value: unknown, path: string, depth: number): void => {
    if (depth > 128) {
      unsafeGraph = true;
      report("nesting-limit", path, "JSON nesting exceeds 128.");
      return;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || value === null || active.has(value)) {
      if (typeof value === "object" && value !== null && active.has(value))
        unsafeGraph = true;
      report("invalid-json", path, "Expected finite, acyclic JSON values.");
      return;
    }
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      report("invalid-json", path, "Expected a plain JSON object.");
      return;
    }
    active.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++)
        json(value[i], `${path}[${i}]`, depth + 1);
    } else
      Object.entries(value).forEach(([k, v]) =>
        json(v, `${path}.${k}`, depth + 1),
      );
    active.delete(value);
  };
  json(input, "$", 0);
  // Do not traverse rejected graphs again: branching cycles can otherwise
  // multiply geometry visits exponentially before the depth guard is reached.
  if (unsafeGraph) return { valid: false, featureCount, diagnostics };
  if (!record(input))
    report("invalid-input", "$", "Expected a GeoJSON object.");
  else if (input.type === "FeatureCollection") {
    crs(input, "$");
    if (!Array.isArray(input.features))
      report("invalid-collection", "$.features", "Expected a features array.");
    else input.features.forEach((f, i) => feature(f, `$.features[${i}]`));
  } else if (input.type === "Feature") feature(input, "$");
  else {
    featureCount = 1;
    geometry(input, "$", 0);
  }
  return {
    valid: !diagnostics.some((d) => d.severity === "error"),
    featureCount,
    diagnostics,
  };
}

export class GeoJSONValidationError extends Error {
  constructor(public readonly summary: GeoJSONValidationSummary) {
    super("GeoJSON validation failed");
    this.name = "GeoJSONValidationError";
  }
}

/** Wrap app shapes, clone metadata, assign missing IDs once, optionally expand. */
export function normalizeGeoJSON(
  input: unknown,
  options: GeoJSONNormalizationOptions = {},
): FeatureCollection {
  const summary = validateGeoJSON(input);
  if (!summary.valid) throw new GeoJSONValidationError(summary);
  const value = clone(input) as
    | FeatureCollection
    | Feature
    | Feature["geometry"];
  const fc: FeatureCollection =
    value.type === "FeatureCollection"
      ? value
      : {
          type: "FeatureCollection",
          features: [
            value.type === "Feature"
              ? value
              : { type: "Feature", properties: {}, geometry: value },
          ],
        };
  for (const f of fc.features) f.id = f.id ?? normalizeId(f) ?? uuidv4();
  const result = options.expandMulti
    ? expandMultiGeometries(fc, { preserveMetadata: true })
    : fc;
  const checked = validateGeoJSON(result);
  if (!checked.valid) throw new GeoJSONValidationError(checked);
  return clone(result);
}

export function importGeoJSONData(
  input: unknown,
  options: GeoJSONNormalizationOptions = {},
): GeoJSONImportResult {
  const summary = validateGeoJSON(input);
  if (!summary.valid) return { ...summary, data: null };
  try {
    return { ...summary, data: normalizeGeoJSON(input, options) };
  } catch (error) {
    if (error instanceof GeoJSONValidationError)
      return { ...error.summary, data: null };
    throw error;
  }
}

export function importGeoJSONText(
  text: string,
  options: GeoJSONNormalizationOptions = {},
): GeoJSONImportResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      valid: false,
      featureCount: 0,
      data: null,
      diagnostics: [
        {
          severity: "error",
          code: "invalid-json",
          path: "$",
          message: "Unable to parse JSON text.",
        },
      ],
    };
  }
  return importGeoJSONData(value, options);
}

/** Validate export too; source mode refuses divergent child properties rather than losing edits. */
export function exportGeoJSONData(
  input: FeatureCollection,
  options: GeoJSONExportOptions = {},
): GeoJSONImportResult {
  const summary = validateGeoJSON(input);
  if (!summary.valid) return { ...summary, data: null };
  if (options.adapter === "source") {
    const groups = new Map<string, string>();
    for (const [i, f] of input.features.entries()) {
      const sources = f.properties?.["geokit:source"];
      if (!Array.isArray(sources) || !sources.length) continue;
      const key = String(sources[0]?.id);
      const properties = { ...f.properties };
      delete properties.id;
      delete properties["geokit:source"];
      const serialized = canonical(properties);
      if (groups.has(key) && groups.get(key) !== serialized)
        summary.diagnostics.push({
          severity: "error",
          code: "metadata-conflict",
          path: `$.features[${i}].properties`,
          message:
            "Expanded children have divergent properties; export editing data or reconcile before source export.",
        });
      groups.set(key, serialized);
    }
  }
  summary.valid = !summary.diagnostics.some((d) => d.severity === "error");
  if (!summary.valid) return { ...summary, data: null };
  const data = adaptFeatureCollectionForExport(clone(input), {
    ...options,
    provenanceOnly: true,
  });
  const output = validateGeoJSON(data);
  return {
    ...output,
    diagnostics: [...summary.diagnostics, ...output.diagnostics],
    data: output.valid ? data : null,
  };
}

/** Explicit URL adapter: no implicit fetching of arbitrary strings. Fetch errors reject. */
export async function importGeoJSONURL(
  url: string | URL,
  options: GeoJSONNormalizationOptions & {
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
): Promise<GeoJSONImportResult> {
  const response = await (options.fetcher ?? fetch)(url, {
    signal: options.signal,
  });
  if (!response.ok)
    throw new Error(`GeoJSON fetch failed: HTTP ${response.status}`);
  return importGeoJSONText(await response.text(), options);
}

function indexed(input: unknown): Map<string, Feature> {
  const summary = validateGeoJSON(input);
  if (!summary.valid) throw new GeoJSONValidationError(summary);
  const fc = input as FeatureCollection;
  if (fc.type !== "FeatureCollection")
    throw new Error("Diff/patch requires a FeatureCollection.");
  return new Map(
    fc.features.map((f) => {
      const id = normalizeId(f);
      if (id === undefined)
        throw new Error(
          "Diff/patch requires stable feature IDs; normalize once before editing.",
        );
      return [id, f];
    }),
  );
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** ID-based, order-insensitive comparison; property and geometry edits both count. */
export function diffGeoJSON(
  before: FeatureCollection,
  after: FeatureCollection,
): GeoJSONDiff {
  const old = indexed(before),
    next = indexed(after);
  const created: Feature[] = [],
    updated: Feature[] = [],
    deleted: string[] = [];
  for (const [id, f] of next) {
    if (!old.has(id)) created.push(clone(f));
    else if (canonical(old.get(id)) !== canonical(f)) updated.push(clone(f));
  }
  for (const id of old.keys()) if (!next.has(id)) deleted.push(id);
  return {
    created,
    updated,
    deleted,
    createdIds: created.map((f) => normalizeId(f)!),
    updatedIds: updated.map((f) => normalizeId(f)!),
    deletedIds: [...deleted],
  };
}

/** Strict, atomic pure patch: reject missing targets, duplicate operations and creates. */
export function applyGeoJSONPatch(
  base: FeatureCollection,
  patch: GeoJSONPatch,
): FeatureCollection {
  const next = indexed(base);
  if (
    !patch ||
    !Array.isArray(patch.created) ||
    !Array.isArray(patch.updated) ||
    !Array.isArray(patch.deleted)
  )
    throw new Error("Malformed GeoJSON patch.");
  const touched = new Set<string>();
  const touch = (id: string) => {
    if (touched.has(id)) throw new Error(`Conflicting patch operations: ${id}`);
    touched.add(id);
  };
  for (const id of patch.deleted) {
    if (typeof id !== "string") throw new Error("Deleted IDs must be strings.");
    touch(id);
    if (!next.delete(id)) throw new Error(`Missing deleted feature: ${id}`);
  }
  for (const [kind, features] of [
    ["created", patch.created],
    ["updated", patch.updated],
  ] as const) {
    const entries = indexed({ type: "FeatureCollection", features });
    for (const [id, f] of entries) {
      touch(id);
      if (kind === "created" ? next.has(id) : !next.has(id))
        throw new Error(`Invalid ${kind} target: ${id}`);
      next.set(id, f);
    }
  }
  return clone({ ...base, features: [...next.values()] });
}
