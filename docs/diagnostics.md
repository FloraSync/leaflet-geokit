# Diagnostics and troubleshooting

Use the public element API, not `_controller` or Leaflet handler internals.
[API reference](api-reference.md), [event types](../src/types/events.ts), and
[element implementation](../src/components/LeafletDrawMapElement.ts) define the
surfaces below. Diagnostics describe failures; they do not guarantee recovery,
transaction rollback, provider health, or successful persistence.

## Choose the right signal

| Surface                                                                | Purpose / delivery                                                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `map.status` and `leaflet-geokit:status`                               | Durable detached state snapshot. Subscribe directly on the element and read an initial snapshot.                                   |
| `leaflet-geokit:diagnostic`                                            | Structured component/controller/provider warning or error. Direct element listener; not bubbling/composed.                         |
| `leaflet-draw:error`                                                   | Legacy error notification. Component/controller errors also produce a diagnostic and update status. Not bubbling/composed.         |
| `tile-provider-error`                                                  | Built-in raster provider failure; bubbles, not composed. Also emits a warning diagnostic; does **not** use the legacy error event. |
| `leaflet-geokit:tool-failed`                                           | Correlated tool command failure with a human-readable `reason`. Bubbling/composed; not a component error-code catalog.             |
| `getToolCapabilities()` and `leaflet-geokit:tool-capabilities-changed` | Why each tool is enabled, disabled, or unavailable, plus requested/active provider.                                                |
| `getProviderDiagnostics()`                                             | Detached basemap **configuration** report; null without initialized diagnostics. Not a tile-load or key-validity check.            |
| GeoJSON helper results / `GeoJSONValidationError.summary`              | Data validation diagnostics with paths; separate from DOM diagnostic events.                                                       |
| Promise rejection or synchronous exception                             | Caller must catch it. Not every public-method exception is forwarded to the diagnostic event.                                      |

Avoid double-reporting a legacy error and its corresponding diagnostic. Log
levels affect console output, not whether public diagnostic events are emitted.

## Status and diagnostic payloads

`StatusEventDetail` contains `state`, `ready`, `busy`, `featureCount`, optional
`lastEvent`, optional `lastError`, and `timestamp`. `lastError` contains only
`code`, `message`, `recoverable`, `timestamp`; it omits the raw cause but its
message can still contain sensitive input. A successful operation may clear it;
status is not an audit history. Timestamps are milliseconds since the Unix epoch.

| State           | Interpretation                                                                      |
| --------------- | ----------------------------------------------------------------------------------- |
| `uninitialized` | Before connection or after disconnect; not ready, not busy.                         |
| `initializing`  | Connection/map initialization in progress.                                          |
| `ready`         | Map ready; recoverable warnings can coexist with this state.                        |
| `loading`       | GeoJSON import in progress; `ready` can remain true for an already initialized map. |
| `error`         | Nonrecoverable controller initialization failure; inspect diagnostic.               |

`DiagnosticEventDetail` adds `severity: "info" | "warn" | "error"`, `state`, and
optional `cause` to the summary. The type permits `info`; current component
error forwarding uses `warn` when recoverable and `error` otherwise. Recoverable
means the map may remain usable, not that the requested operation succeeded.
The diagnostic event precedes its associated status update: use `detail.state`
in that callback or observe the following status event.

```js
import "@florasync/leaflet-geokit";

const map = document.createElement("leaflet-geokit");
map.style.cssText = "width:100%;height:400px";
map.logLevel = "warn";
map.addEventListener("leaflet-geokit:diagnostic", ({ detail }) => {
  // Deliberately omit message/cause/URLs/keys from shared telemetry.
  console.warn({
    code: detail.code,
    severity: detail.severity,
    recoverable: detail.recoverable,
    state: detail.state,
    timestamp: detail.timestamp,
  });
});
map.addEventListener("leaflet-geokit:status", ({ detail }) => {
  console.log({ state: detail.state, busy: detail.busy });
});
map.addEventListener("leaflet-geokit:tool-failed", ({ detail }) => {
  console.warn({ tool: detail.tool, commandId: detail.commandId });
});
document.body.append(map);
console.log(map.status);
```

For async calls, still use `try`/`catch`; for example, catch a rejection from
`loadGeoJSONFromUrl()` even if the diagnostic listener already updates the UI.

## Component and controller error catalog

These codes come from the element and [MapController](../src/lib/MapController.ts).
The public `code` type is a string, not a closed enum; tolerate unknown future
codes and use the code rather than matching message text.

