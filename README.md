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
- Tile Providers
- Build and compilation
- Runtime and architecture overview
- Public API (attributes, properties, methods, events)
- Usage examples (HTML, ESM, framework integration, recipes)
- Framework Support
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
- npm run dev — starts the multi-page dev harness (Vite)
- Open http://localhost:5173 to access the interactive test suite.

### Dev Harness & Prototyping

The dev harness is a multi-page environment that allows you to prototype and test the component in various scenarios:

- **Bundled WC**: Standard web component with all dependencies included.
- **External WC**: Web component using external Leaflet/Draw from a CDN.
- **Preact / React**: First-class wrappers for Preact and React, testing both bundled and external dependency models.

Use the navigation bar at the top of the harness to switch between these environments. This is the best way to verify changes across different framework integrations and dependency models.

For consumption from another app:

- Add this package as a dependency
- `npm install @florasync/leaflet-geokit`
- `import "@florasync/leaflet-geokit";` and ensure the element is sized via CSS (it does not self-size)

### Bundled vs external Leaflet/Leaflet.draw

We ship two entrypoints so you can avoid double-loading Leaflet if your app already includes it.

- **Bundled (default)** — includes Leaflet + Leaflet.draw JS/CSS inside the library bundle. Use this when you are _not_ providing Leaflet yourself.
  - Import: `import "@florasync/leaflet-geokit";`

- **External (no Leaflet bytes)** — expects Leaflet + Leaflet.draw + CSS to be provided by the host (e.g., your framework already loads them).
  - Import: `import "@florasync/leaflet-geokit/external";`
  - Requires `window.L` with `L.Control.Draw` available, and Leaflet/Draw CSS loaded by you.
  - If external `L` is present but Draw APIs are incomplete, runtime falls back to bundled Leaflet/Draw and logs a warning.

Runtime options (advanced)

- Programmatic flag: `map.useExternalLeaflet = true` to prefer a provided `window.L` (falls back to bundled if missing). See [LeafletDrawMapElement](src/components/LeafletDrawMapElement.ts:15) and [MapController](src/lib/MapController.ts:41).
- Programmatic flag: `map.skipLeafletStyles = true` to disable our CSS/icon injection when you own the styles. Styling helpers live in [leaflet-assets](src/lib/leaflet-assets.ts:1).

Example: external entrypoint in a bundler app

```ts
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "@florasync/leaflet-geokit/external";
```

Then mount your element as usual:

```html
<leaflet-geokit draw-polygon draw-marker></leaflet-geokit>
```

Why choose external?

- Avoid double-loading Leaflet/Leaflet.draw when your host already ships them.
- Keep bundle size smaller in hosts that vendor Leaflet themselves.
- Control Leaflet/Draw versions and theming directly.

---

## Tile Providers

The `<leaflet-geokit>` web component supports multiple tile provider modes.

### OpenStreetMap (Default)

```html
<leaflet-geokit tile-provider="osm"></leaflet-geokit>
```

### HERE Maps

