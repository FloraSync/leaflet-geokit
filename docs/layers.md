# Named layers and layer-cake sessions

GeoKit's framework-agnostic element API exposes a detached layer registry. Existing feature CRUD, tool commands and GeoJSON defaults remain available. This is client-side map state; there is no FloraSync API integration or vendor provisioning.

## Registry and rendering

`getLayers(): MapLayer[]` returns back-to-front records with `id`, `name`, `kind`, `visible`, `order`, `featureIds` and portable `style`. Kinds are `base`, `drawn`, `imported`, `guide` (including references), and `measurement` (persisted measurement GeoJSON overlays). The live basemap has the reserved id `base`. Temporary ruler plugin graphics are not persisted measurement features.

Each ordinary drawing becomes a drawn layer. Each import becomes a named group; a saved cake becomes one drawn group containing its editable core/ring polygon features. Group membership is independent of feature properties. A hidden group is removed from the edit/draw feature group but its features remain in the store/export.

```ts
await map.importGeoJSON(fenceGeoJSON, {
  behavior: "add",
  layer: {
    id: "fences",
    name: "Fence reference",
    kind: "guide",
    style: { color: "#735aa6", dashArray: "6 4" },
  },
});
await map.importGeoJSON(measurementGeoJSON, {
  behavior: "add",
  layer: { name: "Measured bed lengths", kind: "measurement" },
});
const layers = map.getLayers();
await map.setLayerVisibility("fences", false);
await map.setLayerStyle("fences", {
  color: "#176da5",
  weight: 3,
  opacity: 0.8,
});
await map.reorderLayers(layers.map((layer) => layer.id).reverse());
await map.focusLayer("fences");
await map.removeLayer("fences");
```

- `reorderLayers` requires every current id exactly once; invalid orders do not mutate state. Order applies within Leaflet's vector/marker panes; a basemap cannot cover vector overlays simply by reordering. Marker offsets also retain Leaflet's latitude-based stacking behavior.
- `focusLayer` fits its features without changing visibility. A basemap or empty group has no feature bounds, so focus is a no-op.
- `setLayerStyle` merges a portable subset: `color`, `fillColor`, `weight` (0–100), `opacity`/`fillOpacity` (0–1), `dashArray`. Invalid numeric values fail before mutation. Paths support path styling; standard image markers support opacity, not vector fill/stroke. Tile basemaps support opacity; an optional non-tile adapter may not implement opacity.
- `removeLayer` removes all member features, including hidden features. It rejects read-only mode and the basemap. Hide the basemap instead. Visibility/style/order are presentation changes and remain available in read-only mode. Guide/measurement are semantic kinds, not separate permissions; visible features still use the existing editor.
- Individual feature updates/removals and draw deletion keep membership synchronized. An empty data group disappears. An add-import with an existing feature id retains legacy upsert semantics, moving that feature into the new import group rather than drawing a duplicate.
- Subscribe to `leaflet-geokit:layers-changed` (`detail.layers`) for a sidebar. Snapshots are detached; mutate state only through the API.

## External cake controls

The existing public tool bus activates the same circle-drawing tool used by the toolbar:

```ts
secondaryButton.onclick = () =>
  map.dispatchEvent(
    new CustomEvent("leaflet-geokit:tool-command", {
      detail: {
        tool: "layerCake",
        source: "secondary-button",
        commandId: "orchard-1",
      },
    }),
  );
map.addEventListener("tool:layer-cake:session-started", (event) => {
  renderSidebar(event.detail.session);
});
```

The map must enable `draw-layer-cake`. Draw the first circle to begin a session. `getLayerCakeSession()` returns null before/after the session, otherwise `{ id, name, center, rings: [{ radius }], style }`. Distances are meters regardless of the ruler's display units.

```ts
await map.updateLayerCakeSession({
  name: "Orchard water zones",
  radii: [100, 150, 225],
  preset: "water",
});
await map.saveLayerCakeSession(); // Same save operation as the map's Save button.
// Or: await map.cancelLayerCakeSession();
```

