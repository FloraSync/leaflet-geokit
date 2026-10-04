# Public API reference

This reference describes the framework-independent `<leaflet-geokit>` custom element.
`<leaflet-draw-map>` remains a compatibility alias. Import
`@florasync/leaflet-geokit` to register the bundled element; the `/external`
entrypoint is for hosts supplying Leaflet/Draw. Registration requires browser
DOM globals: defer imports to the client in SSR applications.

Contracts: [public types](../src/types/public.ts), [event types](../src/types/events.ts),
[element implementation](../src/components/LeafletDrawMapElement.ts), and
[package exports](../src/index.ts). Framework wrappers are optional; see
[React](shims/react.md), [Preact](shims/preact.md), and [Django](shims/django.md).

## Readiness and sizing

Give the element a nonzero width and height. Subscribe directly on the element
before connecting it when initial events matter. `customElements.whenDefined()`
means the class is registered, not that its map is initialized. Observe
`leaflet-geokit:status` and read `status` for durable readiness; the legacy
`leaflet-draw:ready` callback fires before the asynchronous status synchronization
finishes. In particular, wait for `status.ready` before `setBasemapAdapter()`.

```js
import "@florasync/leaflet-geokit";

const map = document.createElement("leaflet-geokit");
map.style.cssText = "width:100%;height:400px";
map.setAttribute("draw-polygon", "");
map.addEventListener("leaflet-geokit:status", (event) => {
  console.log(event.detail.state, event.detail.featureCount);
});
map.addEventListener("leaflet-draw:created", (event) => {
  console.log(event.detail.id, event.detail.geoJSON);
});
document.body.append(map);
```

Do not use pre-ready mutation calls as a queue: many methods return empty results
or do nothing without a controller. Tool activation returns `false` with failure
events; `setBasemapAdapter()` throws when not ready. Disconnect destroys the map;
reapply host data and an optional adapter after reconnecting.

## Attributes and reflected properties

Boolean attributes use **presence**, not string values: `read-only="false"`
still enables read-only. Remove the attribute or set its boolean property to
`false`. A dash below means there is no corresponding scalar property; use
`setAttribute`/`removeAttribute` or the listed object configuration instead.

