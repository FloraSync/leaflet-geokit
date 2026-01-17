# @florasync/leaflet-geokit

A framework-agnostic, TypeScript-first Web Component that wraps Leaflet and Leaflet.draw to provide a beautiful, stateful, embeddable GeoJSON editor. Ships as a Vite library (ESM + UMD), bundles Leaflet/Draw assets, injects CSS into Shadow DOM, exposes a clean attributes/events/methods API, and includes verbose, structured logging for first-class diagnostics.

Primary sources

- Element host (custom element): [src/components/LeafletDrawMapElement.ts](src/components/LeafletDrawMapElement.ts)
- Controller (Leaflet + Draw lifecycle): [src/lib/MapController.ts](src/lib/MapController.ts)
- Feature store (ID-centric CRUD): [src/lib/FeatureStore.ts](src/lib/FeatureStore.ts)
- Assets and CSS bridge: [src/lib/leaflet-assets.ts](src/lib/leaflet-assets.ts)
- Public API and event types: [src/types/public.ts](src/types/public.ts), [src/types/events.ts](src/types/events.ts)
- Logger utility: [src/utils/logger.ts](src/utils/logger.ts)
- GeoJSON helpers: [src/utils/geojson.ts](src/utils/geojson.ts)

Documentation quick-links

- Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Dev harness (example): [index.html](index.html)
- Unit tests: [tests/element.spec.ts](tests/element.spec.ts)
- Vitest config: [vitest.config.ts](vitest.config.ts)
- Vite build config: [vite.config.ts](vite.config.ts)

---

## Contents

- What you get
- Install
- Build and compilation
- Runtime and architecture overview
- Public API (attributes, properties, methods, events)
- Usage examples (HTML, ESM, framework integration, recipes)
- Shims and integrations
- Logging, diagnostics, and troubleshooting
- Performance, accessibility, and SSR notes
- Roadmap and versioning

---

## What you get

- A self-contained custom element, <leaflet-geokit>, that:
  - Renders a Leaflet map inside Shadow DOM
  - Configures Leaflet.draw tools via boolean attributes
  - Injects Leaflet and Leaflet.draw CSS automatically
  - Emits typed CustomEvents with id-aware payloads
  - Offers an imperative API to import/export GeoJSON and control the view
  - Exposes structured verbose logging with adjustable levels

- A design that separates:
  - Web component host logic from Leaflet orchestration (controller)
  - Controller logic from id-centric data storage (feature store)

- Strong TypeScript types for the public API (for consumers using TS)

---

## Install

Inside this package directory:

- npm install
- npm run dev — starts Vite dev server
- Open http://localhost:5173 in the browser (or whatever port VITE is using

For consumption from another app:

- Add this package as a dependency
- `npm install @florasync/leaflet-geokit`
- `import "@florasync/leaflet-geokit";` and ensure the element is sized via CSS (it does not self-size)

---

## Build and compilation

Tooling

- Build: Vite (library mode), target: ES2019
- Outputs:
  - dist/leaflet-geokit.es.js (ESM)
  - dist/leaflet-geokit.umd.js (UMD)
  - dist/types/\*\* (TypeScript declaration files)
- Bundles Leaflet and Leaflet.draw by default
- CSS/Assets handled by Vite and injected into Shadow DOM at runtime

Scripts (see [package.json](package.json))

- npm run dev — Vite dev server
- npm run build — type declarations + Vite build
- npm run test:unit — Vitest (happy-dom)
- npm run typecheck — TypeScript noEmit
- npm run lint — ESLint (strict TS rules)
- npm run format — Prettier write
- npm run test:e2e — Playwright (currently a minimal smoke test under e2e/)

Browser support

- ES2019, evergreen browsers (Chromium, Firefox, Safari modern)

---

## Runtime and architecture overview

High-level components:

- [src/components/LeafletDrawMapElement.ts](src/components/LeafletDrawMapElement.ts)
  - Manages Shadow DOM container and attributes/properties
  - Instantiates the controller; delegates public methods
  - Dispatches high-level CustomEvents

- [src/lib/MapController.ts](src/lib/MapController.ts)
  - Creates Leaflet map and tile layer
  - Manages L.FeatureGroup for drawn items
  - Configures Leaflet.draw tools from attributes
  - Bridges Leaflet.draw events to component events with typed payloads
  - Provides procedural methods: setView, fitBoundsToData, etc.
  - Persists features in the FeatureStore

- [src/lib/FeatureStore.ts](src/lib/FeatureStore.ts)
  - Guarantees stable feature ids (feature.id → properties.id → generated uuid)
  - CRUD operations and conversion to FeatureCollection
  - Computes bounds for fit-to-data