| Code                         | Recoverable / severity | Trigger and recovery                                                                                                                                                                                            |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map_init_failed`            | No / error             | Leaflet map initialization failed. Check host size, browser globals, runtime/plugin identity, and styling/runtime configuration. Fix prerequisites before reconnecting; preserve host data outside the element. |
| `controller_error`           | Yes / warn by default  | Generic controller operation failure. Inspect the local message/cause and reproduce the specific operation; do not assume rollback.                                                                             |
| `invalid_marker_icon_config` | Yes / warn             | Invalid marker URL or tuple/configuration. Correct URL/size/anchor fields; invalid optional values fall back individually, invalid primary URL uses default markers.                                            |
| `invalid_tool_button_config` | Yes / warn             | `tool-button-config` JSON parse or object-shape failure. Supply an object keyed by valid tool names; use the property for functions.                                                                            |
| `invalid_toolbar_groups`     | Yes / warn             | `toolbar-groups` JSON parse or array-shape failure. Supply an array with group IDs/tool lists.                                                                                                                  |
| `data_fetch_failed`          | Yes / warn             | URL import network rejection or non-success HTTP response. Check URL trust, CORS, connectivity, authentication and response status; retry explicitly. Promise rejects.                                          |
| `data_parse_failed`          | Yes / warn             | URL/text import is not parseable JSON. Check response body/content type or uploaded text; parsing JSON alone does not validate GeoJSON. Promise rejects.                                                        |
| `data_load_failed`           | Yes / warn             | Replacement import failed after parsing/ingest. Inspect validation/render cause; use preflight validation before replacing data. Promise rejects.                                                               |
| `data_add_failed`            | Yes / warn             | Additive import failed. With validated imports, inspect duplicate IDs as well as geometry. Promise rejects.                                                                                                     |

Invalid toolbar JSON falls back to no custom configuration/groups; this is not a
schema validation service for every nested renderer setting. Other renderer or
host-hook problems may be logged or thrown rather than assigned one of these
codes. For safe data replacement, `importGeoJSON(fc, { validate: true })` validates
after the mutable ingest hook and before clearing data. This protects validation
failures, not arbitrary rendering failures. URL/text convenience methods currently
forward only behavior/fit options; validate through the pipeline helpers and then
call `importGeoJSON` explicitly.

## Raster provider error catalog

`TileProviderErrorDetail` contains `code`, `message`, `provider`, `timestamp`.
These errors also emit a recoverable warning diagnostic and attempt OSM raster
fallback. The requested provider remains visible in tool capabilities, even
when the active basemap is OSM. Local geometry tools do not require HERE.
Fallback attempts are not proof that the public OSM service is reachable.

| Code                | Meaning / next check                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_api_key`   | HERE requested without a nonempty key. Choose OSM/custom tiles or configure an approved provider integration.                                                                          |
| `unknown_provider`  | Unsupported named provider. Use `osm`/`here`; custom URLs belong in `tile-url` with `tileProvider` cleared.                                                                            |
| `permission_denied` | HERE tile error text indicates permission/forbidden/403/unauthorized/access denial. Inspect permitted API/product, project permissions, origin/referrer restrictions and style access. |
| `invalid_api_key`   | Remaining HERE tile errors are classified this way. This is a heuristic, **not proof the key is invalid**; inspect Network/CORS/connectivity and provider response too.                |
| `tile_load_failed`  | Generic custom/OSM tile failure, tile setup exception, or other configuration validation failure. Inspect the actual network request and tile template/placeholders.                   |

`tile-provider-changed` means a provider layer was installed, not that all tiles
loaded successfully. An injected basemap adapter has different failure semantics:
synchronous mount failures preserve the previous basemap; asynchronous renderer
errors belong to the bridge. See [provider contracts and limits](providers.md).