| Attribute                                                                       | Property                             | Value / default / behavior                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `latitude`, `longitude`                                                         | `latitude`, `longitude`              | Numbers; both default to `0`. Runtime changes update the view.                                                                                                                                                                        |
| `zoom`                                                                          | `zoom`                               | Number; default `2`.                                                                                                                                                                                                                  |
| `min-zoom`, `max-zoom`                                                          | `minZoom`, `maxZoom`                 | Optional numbers; unset by default.                                                                                                                                                                                                   |
| `tile-url`                                                                      | `tileUrl`                            | Default `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Used when no named provider is configured.                                                                                                                              |
| `tile-attribution`                                                              | `tileAttribution`                    | Optional attribution string; trusted HTML passed to Leaflet.                                                                                                                                                                          |
| `tile-provider`                                                                 | `tileProvider`                       | Optional `osm` or `here`; trimmed/lowercased. Clear it to use `tile-url`.                                                                                                                                                             |
| `tile-style`                                                                    | `tileStyle`                          | Optional provider style; HERE defaults to `lite.day`.                                                                                                                                                                                 |
| `api-key`, `here-api-key`                                                       | `apiKey`                             | Canonical key and legacy alias. Nonempty canonical value wins; setting `apiKey` removes the legacy attribute. Browser-visible, not secret storage.                                                                                    |
| `read-only`                                                                     | `readOnly`                           | Boolean; default `false`. Restricts interactive mutating tools, not a server authorization boundary.                                                                                                                                  |
| `log-level`                                                                     | `logLevel`                           | `trace`, `debug`, `info`, `warn`, `error`, `silent`; default `debug`.                                                                                                                                                                 |
| `dev-overlay`                                                                   | `devOverlay`                         | Boolean; default `false`. Reserved compatibility flag, not an overlay UI.                                                                                                                                                             |
| `prefer-canvas`                                                                 | `preferCanvas`                       | Boolean; initial default `true`. Presence is true even for `"false"`; set `map.preferCanvas = false` before connection to request SVG. This accessor exists on the concrete class, but is not declared in `LeafletDrawMapElementAPI`. |
| `use-external-leaflet`                                                          | `useExternalLeaflet`                 | Boolean; default `false`. Prefer supplied Leaflet/Draw runtime.                                                                                                                                                                       |
| `skip-leaflet-styles`                                                           | `skipLeafletStyles`                  | Boolean; default `false`. Host takes responsibility for CSS/icon injection; global document CSS alone does not style shadow contents.                                                                                                 |
| `theme-url`                                                                     | —                                    | Optional stylesheet URL inserted into the shadow root.                                                                                                                                                                                |
| `marker-icon-url`                                                               | —                                    | Custom marker URL; absent/invalid uses default marker. See `markerIconConfig`.                                                                                                                                                        |
| `marker-icon-retina-url`                                                        | —                                    | Optional high-DPI URL; fallback is the regular icon URL.                                                                                                                                                                              |
| `marker-shadow-url`                                                             | —                                    | Optional shadow URL; absent/invalid omits shadow.                                                                                                                                                                                     |
| `marker-icon-size`                                                              | —                                    | Comma-separated width,height in CSS pixels; default `25,41`.                                                                                                                                                                          |
| `marker-icon-anchor`                                                            | —                                    | Comma-separated x,y; default `12,41`.                                                                                                                                                                                                 |
| `marker-popup-anchor`                                                           | —                                    | Comma-separated x,y; default `1,-34`.                                                                                                                                                                                                 |
| `tool-button-config`                                                            | `toolButtonConfig` (object override) | JSON object keyed by tool name; icons, accessible labels, popovers, disabled state, prerequisites.                                                                                                                                    |
| `toolbar-groups`                                                                | `toolbarGroups` (object override)    | JSON array of groups; default no custom groups. A group needs `id` and `tools`.                                                                                                                                                       |
| `draw-polygon`, `draw-polyline`, `draw-rectangle`, `draw-circle`, `draw-marker` | —                                    | Boolean tool enables; absent by default.                                                                                                                                                                                              |
| `draw-layer-cake`, `draw-move`, `draw-ruler`                                    | —                                    | Boolean enables for `layerCake`, `move`, `ruler`; absent by default.                                                                                                                                                                  |
| `edit-features`, `delete-features`                                              | —                                    | Boolean enables; absent by default. Delete also requires `edit-features`.                                                                                                                                                             |
| `polygon-allow-intersection`                                                    | —                                    | Boolean; default `false`. Set before initialization; changing it alone does not trigger a controller rebuild.                                                                                                                         |

View changes are applied directly; structural changes (draw toggles, read-only,
zoom limits and runtime flags) serialize controller rebuilds. Tile configuration
updates the basemap. Prefer configuration before connection over repeated
structural changes. Do not infer new properties by camel-casing attributes.

## Object and property-only configuration

| Property             | Type / semantics                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`             | Read-only detached `StatusEventDetail`; see [diagnostics](diagnostics.md).                                                                                  |
| `themeCss`           | String; default empty. Injects inline CSS into the shadow root; does not reflect an attribute.                                                              |
| `markerIconConfig`   | `MarkerIconConfig \| null \| undefined`; `undefined` uses attributes, `null` forces default markers.                                                        |
| `toolButtonConfig`   | `ToolButtonConfig \| null \| undefined`; `undefined` uses JSON attribute, `null` clears customization. Functions/renderers require this property, not JSON. |
| `toolbarGroups`      | `ToolToolbarGroupConfig[] \| null \| undefined`; `undefined` uses JSON attribute, `null` clears groups.                                                     |
| `snapping`           | `SnappingOptions \| null \| undefined`; opt-in vertex/edge/grid/guide snapping.                                                                             |
| `measurementOverlay` | `MeasurementOverlayOptions \| null \| undefined`; opt-in live measurements.                                                                                 |
| `leafletInstance`    | Optional Leaflet namespace injection; set before connecting, with compatible Draw plugins attached.                                                         |
| `toolHooks`          | `IntegratedToolHooks`; callbacks keyed by integrated event name.                                                                                            |
| `toolEventEmitter`   | `IntegratedToolEventEmitter`; optional `emit(eventName, detail)` and/or `dispatchEvent(event)`.                                                             |

Configuration interfaces, including all callback signatures, are in
[public.ts](../src/types/public.ts). See [snapping and measurements](snapping-and-measurements.md)
for options/limits, [toolbar styling](toolbar-styling.md) for icons/popovers/slots,
and [responsive layout](toolbar-layout.md) for zones and map-width breakpoints.
Only trusted/sanitized host content belongs in `iconHtml`, popover `html`, CSS,
render callbacks, or attribution HTML.