CSS and assets:

- [src/lib/leaflet-assets.ts](src/lib/leaflet-assets.ts) injects Leaflet + Leaflet.draw CSS into ShadowRoot and wires default marker icons via bundled asset URLs.

---

## Public API

Attributes (string/boolean)

- Map configuration
  - latitude (string number): initial map latitude; default 0
  - longitude (string number): initial map longitude; default 0
  - zoom (string number): initial zoom; default 2
  - min-zoom (string number, optional)
  - max-zoom (string number, optional)
  - tile-url (string): tile URL template (default OSM)
  - tile-attribution (string, optional): attribution text
  - prefer-canvas (boolean): use Canvas rendering instead of SVG for better performance with large datasets; default true
- Controls (boolean; presence = enabled)
  - draw-polygon, draw-polyline, draw-rectangle, draw-circle, draw-layer-cake, draw-marker
  - edit-features, delete-features
- Behavior
  - read-only (boolean): disables all drawing/editing/removing
  - log-level (string): trace | debug | info | warn | error | silent (default debug)
  - dev-overlay (boolean): reserved for a runtime overlay (future)

Properties (runtime)

- latitude: number
- longitude: number
- zoom: number
- minZoom?: number
- maxZoom?: number
- tileUrl: string
- tileAttribution?: string
- readOnly: boolean
- logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'
- devOverlay: boolean
- preferCanvas: boolean

Methods (Promise-based, invoked on the element instance)

- getGeoJSON(): returns FeatureCollection of current data
- loadGeoJSON(fc): clears + loads FeatureCollection; does not auto-fit
- clearLayers(): clears map layers and store
- addFeatures(fc): adds features; returns array of assigned ids
- updateFeature(id, feature): replaces a feature in the store (visual sync is progressively enhanced)
- removeFeature(id): removes a feature (and layers with matching id)
- fitBoundsToData(padding?): fits view to data bounds (default padding ~0.05)
- fitBounds(bounds, padding?): fits view to provided [[south, west], [north, east]] bounds with optional padding ratio
- setView(lat, lng, zoom?): sets map view
- loadGeoJSONFromUrl(url): fetches a URL (application/json) and loads; auto-fits
- loadGeoJSONFromText(text): parses JSON text and loads; auto-fits
- exportGeoJSON(): emits 'leaflet-draw:export' with current FeatureCollection and returns it

Events (CustomEvent with detail)

- leaflet-draw:ready — { bounds?: [[south, west], [north, east]] }
- leaflet-draw:created — { id: string, layerType: 'polygon'|'polyline'|'rectangle'|'circle'|'marker', geoJSON: Feature }
- leaflet-draw:edited — { ids: string[], geoJSON: FeatureCollection }
- leaflet-draw:deleted — { ids: string[], geoJSON: FeatureCollection }
- leaflet-draw:error — { message: string, cause?: unknown }
- leaflet-draw:export — { geoJSON: FeatureCollection, featureCount: number }
- leaflet-draw:ingest — { fc: FeatureCollection, mode: 'load'|'add' } (listener may mutate detail.fc to transform input)

Event payload types live in [src/types/events.ts](src/types/events.ts). Public API types live in [src/types/public.ts](src/types/public.ts).

---

## Usage examples

A. Basic HTML, served by Vite (development)

```html
<style>
  leaflet-geokit {
    display: block;
    width: 100%;
    height: 500px;
  }
</style>
<script type="module" src="/src/index.ts"></script>

<leaflet-geokit
  latitude="39.7392"
  longitude="-104.9903"
  zoom="11"
  tile-url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  draw-polygon
  draw-polyline
  draw-rectangle
  draw-circle
  draw-layer-cake
  draw-marker
  edit-features
  delete-features
  log-level="debug"
></leaflet-geokit>

<script type="module">
  const el = document.querySelector("leaflet-geokit");

  el.addEventListener("leaflet-draw:ready", (e) =>
    console.log("READY", e.detail),
  );
  el.addEventListener("leaflet-draw:created", (e) =>
    console.log("CREATED", e.detail),
  );
  el.addEventListener("leaflet-draw:edited", (e) =>
    console.log("EDITED", e.detail),
  );
  el.addEventListener("leaflet-draw:deleted", (e) =>
    console.log("DELETED", e.detail),
  );
</script>
```

B. ESM consumption from another app (node_modules)

