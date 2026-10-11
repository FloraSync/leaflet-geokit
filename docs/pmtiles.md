# Optional Protomaps / PMTiles basemaps

GeoKit's `/pmtiles` entrypoint supplies a concrete MapLibre-to-Leaflet adapter.
The core and `/external` entrypoints do not import renderer dependencies. Install
these optional peers only when using this entrypoint:

```sh
npm install maplibre-gl@5.24.0 @maplibre/maplibre-gl-leaflet@0.1.4 pmtiles@4.5.0
```

These exact versions, Leaflet 1.9.4 and Leaflet.draw 1.0.4 are exercised by the
browser fixture. MapLibre 6 is not claimed as verified. The bridge's named
`maplibreGL` export and `getMaplibreMap()` API are used, not historical global
`L.maplibreGL` registration. Use **one** shared Leaflet and MapLibre installation;
use GeoKit `/external`, not the core bundle's private Leaflet copy.

## Usage

```ts
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { LeafletDrawMapElement } from "@florasync/leaflet-geokit/external";
import {
  createPMTilesBasemapAdapter,
  registerPMTilesProtocol,
} from "@florasync/leaflet-geokit/pmtiles";

const releaseProtocol = registerPMTilesProtocol();
const element = new LeafletDrawMapElement();
element.leafletInstance = L; // before connecting
// Configure latitude/longitude/zoom, draw tools and licensed raster fallback.
element.setAttribute("min-zoom", "1");
const adapter = createPMTilesBasemapAdapter({
  attribution: "Your dataset's required attribution (trusted HTML)",
  style: {
    version: 8,
    sources: {
      region: {
        type: "vector",
        url: "pmtiles://https://your-host/region.pmtiles",
      },
    },
    layers: [
      {
        id: "water",
        type: "fill",
        source: "region",
        "source-layer": "water",
        paint: { "fill-color": "#a0c8e8" },
      },
    ],
  },
  onMap(map) {
    map.on("error", (event) => {
      // Host decides whether to report, retry or restore raster. No paid fallback.
      console.warn("Basemap failed", event.error);
    });
  },
});
element.addEventListener("leaflet-draw:ready", () => {
  element.setBasemapAdapter(adapter);
});
document.body.append(element);

// Later: removes the renderer, not your Leaflet-drawn features.
element.setBasemapAdapter(null);
element.remove();
releaseProtocol();
```

Supply your own MapLibre style object or URL. **PMTiles is archive transport, not
a basemap schema or a style generator.** For a Protomaps basemap archive, use the
matching Protomaps style/source-layer schema, glyphs, sprites and data attribution.
GeoKit deliberately does not guess those from an archive name. Remote style URLs,
attribution HTML, URLs and callbacks must be trusted application input.

`onMap` runs immediately after mount, before asynchronous `load`/`error` events;
use it to attach listeners. Each mount gets a fresh layer and MapLibre map. The
bridge owns `Map.remove()` on raster switch/disconnect; do not remove that map
yourself. `onMap` exceptions roll back mounting. A synchronous WebGL constructor
failure removes the half-created container and the existing raster stays active.
Async network/render errors do not automatically change providers.

`registerPMTilesProtocol()` returns an idempotent release function. Multiple
calls share the protocol/cache; final release throws while GeoKit PMTiles layers
are mounted, so callers may retry after removal. It has **exclusive ownership of
the MapLibre `pmtiles` scheme**. Do not combine it with your own registration or
multiple bundled copies of this optional entrypoint. If your application already
registers `new Protocol().tile` with MapLibre, omit this helper and keep protocol
teardown entirely application-owned (including other non-GeoKit maps).

## Runnable example and verification

From a checkout:

```sh
npm ci --ignore-scripts
npm run build
npm run dev
# Open http://localhost:5173/pmtiles.html
```

`pmtiles.html` / `examples/pmtiles.ts` use the **built** optional and external
entrypoints with a local, licensed synthetic archive. No external map server,
API key, fonts or sprites are required. Draw a polygon, switch to local raster,
then return to PMTiles. The separate test server uses ports 5197 and 5198 for a
real cross-origin range/CORS check:

```sh
npm run typecheck
npm run test:unit:focused -- tests/pmtiles.spec.ts tests/providers.spec.ts tests/component-tile-provider.spec.ts tests/map-controller.spec.ts tests/component-events.spec.ts
npm run build
npm run test:e2e:pmtiles
node scripts/verify-pmtiles-bundle.mjs
```

Chromium with SwiftShader exercises real MapLibre workers, the PMTiles decoder,
HTTP 206/Content-Range/CORS, rendered feature queries and actual WebGL framebuffer
pixels. It also exercises pointer drawing, feature/ID preservation across repeated
switches, view synchronization, two simultaneous maps, renderer remove events,
DOM cleanup, guarded protocol release, HTTP failure/raster fallback and actual
WebGL-disabled browser constructor failure/rollback. Artifacts
are in `test-results/pmtiles/` (screenshot and range/pixel JSON).
See [fixture provenance](../test-data/pmtiles/README.md).

## Boundaries

- **No offline claim.** Capability remains `unknown`. Local HTTP fixture success
  does not test offline caches, service workers, range caches or permission to
  redistribute an archive. Network-disabled behavior is unverified.
- Archive hosting must support byte ranges and CORS, including exposed
  `Content-Range`/`ETag`; do not gzip the whole archive at the HTTP layer.
- Leaflet owns drawing and interaction; the basemap is noninteractive in tilePane.
  Pitch/rotation are not supported. Follow upstream minZoom 1 and latitude/bounds
  guidance for your data; unconstrained global wrap/poles are not certified.
- This fixture is not a production Protomaps global basemap. Large archives,
  production hosting, raster archives, fonts/sprites, high-DPI/touch, mobile GPUs,
  WebGL context loss, restrictive worker/CSP configurations and memory profiling
  still need application-specific validation. DOM/remove-event tests are not a
  heap/worker leak audit.

Upstream references: [Leaflet bridge](https://github.com/maplibre/maplibre-gl-leaflet),
[PMTiles + MapLibre](https://docs.protomaps.com/pmtiles/maplibre),
[Protomaps basemaps](https://docs.protomaps.com/basemaps/).