`radii` must have one to ten strictly increasing positive finite values. Updating replaces the session's editable circle handles; dragging those handles also updates the session. The circles keep a shared center. `name`, `radii`, `preset`, and `style` can be updated independently. Built-in presets are `crop`, `water`, and `reference`, also exported as `LAYER_STYLE_PRESETS`. Explicit style fields override the chosen preset.

Session events are DOM events on the element (bubbling/composed), and also remain available through `toolHooks`/`toolEventEmitter`:

- `tool:layer-cake:session-started`
- `tool:layer-cake:session-changed` (ring controls/dragging/sidebar edits)
- `tool:layer-cake:saved` (adds `layerId`, `featureCollection`)
- `tool:layer-cake:cancelled` (draft discarded)

Their `LayerCakeEventDetail` contains `session` and the initiating command's `source`, `commandId`, `groupId` when available. The original started event's `center`/`radius` fields and saved event's `featureCollection` remain compatible. These events supplement, not replace, the correlated `leaflet-geokit:tool-*` lifecycle. Save produces named core/ring polygons using the existing cake baker; standard polygon edit/move works afterward. Session radii are draft controls, not a reconstruction API for an already-saved cake. Cancellation, Escape, a superseding tool, clearing data, and destruction dispose draft handles/listeners. Updating/saving a missing session rejects; cancellation without a session is harmless.

## Style panel: built in or host-owned

```ts
map.dispatchEvent(
  new CustomEvent("leaflet-geokit:tool-command", {
    detail: { tool: "layerStyle", source: "sidebar" },
  }),
);
```

Without a host override this opens a compact layer selector and preset panel. It uses `part="layer-style-panel"`, `--geokit-panel-background`, and `--geokit-panel-color`. Escape/Close dismiss it and restore focus. `layerStyle`'s tool-completed event still means the panel request was handled, not that a style has been saved.

To render the editor anywhere outside the component:

```ts
map.addEventListener("leaflet-geokit:layer-style-request", (event) => {
  event.preventDefault(); // Synchronous cancellation suppresses the built-in panel.
  renderHostPanel(event.detail.layers, async (id, style) => {
    await map.setLayerStyle(id, style);
  });
});
```

`LayerStyleRequestDetail` is a detached snapshot; subscribe to layers-changed if a host panel needs live updates. Closing a host-owned panel is the host's responsibility. No framework or DOM node is required in the public data model.

## Optional export/import persistence

```ts
const snapshot = await map.exportGeoJSON({ preserveLayers: true });
await map.importGeoJSON(JSON.parse(JSON.stringify(snapshot)), {
  behavior: "replace",
  preserveLayers: true,
});
```

The versioned FeatureCollection foreign member `geokit:layers` stores the registry, including order, visibility, style, names and membership. It contains no URLs, provider keys or Leaflet objects. Basemap presentation is restored, not provider configuration. Default export remains ordinary GeoJSON. Default import ignores registry metadata and groups the imported features normally. Use `preserveLayers` on **both** ends. `getGeoJSON()` remains a feature-only store snapshot.

Restoration requires replace mode, unique known feature membership, complete feature coverage and the reserved base record. Missing/invalid metadata fails before clearing current data. `preserveLayers` with add mode is deliberately rejected: silently merging conflicting layer ids/order would be ambiguous. It also works with the source export adapter when expanded feature ids remain reconstructible by the existing GeoJSON pipeline. External tools that strip foreign members lose layer presentation metadata; geometry/properties remain standard GeoJSON. Do not rely on JSON object property key order when comparing snapshots.

## Exercised harness and checks

`npm run dev`, then open `/layer-manager.html`. The host sidebar uses only public APIs and events: secondary cake button, ring edits, save/cancel, built-in and host-owned style panels, visibility and export/restore.

```sh
npm run typecheck
npm run test:unit:focused -- tests/layer-registry.spec.ts tests/layer-cake-manager.spec.ts tests/map-controller.spec.ts tests/tool-lifecycle.spec.ts
npx playwright test -c playwright.layers.config.ts
```

The isolated Playwright server uses port 5191, no HMR, Chromium and deterministic tile responses for the new harness. It proves actual circle drawing/handles, sidebar session edits/save/cancel, SVG styles, hidden physical layers, exact structural registry restoration, and legacy irrigation tool-bus interaction. Public tile network availability is not part of that assertion.