```js
// main.ts
import "@florasync/leaflet-geokit";

// later in DOM:
const el = document.querySelector("leaflet-geokit");
await el.loadGeoJSONFromUrl("/data/feature-collection.json");
```

C. Load from text (e.g., user paste or file input)

```js
const text = await file.text();
await el.loadGeoJSONFromText(text);
```

D. Programmatic CRUD with ids

```js
const ids = await el.addFeatures({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "A" },
      geometry: { type: "Point", coordinates: [-105, 39.73] },
    },
  ],
});
await el.updateFeature(ids[0], {
  type: "Feature",
  properties: { name: "A (edited)" },
  geometry: { type: "Point", coordinates: [-105.01, 39.735] },
});
await el.removeFeature(ids[0]);
```

E. Framework integration (React/Preact/Vue/Svelte)

- Use the custom element as a regular JSX/HTML element.
- Ensure typescript recognizes custom elements (tsconfig compilerOptions.lib includes DOM).
- Manage data in your state and pass event handlers via addEventListener in useEffect/onMount.
- Remember to set CSS height on the element.

---

## Shims and integrations

- Django widget shim: [docs/shims/django.md](docs/shims/django.md)

## Recipes

1. Persist to your API

```js
el.addEventListener("leaflet-draw:edited", async (e) => {
  await fetch("/api/shapes", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(e.detail.geoJSON),
  });
});
```

2. Read-only review mode

```html
<leaflet-geokit read-only></leaflet-geokit>
```

3. Alternate tile provider with attribution

```html
<leaflet-geokit
  tile-url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
  tile-attribution="&copy; OSM contributors, Humanitarian style"
/>
```

4. Fit view after load

- loadGeoJSONFromUrl and loadGeoJSONFromText auto-fit to the loaded data.
- loadGeoJSON does not auto-fit; call el.fitBoundsToData(0.1) after load if desired.

5. Custom logger injection (advanced)

- At runtime, set el.logLevel = 'info' to reduce chatter.
- If you need a different sink, wrap the element logic in your app and forward to your own logger (see [src/utils/logger.ts](src/utils/logger.ts)).

---

## Logging and diagnostics

Logger namespaces:

- component:leaflet-geokit — element lifecycle, attribute changes, public methods
- component:leaflet-geokit:controller — controller init, draw events, CRUD, timings
- component:leaflet-geokit:controller:store — feature add/update/remove, bounds, ids

Control verbosity:

- Attribute log-level="debug" (default 'debug')
- el.logLevel at runtime

Troubleshooting checklist:

- Blank/empty map
  - Ensure the element has a fixed height (CSS); 0-height containers won’t render.
  - For hidden tabs, call setView or fitBoundsToData once the tab becomes visible.
- Draw tools missing
  - Confirm boolean attributes are present (e.g., draw-polygon). read-only disables tools entirely.
- Events not received
  - Add listeners directly on the element instance (e.target is the custom element). Verify event names.
- IDs absent or not stable
  - Persist feature.id (or properties.id) in your backend; the store uses and preserves them.

---

## Performance, accessibility, SSR

Performance

- **Canvas Rendering (Default)**: The component uses Canvas rendering by default (prefer-canvas="true"), which provides significantly better performance than SVG when displaying large numbers of features or complex polygons. Canvas uses a single canvas element instead of individual DOM elements for each feature, reducing DOM overhead and improving rendering speed.
- To switch to SVG rendering (e.g., for better print quality or specific styling needs), remove the prefer-canvas attribute or set it explicitly: `<leaflet-geokit prefer-canvas="false">`.
- L.geoJSON is adequate for small/medium collections. For very large datasets (thousands of features), consider server-side tiling or clustering (not included).
- fitBoundsToData uses padding to reduce cramped framing; tune via method arg.

Accessibility

- Keyboard navigation and zoom are Leaflet-provided. Consider documenting shortcuts in your app.
- Host element applies modern focus/shape defaults; restyle as desired.

SSR

- This is a browser-only custom element. If importing in SSR, gate the import to client-side only.

---

## Roadmap and versioning

Planned enhancements

- Dev overlay (opt-in) to visualize state, counts, and last event payloads
- Geometry-level layer sync for updateFeature without re-add
- Playwright e2e and CI workflows
- Advanced import providers (files, streams) and output format adapters
- Theming hooks for overlay UI

Versioning and releases

- Types shipped in dist/types
- Keep a Changelog in CHANGELOG.md (to be populated during releases)

---

## License

## MIT

## Contributing

Please see CONTRIBUTING.md for environment setup, testing, and our Good Vibes Policy. PRs with clear rationale, small focused changes, and tests are very welcome.
