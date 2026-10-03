# Tool capabilities and external controls

`map.getToolCapabilities()` synchronously returns a detached `ToolCapabilities`
snapshot. It is safe before connection (tools report `unavailable/not_ready`).
Subscribe on the element or a composed ancestor to
`leaflet-geokit:tool-capabilities-changed`; its `detail` has exactly the same
shape. Notifications are change-deduplicated; controller changes within one
microtask are coalesced. Always read an initial snapshot after subscribing.

## Snapshot contract

`tools` is keyed by every existing `ToolButtonName`: polygon, polyline, rectangle,
circle, marker, layerCake, move, select, edit, delete, ruler,
measurementSettings, layerStyle, and save. Each entry contains:

- `state`: `enabled`, `disabled` (a prerequisite or host UI restriction), or
  `unavailable` (runtime not ready, missing handler/plugin, or failed runtime).
- `reason`: null when enabled, otherwise `{ code, message, requirement? }`.
  Codes are stable; messages are explanatory, not identifiers.
- `active`: whether this tool is the controller's persistent active mode.
- `groupIds`: deduplicated configured toolbar groups containing this tool.
  Caller-provided command `groupId` values do not create toolbar groups.
- `hotkey`: actual built-in activation shortcut, currently null for all tools.
  GeoKit does not register letter shortcuts. Leaflet's contextual Escape cancel
  behavior is not a global select shortcut.
- `commands`: support for `activate` and `deactivate` commands. The existing
  bus accepts both for every tool; `deactivate` always returns to select mode.
- `commandEnabled`: whether activation may run. The longstanding
  `toolButtonConfig.disabled` option disables buttons, not the imperative API.
  Runtime failures disable buttons but permit an explicit imperative retry.
- `behavior`: `draw`, `mode`, `action`, or `deactivate`. LayerCake is multi-stage
  drawing; consult [the lifecycle contract](tool-lifecycle.md) for completion.

`provider` separately reports `requested`, `active`, `state`, and `reason`.
Missing HERE credentials, unknown providers, and tile runtime errors are visible
here even when fallback OSM tiles work. No key, tile URL, or raw provider error
payload is included. Local geometry tools do **not** require a paid tile
provider and remain enabled during fallback.

`selectedFeatureIds` contains the currently valid host-supplied selection.
Snapshots and events never expose mutable internal arrays or registry objects.

## Requirements and recovery

The registry reflects:

| Reason code           | Meaning / recovery                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not_ready`           | Wait for initialization or reconnect the element.                                                                                                                                                      |
| `read_only`           | Drawing, move, edit and delete need read-only removed. Save/select/ruler remain usable.                                                                                                                |
| `missing_attribute`   | Enable the named draw/edit/delete/ruler attribute. Delete also needs `edit-features` because Leaflet.draw owns remove under its edit toolbar.                                                          |
| `unavailable_plugin`  | The configured tool's actual handler/plugin is absent. Supply the runtime/plugin and rebuild.                                                                                                          |
| `no_editable_layers`  | Move/edit/delete need at least one actual editable layer, not merely a GeoJSON feature count.                                                                                                          |
| `empty_selection`     | An opt-in selection prerequisite has no valid selected feature ids.                                                                                                                                    |
| `missing_provider`    | Requested tile provider is not supported.                                                                                                                                                              |
| `missing_api_key`     | Requested provider needs credentials; use a supported free provider or configure credentials privately.                                                                                                |
| `runtime_error`       | A tool threw/failed or the requested provider failed. Tool activation may be retried explicitly; successful retry/rebuild clears its failure. Provider change/reconfiguration clears provider failure. |
| `configured_disabled` | Host disabled the managed button; imperative compatibility API remains available.                                                                                                                      |

Reasons have deterministic precedence: readiness, read-only, attributes, plugin,
editable layers, selection, provider, runtime error, host-disabled flag. Changes
after load/add/clear/update/remove, Leaflet create/delete, tool activation,
configuration, read-only rebuild, and provider reconfiguration are reflected.
Rapid structural attribute changes are serialized, retaining stored geometry.

GeoKit has no global feature-selection UI. Existing layerStyle remains a
host-owned action/popover, and save still exports an empty collection. To opt
host actions into stronger prerequisites without breaking those defaults:

```ts
map.toolButtonConfig = {
  layerStyle: { requirements: { selection: true } },
  // Only opt in when YOUR action truly needs the requested provider.
  save: { requirements: { provider: true } },
};
map.setToolSelection(["bed-17"]); // Supply ids from your host selection model.
```

Unknown/deleted ids are excluded. Clear/load-replace resets selection. These
opt-in prerequisites also apply to imperative/event activation. No implicit
selection engine, provider provisioning, or host API wiring is introduced.

## Declarative external buttons

```html
<leaflet-geokit id="map" draw-polygon edit-features></leaflet-geokit>
<button data-tool="polygon" disabled>Draw boundary</button>
<button data-tool="edit" disabled>Edit boundaries</button>
<script type="module">
  import "@florasync/leaflet-geokit";
  const map = document.querySelector("#map");
  const buttons = document.querySelectorAll("button[data-tool]");
  const render = () => {
    const { tools } = map.getToolCapabilities();
    for (const button of buttons) {
      const capability = tools[button.dataset.tool];
      button.disabled = capability.state !== "enabled";
      button.title = capability.reason?.message ?? "";
      button.setAttribute("aria-pressed", String(capability.active));
    }
  };
  map.addEventListener("leaflet-geokit:tool-capabilities-changed", render);
  render();
  for (const button of buttons) {
    button.addEventListener("click", () =>
      map.activateTool(button.dataset.tool),
    );
  }
</script>
```

The existing `irrigation-draw-mode.html` harness contains working external
buttons, an empty-layer edit state, and a read-only toggle. Managed toolbar
buttons consume the same snapshot, including duplicate placements. The
intentionally unguarded “Try unavailable polyline” button remains a failure-bus
example, not the recommended capability binding.

## Focused verification

```sh
npm run typecheck
npm run test:unit:focused -- tests/tool-capabilities.spec.ts tests/tool-lifecycle.spec.ts tests/map-controller.spec.ts tests/element.spec.ts
npx playwright test --config playwright.capabilities.config.ts --output "$PAPERCLIP_RUN_SCRATCH_DIR/browser-results"
npm run build
```

Outside a Paperclip run, supply a writable output directory yourself. The
capability Playwright config starts an isolated Vite harness on port 5186 with
HMR off and shuts it down after the tests. Capability tests use fixture tile
responses while exercising real Leaflet pointer drawing and public APIs; they
do not contact paid providers or prove vendor availability.
