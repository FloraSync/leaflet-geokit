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

The generic `createMapLibreBasemapAdapter` remains dependency-injected. For a
concrete, optional MapLibre/PMTiles implementation, use the new
[`/pmtiles` entrypoint](pmtiles.md). It leaves renderer dependencies out of core
and retains Leaflet.draw. The optional browser suite exercises a real licensed
PMTiles archive, range/CORS requests, actual WebGL pixels, drawing and teardown.
Offline operation and production Protomaps styles/assets are not implied.

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
feature preservation. Actual WebGL/PMTiles is covered separately by
`npm run test:e2e:pmtiles`; see [optional adapter verification](pmtiles.md).
