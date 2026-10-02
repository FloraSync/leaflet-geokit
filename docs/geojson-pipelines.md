# GeoJSON pipelines

GeoKit exports `validateGeoJSON`, `normalizeGeoJSON`, `diffGeoJSON`,
`applyGeoJSONPatch`, `importGeoJSONData`, `importGeoJSONText`,
`importGeoJSONURL`, and `exportGeoJSONData` from the main and external entrypoints.
The helpers are framework-agnostic TypeScript and do not mutate a map or their
inputs. Package entrypoints register the web component and therefore require a
browser; these are not advertised as SSR entrypoints.

## Reject uploads before changing the map

```ts
import {
  importGeoJSONText,
  exportGeoJSONData,
  diffGeoJSON,
  applyGeoJSONPatch,
} from "@florasync/leaflet-geokit";

const upload = importGeoJSONText(fileText);
if (!upload.valid || !upload.data) {
  showUploadErrors(upload.diagnostics);
  return;
}
// CRS warnings are non-fatal. Your host may reject them too.
if (upload.diagnostics.some((d) => d.code === "crs-mismatch")) return;
await map.importGeoJSON(upload.data, { validate: true, fitToData: true });
const saved = structuredClone(await map.getGeoJSON());
// Later, after drawing/editing:
const current = await map.getGeoJSON();
const diff = diffGeoJSON(saved, current);
showSavePrompt(diff.createdIds, diff.updatedIds, diff.deletedIds);
const nextSaved = applyGeoJSONPatch(saved, diff);
const source = exportGeoJSONData(nextSaved, { adapter: "source" });
if (source.valid) persist(source.data);
else showUploadErrors(source.diagnostics);
```

The illustrative host functions above are app-owned, not GeoKit APIs.

- `validateGeoJSON(unknown)` returns `{ valid, featureCount, diagnostics }`.
  Each diagnostic has `severity`, `code`, `path`, and `message`.
- `importGeoJSONData(unknown)` accepts a Feature, FeatureCollection, or bare
  geometry and returns the summary plus `data: FeatureCollection | null`.
- `importGeoJSONText(text)` parses JSON and returns `invalid-json` on parse errors.
- `importGeoJSONURL(url, { signal, fetcher })` fetches explicitly. Abort/network
  failures and non-2xx HTTP responses reject; invalid JSON/data returns the
  validation summary. The host owns URL trust, CORS, request timeouts and upload
  size limits. Strings are never implicitly fetched.
- `normalizeGeoJSON(input, { expandMulti: false })` wraps the common shapes,
  deep-clones JSON properties/coordinates, preserves supplied root IDs, and
  assigns UUIDs to missing IDs (falling back to `properties.id`). Normalize once
  and retain that snapshot: re-normalizing ID-less data generates new IDs.
  Invalid input throws `GeoJSONValidationError` with a `.summary`.
- `{ expandMulti: true }` additionally creates single-geometry editing features,
  including recursively nested GeometryCollections. Expansion collisions are
  rejected. Each expanded child gets an isolated copy of app metadata.
- `map.importGeoJSON(fc, { validate: true })` validates and expands before any
  replace/clear operation. Add mode also rejects IDs already present in the map.
  The preflight runs after the ingest hook, so hook-modified data is checked.
  This is opt-in for backwards compatibility; old import calls retain their
  permissive behavior. These guarantees cover data-validation failures, not
  arbitrary Leaflet/rendering failures.

## Diagnostics and limits

Ingest and export summaries report invalid rings (minimum four positions and
exact closure), invalid positions/lines, unsupported geometry, empty/null
geometry, malformed JSON/properties/IDs, duplicate IDs, and malformed reserved
provenance. Multi geometries and GeometryCollections emit `multi-expansion`
information. Legacy `crs` declarations and out-of-range WGS84 coordinates emit
`crs-mismatch` warnings: GeoKit does not reproject or guess coordinate order.
An empty FeatureCollection is valid; an empty geometry is not editable and is
rejected. Cycles, non-finite values, sparse arrays, non-JSON metadata and excessive
nesting are rejected.

Validation is structural, not a GIS topology engine: it does not detect every
self-intersection, validate hole containment, repair rings, change winding,
reproject, or simplify geometry. Hosts needing those policies must apply a
separate topology validator. Normalization never silently repairs invalid data.

## Metadata and source round trips

App-owned JSON belongs in `properties`; nested records and arrays are preserved.
All `geokit:*` property names are reserved for library use. Currently
`properties["geokit:source"]` is an internal provenance stack created by validated
Multi/collection expansion. Preserve it while editing; do not author or modify
it. It records source IDs, source geometry types, and the original `properties.id`
state. It contains no cached coordinates: source export reconstructs from the
current visible editing geometry, preserving singleton Multi types and nested
collection structure. Removed children stay removed; removing every child
removes the source feature.

Editing IDs are `sourceId::childIndex` (nested paths append another `::index`).
The existing map store uses string IDs, including for numeric root IDs.
Provenance-backed source export restores the original numeric Multi source ID
and original app-owned `properties.id`. For simple non-expanded features the
store's established string-ID behavior is unchanged. Diff ID lists are always
strings; `1` and `"1"` identify the same feature and cannot coexist.

`exportGeoJSONData(fc, { adapter: "source" })` returns the same summary/data shape
as the import helpers. It collapses only explicit provenance, not arbitrary app
IDs ending in `::0`. If sibling properties have diverged, it returns
`metadata-conflict` rather than silently discarding one child's edits. Reconcile
those properties or export the editing collection (the default adapter). It also
validates the reconstructed output. Legacy `map.exportGeoJSON({adapter:"source"})`
retains historical suffix inference and first-child metadata behavior; use the
new diagnostic helper for safe persistence. GeoJSON foreign members and cached
`bbox` values are not promised across Multi expansion; keep application data
under `properties` rather than foreign top-level fields.

Existing irrigation drawing, tool events, and layer-cake generation remain in
place; this pipeline wraps the existing expansion/export implementation rather
than introducing another map or drawing engine.

## Diff and patch contract

`diffGeoJSON(before, after)` requires valid FeatureCollections with stable unique
IDs. It returns `created`, `updated` (complete feature payloads), and `deleted`
(string IDs), plus `createdIds`, `updatedIds`, and `deletedIds` for save prompts.
Geometry and metadata changes count; object-key and feature-array order do not.
Feature reordering and collection-level foreign-member changes are not tracked.

`applyGeoJSONPatch(base, patch)` is pure and atomic: it returns a deep-cloned
collection and never mutates `base`. Creates must be absent, updates/deletes must
exist, and operations may not overlap. It validates all feature payloads and
rejects conflicts. Existing feature order is retained; new features are appended.
This is an ID-based local patch format, not RFC 6902, a server transaction, or an
optimistic concurrency protocol. The host owns revision checks when saving.

## Verification

```sh
npm run test:unit:focused -- tests/geojson-pipeline.spec.ts tests/geojson.spec.ts tests/geojson-more.spec.ts tests/geojson-merge.spec.ts tests/map-controller.spec.ts
npm run typecheck
npm run test:e2e -- e2e/geojson-pipeline.spec.ts --workers=1
```

The Playwright test uses the existing irrigation harness with real Leaflet
markers. It proves invalid replacement and duplicate-ID add rejection, edits a
visible marker through Leaflet's draw-edited event, compares visible coordinates
with export, checks nested app metadata/numeric source ID restoration, and
applies the save-prompt diff back to the baseline. In shared workspaces, pass
`--output="$PAPERCLIP_RUN_SCRATCH_DIR/geojson-playwright"` to avoid another run's
Playwright output directory.
