# Integration recipes

Use the public element API to keep your application independent of private
Leaflet handlers and Shadow DOM structure. These recipes compose existing
contracts; follow the linked guides for complete options and limitations.

## Start with a ready browser map

This TypeScript module is for a browser bundle. The mount point is an app-owned
`<div id="map-root"></div>`. Register listeners and configure properties before
connecting a new element; `customElements.whenDefined` alone does not mean the
Leaflet map is ready.

```ts
import { LeafletDrawMapElement } from "@florasync/leaflet-geokit";

const mount = document.getElementById("map-root");
if (!mount) throw new Error("Missing #map-root");
const map = new LeafletDrawMapElement();
map.style.cssText = "display:block;width:100%;height:420px";
map.setAttribute("draw-polygon", "");
map.setAttribute("draw-layer-cake", "");
map.setAttribute("edit-features", "");
map.setAttribute("tile-provider", "osm");
map.addEventListener("leaflet-geokit:diagnostic", (event) => {
  console.error((event as CustomEvent).detail);
});
const ready = new Promise<void>((resolve) => {
  const onStatus = () => {
    if (!map.status.ready) return;
    map.removeEventListener("leaflet-geokit:status", onStatus);
    resolve();
  };
  map.addEventListener("leaflet-geokit:status", onStatus);
});
mount.append(map);
await ready;
```

The following browser recipes assume this ready `map`. Production hosts should
surface initialization failure and provide cancellation/timeout rather than leave
a loading UI waiting forever. Remove the element on teardown (`map.remove()`),
and also remove listeners attached to host-owned buttons or sidebars.

## Branded toolbar without Shadow DOM queries

For the complete worked example, use [branded toolbars and external buttons](custom-toolbar.md)
and its existing HTML harness. The small configuration below shows how that
contract composes with the ready map above: configure a managed group, then style
the public tokens/parts.

```ts
map.toolbarGroups = [
  {
    id: "grower",
    tools: ["polygon", "layerCake", "layerStyle"],
    position: "topright",
    orientation: "horizontal",
    ariaLabel: "Growing area tools",
  },
];
map.toolButtonConfig = {
  polygon: { title: "Draw a bed", ariaLabel: "Draw a growing bed" },
  layerCake: { title: "Water zones", ariaLabel: "Draw concentric water zones" },
};
```

```css
leaflet-geokit {
  --geokit-tool-background: #173d2b;
  --geokit-tool-color: #fff;
  --geokit-tool-hover-background: #275d43;
  --geokit-tool-focus-ring: 3px solid #f3c969;
  --geokit-tool-radius: 8px;
}
leaflet-geokit::part(toolbar-group) {
  border: 2px solid #173d2b;
}
```

The dedicated [toolbar styling contract](toolbar-styling.md) owns the full token,
part, slot, icon and state reference. For responsive zones use
[toolbar layout](toolbar-layout.md); keep the focus/disabled/active affordances in
[accessibility](accessibility.md). `themeCss`/`theme-url` support per-tool rules
inside the shadow root; a `::part` selector cannot filter by inner data attributes.
Only pass trusted/sanitized HTML to icon and popover renderers.

## External layerCake button

An external button uses the same tool bus as the managed toolbar. Enable
`draw-layer-cake` before connection (as above); do not call private draw handlers.

```ts
const cakeButton = document.createElement("button");
cakeButton.type = "button";
cakeButton.textContent = "Draw water zones";
mount.before(cakeButton);

const startCake = () => {
  map.dispatchEvent(
    new CustomEvent("leaflet-geokit:tool-command", {
      detail: { tool: "layerCake", source: "host-sidebar" },
    }),
  );
};
cakeButton.addEventListener("click", startCake);

// On host teardown, also call:
// cakeButton.removeEventListener("click", startCake);
// cakeButton.remove();
```

