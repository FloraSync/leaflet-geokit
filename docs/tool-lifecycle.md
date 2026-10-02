# Public tool command and lifecycle bus

GeoKit exposes one framework-agnostic command surface for host controls, managed
toolbars, and the native Leaflet toolbar. Consumers can use the imperative
methods or dispatch a typed command event; lifecycle results always leave the
actual `<leaflet-geokit>` element as bubbling, composed `CustomEvent`s.

## Command entry points

- `activateTool(tool, options)` starts a tool. `triggerTool` is its
  compatibility alias.
- `deactivateTool(options)` stops the current persistent tool and returns to
  select mode.
- Dispatch `leaflet-geokit:tool-command` with `ToolCommandEventDetail` to
  use the event-only API. Its `action` defaults to `activate`; use
  `{ tool: "select", action: "deactivate" }` to stop.
- `leaflet-geokit:activate-tool`, `leaflet-geokit:trigger-tool`, and
  `leaflet-geokit:deactivate-tool` remain compatibility aliases.
- Managed toolbar buttons and observed native Leaflet toolbar buttons enter the
  same controller bus. They do not synthesize a second activation.

`ToolTriggerOptions` accepts `source`, `groupId`, and an optional
`commandId`. GeoKit generates a command id when callers omit one. Reuse that
id only when the calls are intentionally the same logical command; repeated
commands normally need distinct ids.

```ts
import type {
  LeafletDrawMapElementAPI,
  ToolEventDetail,
} from "@florasync/leaflet-geokit";

const map = document.querySelector("leaflet-geokit") as HTMLElement &
  LeafletDrawMapElementAPI;

map.addEventListener("leaflet-geokit:tool-failed", (event) => {
  const detail = (event as CustomEvent<ToolEventDetail>).detail;
  console.error(detail.commandId, detail.reason);
});

await map.activateTool("polygon", {
  source: "field-panel",
  groupId: "outside-controls",
});

map.dispatchEvent(
  new CustomEvent("leaflet-geokit:tool-command", {
    bubbles: true,
    composed: true,
    detail: {
      tool: "layerCake",
      source: "field-panel",
      groupId: "outside-controls",
    },
  }),
);
```

## Lifecycle and ordering

Every lifecycle event uses exported `ToolEventDetail`:

- `tool`, `action`, `source`, `groupId`, and `commandId` identify the
  command.
- `previousTool` and `activeTool` are null when there is no persistent mode.
- `featureIds` is always present. It is empty when no features apply.
- `geometry` is a GeoJSON `Feature` or `FeatureCollection` snapshot when a
  committed operation has geometry.
- `reason` explains cancellations and failures.
- `timestamp` is milliseconds since the Unix epoch.

The canonical order is:

1. `leaflet-geokit:tool-command` — a normalized request entered the public bus.
   For an event command, the caller's event is this phase; GeoKit enriches its
   mutable detail rather than emitting a duplicate.
2. `leaflet-geokit:tool-commanded` — the controller accepted the request and
   is attempting it.
3. Persistent tools emit `tool-started`, then `tool-state-changed` if the
   active tool changed. Action tools emit `tool-completed` immediately.
4. Interactive commits emit `tool-completed` with ids/geometry. A one-shot
   tool then emits `tool-state-changed` when Leaflet stops it.
5. Escape, select, and switches emit `tool-cancelled` for the command that was
   active. A real active-state transition emits `tool-state-changed` once.
6. Unavailable handlers, thrown activation errors, and missing controllers emit
   `tool-failed` with `reason`; they never leave the failed tool active.

On a switch, the new command/commanded phases occur first, the previous command
is cancelled using its original correlation id, and the new command starts.
Repeating the same persistent tool cancels the old command and starts the new
one without a false state-change event (the active tool name did not change).

The older `tool-trigger-requested`, `tool-triggered`, and
`tool-trigger-failed` events are still emitted for compatibility and include
`commandId`. Their presence does not change the canonical ordering above.

## Complete tool inventory

| Tool                  | Kind                         | Activation and terminal behavior                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polygon`             | Persistent, one-shot draw    | Starts on Leaflet `drawstart`; created feature completes with one id/Feature; `drawstop` clears active state. Escape cancels.                                                                                                                                                            |
| `polyline`            | Persistent, one-shot draw    | Same contract as polygon.                                                                                                                                                                                                                                                                |
| `rectangle`           | Persistent, one-shot draw    | Same contract as polygon.                                                                                                                                                                                                                                                                |
| `circle`              | Persistent, one-shot draw    | Same contract as polygon.                                                                                                                                                                                                                                                                |
| `marker`              | Persistent, one-shot draw    | Same contract as polygon.                                                                                                                                                                                                                                                                |
| `layerCake`           | Persistent, multi-stage draw | Starts with the base-circle command. Base-circle creation opens `LayerCakeManager` and is not completion. Manager Save completes with all ids and the FeatureCollection. Select/switch destroys the session and cancels the original command. Source/group/id are retained through save. |
| `move`                | Persistent operation mode    | Starts once. Each confirmed move completes with the moved id and new Feature. The mode remains active until select/switch/Escape; the existing `tool:move:*` events remain available for pending/confirmed/per-move-cancel observations.                                                 |
| `select`              | Deactivation action          | Cancels the current persistent command, clears state, then completes the select command. With nothing active it simply completes.                                                                                                                                                        |
| `edit`                | Persistent batch mode        | Leaflet edit save completes with edited ids and the current FeatureCollection; edit stop clears state. Closing without save cancels.                                                                                                                                                     |
| `delete`              | Persistent batch mode        | Leaflet delete save completes with deleted ids and the remaining FeatureCollection; delete stop clears state. Closing without save cancels.                                                                                                                                              |
| `ruler`               | Persistent plugin mode       | Starts when the ruler toggle becomes active. Select/switch/Escape or the native toggle cancels and clears it. The third-party plugin does not expose a committed measurement geometry event, so GeoKit does not invent one.                                                              |
| `measurementSettings` | Action                       | Completes when the settings dialog opens. Choosing units continues to emit `tool:ruler:units-changed`; closing the dialog is not a new command.                                                                                                                                          |
| `layerStyle`          | Action                       | Completes when GeoKit delivers the style action/popover request. Host-owned styling after that point is outside this lifecycle.                                                                                                                                                          |
| `save`                | Action                       | Completes with all current feature ids and a FeatureCollection snapshot, while also preserving `leaflet-draw:export` and `tool:save`. It does not stop the active persistent tool.                                                                                                       |

## Integration rules

Listen on the element or any composed ancestor. Do not read `_controller`,
Leaflet handler internals, or Shadow DOM-private callbacks. Outside controls can
start/stop/save and observe failure using only the methods/events above.

A `tool-completed` event means an actual action or interactive commit. It is
never emitted merely because a draw handler was enabled. In particular,
LayerCake activation and base-circle creation are not reported as completion.