## Methods

`FC` below means GeoJSON `FeatureCollection`; `Feature` and configuration types
are exported from the package. GeoJSON positions are `[longitude, latitude]`;
view/bounds methods use latitude first. Methods returning promises must be awaited
and may reject; see [diagnostics](diagnostics.md).

| Method                                | Return                              | Contract                                                                                                                                |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `getGeoJSON()`                        | `Promise<FC>`                       | Current editing collection.                                                                                                             |
| `importGeoJSON(fc, options?)`         | `Promise<string[]>`                 | Import with `GeoJSONImportOptions`; default behavior `replace`, `fitToData: false`. Opt into `validate: true` for preflight validation. |
| `loadGeoJSON(fc)`                     | `Promise<void>`                     | Compatibility replacement import.                                                                                                       |
| `addFeatures(fc)`                     | `Promise<string[]>`                 | Compatibility additive import; returns assigned IDs.                                                                                    |
| `loadGeoJSONFromUrl(url, options?)`   | `Promise<void>`                     | Fetch JSON then import; default replace, `fitToData: true`.                                                                             |
| `loadGeoJSONFromText(text, options?)` | `Promise<void>`                     | Parse then import; default replace, `fitToData: true`.                                                                                  |
| `exportGeoJSON(options?)`             | `Promise<FC>`                       | `GeoJSONExportOptions`; default adapter `editing`; emits `leaflet-draw:export`.                                                         |
| `clearLayers()`                       | `Promise<void>`                     | Clear stored/rendered features.                                                                                                         |
| `updateFeature(id, feature)`          | `Promise<void>`                     | Update by stable string ID.                                                                                                             |
| `removeFeature(id)`                   | `Promise<void>`                     | Remove by ID.                                                                                                                           |
| `fitBoundsToData(padding?)`           | `Promise<void>`                     | Fit stored data; padding ratio defaults to `0.05`.                                                                                      |
| `fitBounds(bounds, padding?)`         | `Promise<void>`                     | Bounds `[[south, west], [north, east]]`; padding ratio defaults to `0.05`.                                                              |
| `setView(lat, lng, zoom?)`            | `Promise<void>`                     | Set view and reflect coordinate/zoom properties.                                                                                        |
| `mergePolygons(options?)`             | `Promise<string \| null>`           | Merge visible polygon layers, replacing originals; optional `properties` record; emits merged event on success.                         |
| `getLayers()`                         | `MapLayer[]`                        | Layer inventory.                                                                                                                        |
| `setLayerVisibility(id, visible)`     | `Promise<void>`                     | Change layer visibility.                                                                                                                |
| `setLayerStyle(id, style)`            | `Promise<void>`                     | Apply `LayerStyle`.                                                                                                                     |
| `reorderLayers(ids)`                  | `Promise<void>`                     | Reorder using readonly string IDs.                                                                                                      |
| `focusLayer(id)`                      | `Promise<void>`                     | Focus a layer.                                                                                                                          |
| `removeLayer(id)`                     | `Promise<void>`                     | Remove a named layer.                                                                                                                   |
| `getLayerCakeSession()`               | `LayerCakeSession \| null`          | Current session snapshot.                                                                                                               |
| `updateLayerCakeSession(update)`      | `Promise<void>`                     | Apply `LayerCakeSessionUpdate`.                                                                                                         |
| `saveLayerCakeSession()`              | `Promise<void>`                     | Commit the current session.                                                                                                             |
| `cancelLayerCakeSession()`            | `Promise<void>`                     | Cancel the current session.                                                                                                             |
| `getToolCapabilities()`               | `ToolCapabilities`                  | Detached synchronous snapshot, including before readiness.                                                                              |
| `setToolSelection(featureIds)`        | `void`                              | Supply readonly host-selected IDs; unknown/deleted IDs excluded.                                                                        |
| `activateTool(tool, options?)`        | `Promise<boolean>`                  | Command accepted/handled, not proof of completed geometry. Options: `source`, `groupId`, `commandId`.                                   |
| `triggerTool(tool, options?)`         | `Promise<boolean>`                  | Compatibility alias of `activateTool`.                                                                                                  |
| `deactivateTool(options?)`            | `Promise<boolean>`                  | Return to select mode.                                                                                                                  |
| `setMeasurementUnits(system)`         | `Promise<void>`                     | `metric` or `imperial`.                                                                                                                 |
| `getSnappingOptions()`                | `SnappingOptions \| null`           | Current snap configuration.                                                                                                             |
| `getMeasurementOverlayOptions()`      | `MeasurementOverlayOptions \| null` | Current overlay configuration.                                                                                                          |
| `setBasemapAdapter(adapter)`          | `void`                              | After ready, set `BasemapAdapter`; `null` restores raster configuration.                                                                |
| `getProviderDiagnostics()`            | `ProviderDiagnostics \| null`       | Configuration report, not service-health probe.                                                                                         |