Alternatively, `await map.activateTool("layerCake", { source: "host-sidebar" })`
returns whether activation was handled; it does not mean the user saved a cake.
The user draws the first circle to start a draft. Only then may a sidebar call
`updateLayerCakeSession`, `saveLayerCakeSession`, or `cancelLayerCakeSession`.
Read [external cake controls](layers.md#external-cake-controls) for session events,
radii in meters, style presets and correlation fields. Use
[getToolCapabilities](tool-capabilities.md) to reflect availability in host UI and
[tool lifecycle](tool-lifecycle.md) to observe completion, cancellation or failure.

## Validate an upload before importing

The app owns file selection, upload limits and error rendering. This function
accepts file text; it returns diagnostics when the structural validation fails
and rejects if the map import itself fails.

```ts
import { importGeoJSONText } from "@florasync/leaflet-geokit";

async function importUpload(text: string) {
  const parsed = importGeoJSONText(text);
  if (!parsed.valid || !parsed.data) return parsed;

  await map.importGeoJSON(parsed.data, {
    behavior: "replace",
    validate: true,
    fitToData: true,
    layer: { name: "Uploaded growing areas", kind: "imported" },
  });
  return parsed;
}
```

For an already-parsed value use exported `validateGeoJSON(unknown)` to inspect
validity or `importGeoJSONData(unknown)` to validate and obtain a normalized
FeatureCollection. `validate: true` on the map also checks ingest-hook output
before replacement; add mode rejects existing IDs. This protects against data
validation failures, not arbitrary renderer failures. CRS warnings are nonfatal:
apply your own rejection policy if needed. No automatic reprojection occurs.

The [GeoJSON pipeline guide](geojson-pipelines.md) covers diagnostic shapes,
URL ingestion, Multi/GeometryCollection expansion, stable IDs, source export,
diff/patch and metadata conflicts. Use its diagnostic `exportGeoJSONData` recipe
when persisting source geometry; do not confuse it with legacy source export.

## Host layer manager

Subscribe once, render a detached snapshot, and send changes through public
methods. Here the list is a minimal read-only summary; app-owned checkbox/style/
reorder controls can call the methods described below.

```ts
const layerList = document.createElement("ul");
mount.after(layerList);
const renderLayers = () => {
  layerList.replaceChildren(
    ...map.getLayers().map((layer) => {
      const item = document.createElement("li");
      item.textContent = `${layer.name}: ${layer.visible ? "visible" : "hidden"}`;
      return item;
    }),
  );
};
map.addEventListener("leaflet-geokit:layers-changed", renderLayers);
renderLayers();

// On host teardown, also call:
// map.removeEventListener("leaflet-geokit:layers-changed", renderLayers);
// layerList.remove();
```

Use `setLayerVisibility`, `setLayerStyle`, `focusLayer`, `reorderLayers` and
`removeLayer` for interactions. Reordering requires every current ID exactly once;
the reserved basemap cannot be removed. Hidden features still export. For
persistence, use `exportGeoJSON({ preserveLayers: true })` and import with
`{ behavior: "replace", preserveLayers: true }` on restoration.

The [layer guide](layers.md) owns these invariants, draft editing and the
cancelable host-owned style-panel recipe. Run the existing
[layer-manager harness](../layer-manager.html) through `npm run dev` for the full
sidebar rather than introducing another controller implementation.

## Raster providers and optional basemap adapters

The default is Leaflet with OSM. Choose `tile-provider="osm"` or `"here"` for
built-ins; a custom URL uses `tile-url`, not `tile-provider="custom"`.
After readiness, the equivalent property-based custom configuration is:

```ts
map.tileProvider = undefined;
map.tileAttribution = "Your licensed dataset attribution";
map.tileUrl = "/tiles/{z}/{x}/{y}.png";
const diagnostics = map.getProviderDiagnostics();
console.log(diagnostics); // Configuration report, not tile-load health.
```

The URL above is a **host-provided endpoint**, not a GeoKit tile service. Keep
attribution accurate. Root and `/external` export `createRasterProvider`,
`createCustomRasterProvider`, `createMapLibreBasemapAdapter`, and
`getProviderDiagnostics`. To mount an optional bridge, call
`map.setBasemapAdapter(adapter)` after readiness; `null` restores raster settings.

Follow [providers](providers.md) for the full injected MapLibre/PMTiles experiment,
shared Leaflet instance, worker/CSP setup, cleanup and production gates. It is a
basemap seam, not a packaged MapLibre renderer or alternate drawing engine.
Never put server secrets in browser properties, HTML or URLs; HERE/browser key
restrictions and vendor licensing remain host responsibilities. No automatic paid
fallback or offline cache is supplied.

## React and Preact

Actual exported component names are `ReactLeafletGeoKit` and
`PreactLeafletGeoKit`, not `GeoKit` or `LeafletMap`.

| Host owns Leaflet/Draw assets                              | Package provisions assets (browser-only)                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `@florasync/leaflet-geokit/react` → `ReactLeafletGeoKit`   | `@florasync/leaflet-geokit/react-bundled` → `ReactLeafletGeoKit`   |
| `@florasync/leaflet-geokit/preact` → `PreactLeafletGeoKit` | `@florasync/leaflet-geokit/preact-bundled` → `PreactLeafletGeoKit` |

Use the existing [React](shims/react.md) and [Preact](shims/preact.md) quick starts.
Both wrappers accept `attributes`, `toolbarGroups`, `toolButtonConfig`,
`toolHooks`, `toolEventEmitter`, `initialGeoJSONText`, change/error callbacks and
`onReady(element)`. Use `onReady` to attach the public APIs above; keep callback
and configuration identities stable where possible. Supply a height.

Additive wrappers default to `use-external-leaflet` and `skip-leaflet-styles`;
supply compatible Leaflet/Draw assets and, when needed, `leafletInstance`. Global
page CSS does not penetrate Shadow DOM: use `themeCss`/`theme-url` for required
shadow styles or explicitly opt back into injected styles. Framework runtimes
are consumer peers, not bundled React/Preact copies.

## Django form bridge

The exported initializer is `initDjangoGeokit`. The server renders a textarea
with class `geokit-editor-widget`; an app browser entry imports and initializes
the shim **after the textarea exists**:

```ts
import { initDjangoGeokit } from "@florasync/leaflet-geokit/django";

const handles = initDjangoGeokit(".geokit-editor-widget", {
  height: 420,
  elementAttributes: { "draw-polygon": true, "edit-features": true },
  onError: (error, context) => console.error(context.phase, error),
});
// Before app-controlled submission, await Promise.all(handles.map(h => h.sync())).
// When removing the widget, call handles.forEach(h => h.destroy()).
```

See [Django shim](shims/django.md) for `data-geokit-*` configuration and form data
flow. The bridge hides the textarea, loads initial JSON on readiness, and writes
changes back to its value. For custom programmatic edits, explicitly await
`handle.sync()` before submission. Django still validates and authorizes posted
GeoJSON server-side. Load the built browser entry with a module script; a bare
npm specifier needs your bundler/import map, and a classic Django Media script
is not automatically an ESM loader. The optional browser global is
`window.GeoKitDjango.init`, installed by loading the shim, not by Python.

## SSR-safe imports: separate wrapper modules from browser registration

Only the **additive** `/react` and `/preact` wrappers defer element registration to
client effects. They can be imported in SSR code with their respective framework
runtime installed. They do not render a working Leaflet map on the server.

The root, `/external`, `/django`, `/react-bundled` and `/preact-bundled` entries
are **not SSR-safe runtime imports**: they eagerly register custom elements or
import the root that does. A named utility import from the root is not an
exception. No `/ssr`, `/geojson`, `/utils` or `/providers` subpath is exported.

Type-only imports are erased and can be used in server-shared TypeScript. For
plain-element or bundled integrations, dynamically import in client-only code:

```ts
import type { LeafletDrawMapElement } from "@florasync/leaflet-geokit";

async function createClientMap(): Promise<LeafletDrawMapElement | null> {
  if (typeof window === "undefined" || typeof customElements === "undefined") {
    return null;
  }
  const { LeafletDrawMapElement } = await import("@florasync/leaflet-geokit");
  return new LeafletDrawMapElement(); // Configure/listen before appending.
}
```

Call this from your framework's client lifecycle, not during server rendering.
Use its client-only/no-SSR component mechanism for bundled wrappers. Do not
statically import a browser-only entry elsewhere in that server module graph.
A successful server import of an additive wrapper proves only the import boundary,
not hydration, asset loading or browser editing: exercise those separately with
the existing framework harnesses.