Provider configuration diagnostics contain only `kind`, `attribution`,
`attributionRequired`, `offline`, `apiKey`, `drawing`, and `scope`.
`scope: "configuration"` is deliberate; `apiKey` describes credential requirements,
not a key value or validation result. `offline: "host-managed"` is a declaration,
not proof of offline assets/cache. See the exhaustive
[provider capability table](providers.md#capability-diagnostics).

## Tool requirement diagnostics

Tool reasons are separate from component error codes. Use
`getToolCapabilities().tools[tool].reason`, not the text of `tool-failed.reason`,
for stable prerequisite codes. The complete codes are `not_ready`, `read_only`,
`missing_attribute`, `unavailable_plugin`, `empty_selection`, `no_editable_layers`,
`missing_provider`, `missing_api_key`, `runtime_error`, `configured_disabled`.
Their exhaustive recovery/precedence table is in
[tool capabilities](tool-capabilities.md#requirements-and-recovery).

Important distinctions:

- Removing read-only means removing the attribute or setting `readOnly = false`,
  not writing `read-only="false"` (including when a reason says `read-only=false`).
- Delete needs both `delete-features` and `edit-features`. Move/edit/delete need
  actual editable layers, not just a stored feature count.
- Host `disabled` controls buttons, not imperative activation. `commandEnabled`
  also allows explicit runtime-failure retries; do not equate it with `state`.
- Selection prerequisites are opt-in. Supply IDs with `setToolSelection()`;
  GeoKit does not invent a global selection UI.
- An activation result of `true` is not completion. Observe correlated
  `tool-completed`/`tool-cancelled`/`tool-failed` events as described in
  [tool lifecycle](tool-lifecycle.md).

## GeoJSON and geometry diagnostics

The [pipeline contract](geojson-pipelines.md#diagnostics-and-limits) describes
validation limits and source metadata behavior. Helper diagnostics use
`severity: "error" | "warning" | "info"` (note **warning**, not DOM diagnostic
**warn**), `code`, `path`, and `message`. They are returned in results or carried
by `GeoJSONValidationError.summary`, not automatically dispatched as DOM events.

`invalid-json` identifies text parsing failure; `crs-mismatch` warns about CRS or
coordinate ranges without reprojecting; `multi-expansion` is information about
editing expansion; `metadata-conflict` requires reconciling sibling properties
before safe source export. Geometry structure, positions, IDs, rings and reserved
provenance have additional validation diagnostics defined in
[geojson-pipeline.ts](../src/utils/geojson-pipeline.ts). Do not treat structural
validation as comprehensive topology validation or silent geometry repair.

Grower operations have their own typed result/error contract; consult
[grower geometry](grower-geometry.md) and [measurements](grower-measurement.md).
Do not confuse a helper failure result with map readiness or basemap availability.

## Troubleshooting by symptom

| Symptom                                                   | Checks / remedy                                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank or zero-height map                                  | Give the host explicit dimensions; inspect its computed size. Wait for readiness and check initialization diagnostics. A defined custom element is not a ready map.                         |
| Controls/map look unstyled                                | Check `skip-leaflet-styles`, CSS injection, CSP and shadow-root styling. In external mode use one compatible Leaflet namespace with Draw attached; set `leafletInstance` before connection. |
| Tool button missing or disabled                           | Read capability snapshot first; check enable attribute, read-only, plugin, and editable layers. Custom groups hide native toolbars by default.                                              |
| Custom JSON toolbar ignored                               | Check diagnostic codes and JSON top-level shape. A property override wins over its attribute; set it to `undefined` to resume attribute configuration, `null` to clear.                     |
| Tiles changed unexpectedly                                | Inspect `tile-provider-error` and requested/active capabilities for OSM fallback. Named provider wins over `tile-url`. Attribute changes can replace an injected adapter.                   |
| HERE reports invalid key but key is correct               | Classification is heuristic. Inspect network/CORS, restrictions, permissions and style; try permitted `lite.day` if satellite access fails. Never paste keys into issue reports.            |
| Parent listener never receives an event                   | Subscribe on the actual element. Legacy draw/status/diagnostic events do not bubble; provider events are not composed.                                                                      |
| Import did nothing                                        | Wait for readiness; pre-controller methods are not queued. Catch promise failures; validate FC structure and coordinate order. Empty collection is valid, empty geometry is not.            |
| Read-only still active                                    | Remove `read-only`; a literal `"false"` attribute is still present. Read-only is interactive tool policy, not protection against host data API calls.                                       |
| `prefer-canvas="false"` still uses Canvas                 | Boolean attribute presence is true. Set concrete-element `preferCanvas = false` before connection.                                                                                          |
| CSS cannot target a button inside `::part(toolbar-group)` | `::part` does not expose descendant selectors. Use button/icon parts, public tokens or trusted `themeCss`/`theme-url` rules.                                                                |
| Duplicate/missing toolbar controls                        | Any custom group with default/true `hideDefaultToolbar` hides native draw/ruler controls. Set false on every group to keep native controls; keep group IDs unique.                          |
| No developer overlay                                      | `dev-overlay` is reserved; no overlay UI ships. Use public status/diagnostics and browser DevTools.                                                                                         |
| Reconnection loses a basemap or session                   | Disconnect destroys the controller. Preserve host data, wait for readiness, reload data, then reapply the adapter.                                                                          |

## Logging and safe bug reports

Console levels are `trace`, `debug`, `info`, `warn`, `error`, `silent`; default is
`debug`. Configure an appropriate production level. Verbose logs can include
attribute values, tile URLs, GeoJSON and causes. General diagnostics are **not**
a credential-redaction boundary; only the dedicated provider/capability snapshots
intentionally omit keys/URLs/raw provider payloads. Even a message or status
`lastError.message` can contain a URL. Sanitize before sharing.

A useful report includes:

1. Package version/entrypoint, browser, bundled versus external runtime setup.
2. Minimal HTML/configuration with keys, private URLs, grower geometry and identifiers removed.
3. Diagnostic code/severity/state/recoverable, status transition, and tool command ID
   when relevant; only sanitized message/cause excerpts.
4. Initial capability/configuration snapshots, reproduction steps, expected/actual behavior.
5. Whether it reproduces with OSM or deterministic local tiles and minimal valid GeoJSON.

Never include service credentials, unrestricted paid keys, complete request URLs
with tokens, raw exports, or unredacted screenshots/network archives. Follow
[provider security guidance](providers.md#security-and-vendor-independence).