Requires a HERE API key ([get one here](https://developer.here.com/)):

```html
<leaflet-geokit
  tile-provider="here"
  tile-style="lite.day"
  api-key="YOUR_HERE_API_KEY"
></leaflet-geokit>
```

`api-key` is the canonical attribute. `here-api-key` is also accepted as a legacy alias.

**Available HERE Styles**:

- `lite.day` - Lightweight basemap (default)
- `normal.day` - Standard street map
- `satellite.day` - Satellite imagery

### Custom Tile Server (Backward Compatible)

You can still use custom tile URLs:

```html
<leaflet-geokit
  tile-url="https://example.com/tiles/{z}/{x}/{y}.png"
></leaflet-geokit>
```

### Security Note

⚠️ For production use, **do not** expose API keys client-side. Use a server-side proxy to request tiles.

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
- npm run build:analyze — generate per-target bundle reports in dist/stats/\*.html
- npm run test:unit — Vitest (happy-dom)
- npm run typecheck — TypeScript noEmit
- npm run lint — ESLint (strict TS rules)
- npm run format — Prettier write
- npm run test:e2e — Playwright (currently a minimal smoke test under e2e/)

Optional workflow tooling

- Spec Kitty is pre-wired as an optional, non-blocking workflow bootstrap.
- `npm run spec-kitty:init` — initialize Spec Kitty in-place (requires `spec-kitty` CLI installed on your machine).
- `npm run spec-kitty:doctor` — validate local Spec Kitty setup (requires `spec-kitty` CLI).
- Build/test/publish scripts do **not** depend on Spec Kitty.

Bundle analysis

- The analyzer is opt-in and does not change normal production outputs.
- Run `npm run build:analyze` to produce one report per target:
  - dist/stats/main.html
  - dist/stats/external.html
  - dist/stats/django.html
  - dist/stats/preact.html
  - dist/stats/preact-bundled.html
  - dist/stats/react.html
  - dist/stats/react-bundled.html
- Read report metrics as:
  - Raw: uncompressed parsed bundle bytes
  - Gzip: transfer cost with gzip compression
  - Brotli: transfer cost with brotli compression

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

The `<leaflet-geokit>` custom element provides a comprehensive API for embedding interactive maps with drawing capabilities. All functionality is exposed through HTML attributes, JavaScript properties, methods, and events.

### HTML Attributes

#### Map Configuration

Configure the initial map view and tile layer:

- **`latitude`** (string number): Initial map latitude coordinate. Default: `"0"`
- **`longitude`** (string number): Initial map longitude coordinate. Default: `"0"`
- **`zoom`** (string number): Initial zoom level. Default: `"2"`
- **`min-zoom`** (string number, optional): Minimum allowed zoom level
- **`max-zoom`** (string number, optional): Maximum allowed zoom level
- **`tile-url`** (string): Tile server URL template with `{z}`, `{x}`, `{y}` placeholders. Default: OpenStreetMap
- **`tile-attribution`** (string, optional): Attribution text for the tile layer

```html
<leaflet-geokit
  latitude="39.7392"
  longitude="-104.9903"
  zoom="11"
  min-zoom="8"
  max-zoom="18"
  tile-url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  tile-attribution="&copy; OpenStreetMap contributors"
></leaflet-geokit>
```

#### Drawing Tools

Enable specific drawing tools by adding boolean attributes (presence = enabled):

- **`draw-polygon`**: Enable polygon drawing tool
- **`draw-polyline`**: Enable polyline/line drawing tool
- **`draw-rectangle`**: Enable rectangle drawing tool
- **`draw-circle`**: Enable circle drawing tool
- **`draw-layer-cake`**: Enable Layer Cake tool for creating concentric donut polygons
- **`draw-marker`**: Enable point marker drawing tool
- **`draw-move`**: Enable move/translate tool for repositioning existing features (with Save/Cancel confirmation)
- **`draw-ruler`**: Enable measurement/ruler tool for distances and areas

```html
<leaflet-geokit
  draw-polygon
  draw-polyline
  draw-rectangle
  draw-circle
  draw-layer-cake
  draw-marker
  draw-move
  draw-ruler
></leaflet-geokit>
```

#### Editing Controls

Control editing and deletion of existing features:

- **`edit-features`**: Enable editing mode for modifying existing shapes
- **`delete-features`**: Enable deletion mode for removing shapes

```html
<leaflet-geokit draw-polygon edit-features delete-features></leaflet-geokit>
```

#### Behavior Modifiers

- **`read-only`**: Disables all drawing, editing, and deleting tools. Map becomes view-only
- **`polygon-allow-intersection`**: Allows polygons to intersect/overlap during drawing
- **`prefer-canvas`**: Use Canvas rendering instead of SVG for better performance with large datasets. Default: `true`

```html
<leaflet-geokit read-only></leaflet-geokit>
<leaflet-geokit draw-polygon polygon-allow-intersection></leaflet-geokit>
<leaflet-geokit prefer-canvas="false"></leaflet-geokit>
```

#### Theming & Styling

Customize the visual appearance:

- **`theme-url`** (string, optional): External CSS stylesheet URL to inject into Shadow DOM
- **`themeCss`** (property only): Inline CSS strings for custom styling

```html
<leaflet-geokit theme-url="/css/custom-map-theme.css"></leaflet-geokit>
```

#### Debugging & Development

- **`log-level`** (string): Control console logging verbosity. Options: `trace`, `debug`, `info`, `warn`, `error`, `silent`. Default: `"debug"`
- **`dev-overlay`** (boolean): Reserved for future development overlay features

```html
<leaflet-geokit log-level="info"></leaflet-geokit>
```

### JavaScript Properties

All attributes have corresponding JavaScript properties for runtime access and modification:

```javascript
const map = document.querySelector("leaflet-geokit");

// Map configuration
map.latitude = 40.7128; // number
map.longitude = -74.006; // number
map.zoom = 12; // number
map.minZoom = 8; // number | undefined
map.maxZoom = 18; // number | undefined
map.tileUrl = "https://..."; // string
map.tileAttribution = "..."; // string | undefined

// Behavior
map.readOnly = true; // boolean
map.preferCanvas = false; // boolean
map.logLevel = "info"; // LogLevel

// Theming
map.themeCss = `
  .leaflet-container { font-family: "Inter", sans-serif; }
  .leaflet-draw-toolbar a { border-radius: 8px; }
`;
```

### Methods

All methods return Promises and should be awaited. Invoke on the element instance:

#### Data Management

**[`getGeoJSON()`](src/components/LeafletDrawMapElement.ts:384)**: Promise<FeatureCollection>

- Returns current map data as a GeoJSON FeatureCollection
- Includes all drawn features with stable IDs

```javascript
const data = await map.getGeoJSON();
console.log(`${data.features.length} features on map`);
```

**[`loadGeoJSON(fc)`](src/components/LeafletDrawMapElement.ts:390)**: Promise<void>

- Clears existing data and loads new FeatureCollection
- Does NOT auto-fit the view (use [`fitBoundsToData()`](src/components/LeafletDrawMapElement.ts:428) separately)
- Triggers [`leaflet-draw:ingest`](src/types/events.ts:51) event before loading

```javascript
await map.loadGeoJSON({
  type: "FeatureCollection",
  features: [
    /* ... */
  ],
});
```

**[`addFeatures(fc)`](src/components/LeafletDrawMapElement.ts:406)**: Promise<string[]>

- Adds features to existing map data (does not clear)
- Returns array of assigned stable feature IDs
- Triggers [`leaflet-draw:ingest`](src/types/events.ts:51) event before adding

```javascript
const ids = await map.addFeatures(newFeatures);
console.log("Added features with IDs:", ids);
```

**[`clearLayers()`](src/components/LeafletDrawMapElement.ts:400)**: Promise<void>

- Removes all features from map and internal storage

```javascript
await map.clearLayers();
```

#### Individual Feature Operations

**[`updateFeature(id, feature)`](src/components/LeafletDrawMapElement.ts:416)**: Promise<void>

- Replaces an existing feature by ID
- Visual synchronization is progressively enhanced

```javascript
await map.updateFeature(featureId, {
  type: "Feature",
  properties: { name: "Updated" },
  geometry: {
    /* ... */
  },
});
```

**[`removeFeature(id)`](src/components/LeafletDrawMapElement.ts:422)**: Promise<void>

- Removes a feature and its visual representation by ID

```javascript
await map.removeFeature(featureId);
```

#### View Control

**[`setView(lat, lng, zoom?)`](src/components/LeafletDrawMapElement.ts:448)**: Promise<void>

- Sets map center and optionally zoom level
- Updates element properties to maintain consistency

```javascript
await map.setView(39.7392, -104.9903, 12);
```

**[`fitBoundsToData(padding?)`](src/components/LeafletDrawMapElement.ts:428)**: Promise<void>

- Automatically fits map view to show all current data
- Optional padding as ratio of bounds size (default: 0.05 = 5%)

```javascript
await map.fitBoundsToData(0.1); // 10% padding
```

**[`fitBounds(bounds, padding?)`](src/components/LeafletDrawMapElement.ts:436)**: Promise<void>

- Fits map view to specified bounds
- Bounds format: `[[south, west], [north, east]]`
- Optional padding ratio (default: 0.05)

```javascript
await map.fitBounds(
  [
    [39.6, -105.1], // southwest
    [39.8, -104.8], // northeast
  ],
  0.05,
);
```

#### Data Import Helpers

**[`loadGeoJSONFromUrl(url)`](src/components/LeafletDrawMapElement.ts:510)**: Promise<void>

- Fetches GeoJSON from URL and loads it
- Expects `application/json` content type
- Automatically fits view to loaded data
- Emits error events on fetch/parse failures

```javascript
await map.loadGeoJSONFromUrl("/api/geodata.json");
```

**[`loadGeoJSONFromText(text)`](src/components/LeafletDrawMapElement.ts:533)**: Promise<void>

- Parses GeoJSON from text string and loads it
- Automatically fits view to loaded data
- Emits error events on parse failures

```javascript
const text = await file.text();
await map.loadGeoJSONFromText(text);
```

**[`exportGeoJSON()`](src/components/LeafletDrawMapElement.ts:459)**: Promise<FeatureCollection>

- Exports current data and emits [`leaflet-draw:export`](src/types/events.ts:57) event
- Returns the FeatureCollection for convenience
- Useful for triggering export workflows

```javascript
const exported = await map.exportGeoJSON();
// Listen for the event to trigger download/save workflows
```

#### Advanced Features

**[`mergePolygons(options?)`](src/components/LeafletDrawMapElement.ts:475)**: Promise<string | null>

- Merges all visible polygon features into a single polygon
- Removes original polygons and creates new merged feature
- Returns ID of merged feature, or null if no polygons to merge
- Emits `leaflet-draw:merged` event with merge details

```javascript
const mergedId = await map.mergePolygons({
  properties: { name: "Merged Area", type: "combined" },
});
```

**[`setMeasurementUnits(system)`](src/components/LeafletDrawMapElement.ts:504)**: Promise<void>

- Changes measurement system for ruler tool
- Options: `"metric"` (meters/kilometers) or `"imperial"` (feet/miles)

```javascript
await map.setMeasurementUnits("imperial");
```

### Events

The component emits typed CustomEvents that can be listened to for real-time updates. All events include structured `detail` objects.

#### Core Lifecycle Events

**[`leaflet-draw:ready`](src/types/events.ts:7)**

- Fired when map is fully initialized and ready for interaction
- Detail: `{ bounds?: [[number, number], [number, number]] }`

```javascript
map.addEventListener("leaflet-draw:ready", (e) => {
  console.log("Map ready!", e.detail.bounds);
});
```

**[`leaflet-draw:error`](src/types/events.ts:42)**

- Fired when errors occur (fetch failures, parse errors, etc.)
- Detail: `{ message: string, cause?: unknown }`

```javascript
map.addEventListener("leaflet-draw:error", (e) => {
  console.error("Map error:", e.detail.message, e.detail.cause);
});
```

#### Drawing & Editing Events

**[`leaflet-draw:created`](src/types/events.ts:15)**

- Fired when user creates a new feature via drawing tools
- Detail: `{ id: string, layerType: string, geoJSON: Feature }`
- Layer types: `'polygon'`, `'polyline'`, `'rectangle'`, `'circle'`, `'marker'`

```javascript
map.addEventListener('leaflet-draw:created', (e) => {
  const { id, layerType, geoJSON } = e.detail;
  console.log(`Created ${layerType} with ID: ${id}`);

  // Save to your backend
  await saveFeature(id, geoJSON);
});
```

**[`leaflet-draw:edited`](src/types/events.ts:25)**

- Fired when user modifies existing features via edit tools
- Detail: `{ ids: string[], geoJSON: FeatureCollection }`
- Includes all edited feature IDs and current state

```javascript
map.addEventListener('leaflet-draw:edited', (e) => {
  const { ids, geoJSON } = e.detail;
  console.log(`Edited ${ids.length} features`);

  // Sync changes to backend
  for (const id of ids) {
    const feature = geoJSON.features.find(f => f.id === id);
    if (feature) await updateFeature(id, feature);
  }
});
```

**[`leaflet-draw:deleted`](src/types/events.ts:34)**

- Fired when user deletes features via delete tools
- Detail: `{ ids: string[], geoJSON: FeatureCollection }`
- `geoJSON` contains remaining features (after deletion)

```javascript
map.addEventListener('leaflet-draw:deleted', (e) => {
  const { ids } = e.detail;
  console.log(`Deleted features: ${ids.join(', ')}`);

  // Remove from backend
  for (const id of ids) {
    await deleteFeature(id);
  }
});
```

#### Data Flow Events

**[`leaflet-draw:ingest`](src/types/events.ts:51)**

- Fired BEFORE data is loaded/added to the map
- Detail: `{ fc: FeatureCollection, mode: 'load' | 'add' }`
- Listeners can mutate `detail.fc` to transform incoming data
- Useful for data validation, filtering, or preprocessing

```javascript
map.addEventListener("leaflet-draw:ingest", (e) => {
  const { fc, mode } = e.detail;

  // Filter out invalid features
  e.detail.fc.features = fc.features.filter(
    (f) => f.geometry && f.geometry.coordinates.length > 0,
  );

  // Add default properties
  e.detail.fc.features.forEach((f) => {
    f.properties = {
      ...f.properties,
      imported: true,
      timestamp: Date.now(),
    };
  });
});
```

**[`leaflet-draw:export`](src/types/events.ts:57)**

- Fired when [`exportGeoJSON()`](src/components/LeafletDrawMapElement.ts:459) method is called
- Detail: `{ geoJSON: FeatureCollection, featureCount: number }`
- Use for triggering download workflows

```javascript
map.addEventListener("leaflet-draw:export", (e) => {
  const { geoJSON, featureCount } = e.detail;

  // Create download link
  const blob = new Blob([JSON.stringify(geoJSON, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `map-data-${new Date().toISOString()}.geojson`;
  a.click();
});
```

#### Extended Tool Events

**`leaflet-draw:drawstart`** / **`leaflet-draw:drawstop`**

- Fired when drawing mode starts/stops
- Useful for UI state management

**`leaflet-draw:editstart`** / **`leaflet-draw:editstop`**

- Fired when edit mode starts/stops

**`leaflet-draw:merged`**

- Fired after successful polygon merge operation
- Detail includes merge statistics and result

```javascript
// Show/hide UI elements based on draw state
map.addEventListener("leaflet-draw:drawstart", () => {
  document.querySelector("#toolbar").classList.add("drawing-active");
});

map.addEventListener("leaflet-draw:drawstop", () => {
  document.querySelector("#toolbar").classList.remove("drawing-active");
});
```

### Feature ID Management

The component guarantees stable, persistent feature IDs that survive editing operations:

1. **Explicit IDs**: If a feature has `feature.id` property, it's preserved
2. **Property IDs**: If no `feature.id` but has `properties.id`, that's used
3. **Generated IDs**: Otherwise, a UUID is generated and stored in `properties.id`

```javascript
// Features maintain their IDs through edit cycles
const data = await map.getGeoJSON();
data.features.forEach((f) => {
  console.log(`Feature ID: ${f.id}, Properties ID: ${f.properties?.id}`);
});
```

### TypeScript Support

Full TypeScript definitions are provided in [`src/types/public.ts`](src/types/public.ts) and [`src/types/events.ts`](src/types/events.ts):

```typescript
import type {
  LeafletDrawMapElementAPI,
  MeasurementSystem,
} from "@florasync/leaflet-geokit";
import type {
  CreatedEventDetail,
  EditedEventDetail,
} from "@florasync/leaflet-geokit/events";

const map = document.querySelector(
  "leaflet-geokit",
) as LeafletDrawMapElementAPI;

map.addEventListener(
  "leaflet-draw:created",
  (e: CustomEvent<CreatedEventDetail>) => {
    const { id, layerType, geoJSON } = e.detail;
    // Fully typed event handling
  },
);
```

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
  draw-move
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

## Framework Support

This section is the canonical place to discover first-class framework integrations for this project.

Current framework support:

- Django: [docs/shims/django.md](docs/shims/django.md)
- Preact: [docs/shims/preact.md](docs/shims/preact.md)
- React: [docs/shims/react.md](docs/shims/react.md)

### Django

Use the Django shim when your source of truth is a form field (`<textarea>`) and you want map edits synchronized to submitted GeoJSON.

- Shim docs: [docs/shims/django.md](docs/shims/django.md)
- Entrypoint: [src/django/index.ts](src/django/index.ts)

Quick import path:

```ts
import { initDjangoGeokit } from "@florasync/leaflet-geokit/django";
```

### Preact

Use the Preact wrappers when you want component-level integration in Preact apps. We provide pre-baked wrappers that handle the custom element lifecycle and event synchronization.

- **Runtime dependency model**: Preact is consumer-provided (peer dependency), so wrapper bundles stay thin.
- **Shim docs**: [docs/shims/preact.md](docs/shims/preact.md)
- **Entrypoints**: [src/preact/index.tsx](src/preact/index.tsx), [src/preact-bundled/index.tsx](src/preact-bundled/index.tsx)

#### Preact wrapper (additive Leaflet mode)

If your Preact app already loads Leaflet + Leaflet.draw, use the Preact shim:

```ts
import { PreactLeafletGeoKit } from "@florasync/leaflet-geokit/preact";
```

It mounts `<leaflet-geokit>` in additive mode by default (`use-external-leaflet` + `skip-leaflet-styles`) and syncs GeoJSON via callbacks.

```tsx
<PreactLeafletGeoKit
  style={{ width: "100%", height: "420px" }}
  attributes={{
    latitude: 39.7392,
    longitude: -104.9903,
    zoom: 11,
    "draw-polygon": true,
    "edit-features": true,
  }}
  onChangeText={(text) => {
    // Persist serialized FeatureCollection
    console.log(text);
  }}
/>
```

For apps that do **not** preload Leaflet/Leaflet.draw, use the bundled Preact entrypoint:

```ts
import { PreactLeafletGeoKit } from "@florasync/leaflet-geokit/preact-bundled";
```

See full Preact shim docs: [docs/shims/preact.md](docs/shims/preact.md)

### React

Use the React wrappers when you want component-level integration in React apps. These wrappers provide a first-class React experience for the web component.

- **Runtime dependency model**: React/ReactDOM are consumer-provided (peer dependencies), so wrapper bundles stay thin.
- **Shim docs**: [docs/shims/react.md](docs/shims/react.md)
- **Entrypoints**: [src/react/index.tsx](src/react/index.tsx), [src/react-bundled/index.tsx](src/react-bundled/index.tsx)

#### React wrapper (additive Leaflet mode)

If your React app already loads Leaflet + Leaflet.draw, use the React shim:

```ts
import { ReactLeafletGeoKit } from "@florasync/leaflet-geokit/react";
```

For apps that do **not** preload Leaflet/Leaflet.draw, use the bundled React entrypoint:

```ts
import { ReactLeafletGeoKit } from "@florasync/leaflet-geokit/react-bundled";
```

See full React shim docs: [docs/shims/react.md](docs/shims/react.md)

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

6. Runtime theming (CSS injection)

- Provide a theme stylesheet URL via the theme-url attribute.
- Provide inline CSS overrides via the themeCss property.
- Cascade order is: built-in Leaflet styles → theme-url → themeCss.
- Updates are dynamic; changing theme-url or themeCss updates the Shadow DOM styles in place.

```html
<leaflet-geokit
  theme-url="/themes/geokit-brand.css"
  draw-polygon
  edit-features
></leaflet-geokit>
```

```js
const el = document.querySelector("leaflet-geokit");
el.themeCss = `
  .leaflet-container { font-family: "Inter", sans-serif; }
  .leaflet-draw-toolbar a { border-radius: 8px; }
`;
```

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