Detailed data semantics: [GeoJSON pipelines](geojson-pipelines.md),
[layers and cake sessions](layers.md), [providers](providers.md).
The URL/text convenience methods currently forward `behavior` and `fitToData`,
not `validate`; for validated uploads use the pipeline helpers followed by
`importGeoJSON(data, { validate: true })`. Legacy source export and the diagnostic
`exportGeoJSONData` helper have different provenance guarantees; consult the
pipeline guide before persisting source geometry.

## Events

These are DOM `CustomEvent`s: payloads live in `event.detail`, not on the event
itself. Listen on the element for compatibility across every family. Legacy draw,
status, and diagnostic events are not bubbling/composed; public lifecycle,
capability, and layer events are bubbling/composed. Provider events bubble but
are not composed. Do not assume all events can be delegated across shadow roots.

| Event                                                                                                                                                                                               | Detail / use                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `leaflet-draw:ready`                                                                                                                                                                                | `ReadyEventDetail`: optional bounds.                                                               |
| `leaflet-draw:created`                                                                                                                                                                              | `CreatedEventDetail`: `id`, `layerType`, `geoJSON` Feature.                                        |
| `leaflet-draw:edited`, `leaflet-draw:deleted`                                                                                                                                                       | `EditedEventDetail` / `DeletedEventDetail`: `ids`, current `geoJSON` FC.                           |
| `leaflet-draw:ingest`                                                                                                                                                                               | `IngestEventDetail`: mutable `fc`, `mode: "load" \| "add"`; synchronous pre-import transform hook. |
| `leaflet-draw:export`                                                                                                                                                                               | `ExportEventDetail`: `geoJSON`, `featureCount`, `adapter`.                                         |
| `leaflet-draw:merged`                                                                                                                                                                               | `id`, `mergedFeatureCount`, resulting `geoJSON`.                                                   |
| `leaflet-draw:error`                                                                                                                                                                                | `ErrorEventDetail`: code/message/recoverability/timestamp and optional cause.                      |
| `leaflet-geokit:status`                                                                                                                                                                             | `StatusEventDetail`; same shape as `status`.                                                       |
| `leaflet-geokit:diagnostic`                                                                                                                                                                         | `DiagnosticEventDetail`; severity/state plus error summary.                                        |
| `tile-provider-error`, `tile-provider-changed`                                                                                                                                                      | `TileProviderErrorDetail` / `TileProviderChangedDetail`; see diagnostics/provider guide.           |
| `leaflet-geokit:tool-command`                                                                                                                                                                       | Input `ToolCommandEventDetail`, normalized to correlated `ToolEventDetail`.                        |
| `leaflet-geokit:tool-commanded`, `leaflet-geokit:tool-started`, `leaflet-geokit:tool-completed`, `leaflet-geokit:tool-cancelled`, `leaflet-geokit:tool-failed`, `leaflet-geokit:tool-state-changed` | `ToolEventDetail`; canonical lifecycle, command IDs, geometry and failure/cancel reason.           |
| `leaflet-geokit:tool-capabilities-changed`                                                                                                                                                          | `ToolCapabilities`; change-deduplicated snapshot. Read initial snapshot after subscribing.         |
| `leaflet-geokit:tool-trigger-requested`, `leaflet-geokit:tool-triggered`, `leaflet-geokit:tool-trigger-failed`                                                                                      | Compatibility `ToolTriggerEventDetail`; includes `handled` and optional `error`.                   |
| `leaflet-geokit:layers-changed`                                                                                                                                                                     | Layer inventory change; [layer payload contract](layers.md).                                       |
| `leaflet-geokit:layer-style-request`                                                                                                                                                                | Cancelable host style request; `preventDefault()` claims it instead of the fallback panel.         |
| `tool:layer-cake:session-started`, `tool:layer-cake:session-changed`, `tool:layer-cake:saved`, `tool:layer-cake:cancelled`                                                                          | Layer-cake session events; [layers](layers.md).                                                    |

