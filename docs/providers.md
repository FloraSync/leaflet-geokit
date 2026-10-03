# Provider abstraction v2

## Contents

- [Compatibility and boundary](#compatibility-and-boundary)
- [Public API](#public-api)
- [MapLibre and PMTiles execution path](#maplibre-and-pmtiles-execution-path)
- [Capability diagnostics](#capability-diagnostics)
- [Security and vendor independence](#security-and-vendor-independence)
- [Verification and limitations](#verification-and-limitations)

## Compatibility and boundary

Implemented against package version 0.8.3. Leaflet + OSM remains the default;
no vendor SDK, paid account, or new runtime dependency is added.

The existing `tile-provider="osm"`, `tile-provider="here"`, `tile-style`,
`api-key` / `here-api-key`, and custom `tile-url` / `tile-attribution` paths
remain intact. Custom URLs use `tile-url`, not a new `tile-provider="custom"`
identifier. Clear `tileProvider` to use a custom URL.

Three separate ports are declared in `src/lib/providers.ts`:

1. `RasterTileProvider`: resolves a URL template and tile options. The legacy
   OSM/HERE factory remains the source of truth; custom URLs have their own factory.
2. `VectorBasemapProvider`: creates a fresh, unmounted Leaflet layer through an
   injected renderer bridge. GeoKit retains map ownership and existing draw tools.
3. `DrawEngineAdapter<Context, Document, Command>`: attach/read/write/execute/dispose
   contract for a future draw-engine replacement. This is a **design port**, not
   a claim that Leaflet.draw has been refactored or native MapLibre/Google drawing
   is implemented. Current drawing and completed irrigation work are reused as-is.

Renderer-specific dependencies belong outside core. A native map renderer swap
would need a draw adapter implementing GeoJSON and public tool lifecycle parity.
Do not mistake the basemap seam for that much larger project.

## Public API

Both root and `/external` entrypoints export the provider contracts and factories:

- `createRasterProvider({ provider: "osm" | "here", ... })`
- `createCustomRasterProvider({ urlTemplate, attribution, ... })`
- `createMapLibreBasemapAdapter({ createLayer, attribution, offline?, apiKey? })`
- `getProviderDiagnostics(provider, attribution)` (pure configuration report)

The existing element gains:

- `setBasemapAdapter(adapter)` after `ready`: replace only the basemap.
- `setBasemapAdapter(null)`: restore the current raster attributes/properties.
- `getProviderDiagnostics()`: detached configuration snapshot, or null before
  initialization / after disconnect.

The adapter's layer must clean up renderer workers, event handlers and resources
in Leaflet `onRemove`. GeoKit removes it on swap and map destruction. Return a
fresh layer each time; mounted/reused layers are rejected. A synchronous vector
mount failure leaves the previous basemap active. Missing required attribution
is rejected before mounting. Async renderer load errors are the optional bridge's
responsibility; restore `null` explicitly if the host wants raster fallback.

Existing provider attributes override an active adapter when changed. Reconnect
restores raster configuration; reapply the adapter after readiness. Geometry,
feature IDs, existing draw controls, read-only state and public tool events remain
owned by GeoKit. `tile-provider-changed` reports `provider: "adapter"`; tool
capabilities report `requested/active: "adapter"` without vendor configuration.

## MapLibre and PMTiles execution path

This release ships a **dependency-injected feasibility shim**, not a production
WebGL renderer. The next optional adapter package can use the existing public
`setBasemapAdapter` method without changing web component consumers.

Host-side experiment (not installed by this slice):

1. Create a separate adapter/example package. Select and pin mutually compatible
   `leaflet`, `maplibre-gl`, `@maplibre/maplibre-gl-leaflet`, and `pmtiles` versions.
   The current upstream bridge documentation uses a named `maplibreGL` export;
   older bridge versions use different registration patterns. Recheck the selected
   release, rather than copying a historical global `L.maplibreGL` call.
2. Use GeoKit's external entrypoint and one shared Leaflet instance. Load Leaflet,
   draw and MapLibre styles, configure MapLibre's worker/CSP requirements, and
   supply `leafletInstance` before connecting the element.
3. Register PMTiles once per host application. Feed the bridge a style whose source
   is `type: "vector", url: "pmtiles://https://your-host/region.pmtiles"`.
   PMTiles is a tile archive transport, not a renderer; it also supports raster
   archives. This vector bridge contract describes the rendering path, not every
   source inside a MapLibre style.
4. Wrap the bridge factory in the shipped shim:

```ts
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { createMapLibreBasemapAdapter } from "@florasync/leaflet-geokit/external";

// Host initialization: once, using the SAME MapLibre module as the bridge.
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// After GeoKit ready; /maps/style.json contains the PMTiles source.
mapElement.setBasemapAdapter(
  createMapLibreBasemapAdapter({
    createLayer: () => maplibreGL({ style: "/maps/style.json" }),
    attribution: "Your licensed dataset attribution",
    offline: "host-managed",
    apiKey: "none",
  }),
);

// Remove all maps/bridges BEFORE host-global protocol teardown.
mapElement.setBasemapAdapter(null);
maplibregl.removeProtocol("pmtiles");
```

This recipe is sourced from upstream APIs, but the optional packages and actual
archive rendering are **not exercised by this slice**. Before production promotion:

- Verify HTTP range requests, CORS, archive content type, source-layer names,
  fonts, sprites and licensing with an owned fixture archive.
- Verify offline mode with network disabled and all required assets provisioned.
  `host-managed` declares potential, not a cache implementation or permission.
- Exercise pan/zoom, high-DPI, touch, resize, WebGL loss, worker/CSP failures,
  renderer error fallback, repeated swaps and multiple simultaneous maps.
- Keep drawing above the basemap and pointer events with Leaflet. The upstream
  bridge has no pitch/rotation support and recommends minZoom 1 plus bounds
  restrictions to avoid renderer synchronization issues. Test those explicitly.
- Confirm no duplicate Leaflet/MapLibre module instances and no worker/listener
  leaks on removal. Do not remove a global PMTiles protocol still used by another map.

Sources:
[MapLibre Leaflet bridge](https://github.com/maplibre/maplibre-gl-leaflet),
[PMTiles protocol integration](https://docs.protomaps.com/pmtiles/maplibre).

## Capability diagnostics

Reports contain only: `kind`, `attribution`, `attributionRequired`, `offline`,
`apiKey`, `drawing`, `scope`. No URLs, keys, style JSON, attribution HTML, arbitrary
error payloads or vendor metadata are returned. `scope: "configuration"` explicitly
means this is not a tile-load health, key-validity or renderer-readiness probe.
Use existing provider/status events for runtime failures.

| Path             | Kind   | API key                 | Offline            | Drawing      |
| ---------------- | ------ | ----------------------- | ------------------ | ------------ |
| OSM public tiles | raster | none                    | unsupported        | leaflet-draw |
| HERE built-in    | raster | required                | unsupported        | leaflet-draw |
| Custom tile URL  | raster | host-defined            | unknown            | leaflet-draw |
| MapLibre shim    | vector | host-defined by default | unknown by default | leaflet-draw |

Attribution is `present` or `missing`, not a legal-compliance validation. Hosts
must provide the required data/vendor notices even for offline maps. Missing
attribution on a legacy custom URL is reported, not a breaking rejection.
Capability declarations are trusted host configuration, not telemetry evidence.

## Security and vendor independence

- Never put server credentials, signing secrets, service-account material or
  unrestricted paid-vendor keys into HTML, attributes, browser bundles, URLs,
  diagnostics, screenshots, logs or exported GeoJSON. A key passed through a JS
  property instead of an attribute is **still visible to the browser**.
- Existing HERE browser key support is compatibility, not the blessed production
  path. Use a vendor-approved server-side gateway with application authentication,
  rate limits and quotas when that product permits it. A proxy must not become an
  open paid API relay, and cannot bypass vendor licensing or conceal keys required
  by a browser SDK. See [Google adapter spike](google-maps-adapter-spike.md).
- Some SDKs necessarily use public browser identifiers. Such an optional deployment
  requires an explicit security/billing decision, origin + API restrictions,
  separate environments, usage monitoring, quotas and a revocation plan. These
  controls reduce abuse; they do not turn browser identifiers into secrets.
- Attribution is trusted HTML passed to Leaflet. Sanitize remote/untrusted inputs.
  Bridge code, style sources, worker URLs and tile URLs are trusted host input;
  apply CSP/allowlists and avoid sending private grower data to an unapproved vendor.
- No automatic paid fallback, provisioning, billing integration or FloraSync API
  wiring. Keep user data in GeoJSON with stable IDs and retain a tested OSM/custom
  path. A commercial style or archive license must not trap user-authored geometry.
- Public OSM tiles are not an offline/bulk-download service. Self-host appropriately
  licensed data for offline deployments; offline capability is not vendor permission.

## Verification and limitations

```sh
npm run test:unit:focused -- tests/providers.spec.ts tests/tile-provider-factory.spec.ts tests/component-tile-provider.spec.ts tests/map-controller.spec.ts
npx playwright test -c playwright.providers.config.ts
npm run typecheck
npm run build
```

The Chromium test uses the existing irrigation harness and real Leaflet/Draw.
External raster requests are intercepted with deterministic image fixtures; HERE
credentials and service access are not tested. The vector fixture is deliberately
an injected Leaflet layer, not an imitation MapLibre renderer. It proves the shim
boundary, attribution, diagnostics, public switching and real pointer drawing with
feature preservation. Actual WebGL/PMTiles is the optional follow-on gate above.