Compatibility command inputs `leaflet-geokit:activate-tool`,
`leaflet-geokit:trigger-tool`, and `leaflet-geokit:deactivate-tool` remain supported.
The full lifecycle ordering and per-tool completion matrix are in
[tool lifecycle](tool-lifecycle.md). Additional integrated hook/emitter names
(`tool:polygon:created`, `tool:polyline:created`, `tool:rectangle:created`,
`tool:circle:created`, `tool:marker:created`, `tool:move:pending`,
`tool:move:confirmed`, `tool:move:cancelled`, `tool:edit:applied`,
`tool:delete:applied`, `tool:ruler:units-changed`, `tool:save`) are declared by
`IntegratedToolEventName` in the public types; do not confuse these observer hooks
with the canonical element lifecycle bus.

## Tool capability states

Tool names are `polygon`, `polyline`, `rectangle`, `circle`, `marker`, `layerCake`,
`move`, `select`, `edit`, `delete`, `ruler`, `measurementSettings`, `layerStyle`,
and `save`.

| State         | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `enabled`     | Prerequisites met; `reason` is null.                                          |
| `disabled`    | Read-only, missing attribute/layers/selection, or host button restriction.    |
| `unavailable` | Not ready, missing plugin, runtime failure, or unavailable required provider. |

Use `state` for button presentation and inspect `commandEnabled` for imperative
retry/compatibility behavior: host `disabled` does not block imperative calls.
Local geometry tools do not require a paid basemap. There are no built-in letter
hotkeys (`hotkey` is null). The exhaustive reason table, precedence, selection
rules and external-button example live in [tool capabilities](tool-capabilities.md).

## CSS parts, tokens, and slots

| Surface                                                                                                                                                                            | Authoritative inventory                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base parts `host`, `map`, `toolbar-group`, `toolbar-button`, `icon`, `popover`, `active`, `disabled`, `badge`, `tooltip`                                                           | [Styling parts table](toolbar-styling.md#parts-and-states). Capability reflection also applies `disabled` for unmet prerequisites, not only host-disabled configuration. |
| Tool, toolbar, icon, popover, badge, tooltip custom properties                                                                                                                     | [Token/default table](toolbar-styling.md#css-custom-properties).                                                                                                         |
| Layout parts `toolbar-layout`, `toolbar-zone`, `zone-top-start`, `zone-top-end`, `zone-center-end`, `zone-bottom-start`, `zone-bottom-end`, and zone-mode `toolbar-group-ID`       | [Responsive host CSS](toolbar-layout.md#host-css-including-shadow-dom).                                                                                                  |
| Layout tokens `--geokit-toolbar-zone`, `--geokit-toolbar-order`, `--geokit-toolbar-wrap`, `--geokit-zone-gap`, and `--geokit-safe-area-top/right/bottom/left` (one token per side) | [Layout CSS](toolbar-layout.md#host-css-including-shadow-dom) and [safe-area contract](toolbar-layout.md#collision-insets-and-overflow-contract).                        |
| Named icon/badge/tooltip slots                                                                                                                                                     | [Slot naming and examples](toolbar-styling.md#named-slots).                                                                                                              |

The built-in layer style panel additionally exposes `layer-style-panel`,
`--geokit-panel-background` (default `white`) and `--geokit-panel-color`
(default `#222`); see [layer style panel](layers.md#style-panel-built-in-or-host-owned).

Tokens inherit from the element; use `::part` for exposed surfaces and
`themeCss`/`theme-url` for internal per-tool/group selectors. `--_geokit-*` values
are private. Responsive zones supplement the older styling guide's corner-only
placement discussion. See [accessibility](accessibility.md) before replacing
focus, disabled, keyboard, or touch affordances.

## Standalone helpers

The root and external entrypoints also export pure operation helpers, although
the entrypoints themselves register browser elements:

- [GeoJSON validation, normalization, import/export, diff and patch](geojson-pipelines.md).
- [Grower geometry](grower-geometry.md): buffer, merge, split, simplify, centroid,
  bounding box, row/bed guides, irrigation zones and presets.
- [Measurement](grower-measurement.md): `measureGeoJSON`, `formatMeasurements`.
- [Snapping](snapping-and-measurements.md): `findSnap` and associated types.
- [Provider factories, diagnostics and injected basemap contracts](providers.md#public-api).

No private controller, feature store, or Leaflet handler access is required for
these public contracts.
