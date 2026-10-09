# PMTiles local verification

## Scope and base

- Worktree: `/home/shoecifer/Code/FloraSync/workspace/carlos-geokit-pmtiles`
- Branch: `carlos/geokit-pmtiles`
- Base: fetched `origin/main`, `8ca43b5caee4b33b23b838ea9750c18bf207edbb`.
- Shared dirty checkout was not edited, stashed or reset. Nothing published,
  pushed, deployed or changed in application environments.
- Local runtime: Node `v26.7.0`, npm `11.19.0`, Chromium `145.0.7632.6`.
- Renderer: MapLibre `5.24.0`, bridge `0.1.4`, PMTiles `4.5.0`.

## Executed checks

All commands below ran from the worktree unless specified.

| Command                                                                                                                                                                        | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                                                                            | Passed                                                                                                                                                                                         |
| `npm run build`                                                                                                                                                                | Passed; all existing builds plus optional entrypoint                                                                                                                                           |
| `npm run lint`                                                                                                                                                                 | Exit 0; three existing unused-variable warnings, no errors                                                                                                                                     |
| `npm run test:unit:focused -- tests/pmtiles.spec.ts tests/providers.spec.ts tests/component-tile-provider.spec.ts tests/map-controller.spec.ts tests/component-events.spec.ts` | 5 files, 59 passed                                                                                                                                                                             |
| `npm run test:unit:focused`                                                                                                                                                    | 53 files, 393 passed, 4 skipped; existing happy-dom theme-fetch abort messages on stderr                                                                                                       |
| `npm run test:e2e:pmtiles`                                                                                                                                                     | 5 passed; real WebGL and actual WebGL-disabled browser paths                                                                                                                                   |
| `CHOKIDAR_USEPOLLING=true npx playwright test -c playwright.providers.config.ts`                                                                                               | 23 passed (provider test plus inherited touch projects)                                                                                                                                        |
| `node scripts/verify-pmtiles-bundle.mjs`                                                                                                                                       | Passed; core ES/UMD have 116 source-map entries each, external has 113; none contain MapLibre/PMTiles modules. Optional entrypoint 2403 bytes with all peers external and declarations present |
| `npm pack --ignore-scripts --pack-destination "$TMPDIR" --json`                                                                                                                | Local tarball produced; optional JS, declarations and documentation included                                                                                                                   |
| `git diff --check`                                                                                                                                                             | Passed                                                                                                                                                                                         |

A consumer installed the tarball under `test-results/pmtiles-consumer/` with
`npm install --ignore-scripts` (after an initial `--omit=optional` install).
Filesystem assertions confirmed that a default consumer install contains none
of `maplibre-gl`, `pmtiles`, or `@maplibre/maplibre-gl-leaflet`, while the packaged
optional entrypoint and its declaration file exist. No npm publish was run.

## Browser evidence

The suite imports built `/external` and `/pmtiles` artifacts, not just source.
It uses the real bridge, MapLibre worker/WebGL and PMTiles decoder, without
intercepted vector responses or a mock renderer. The original MIT-licensed
synthetic geometry is encoded in a checked-in PMTiles v3/MVT archive; see
[fixture provenance](../test-data/pmtiles/README.md).

Observed real HTTP range responses include:

- `Range: bytes=0-16383` → `206`, `Content-Range: bytes 0-419/420`.
- `Range: bytes=303-419` → `206`, `Content-Range: bytes 303-419/420`.
- Archive origin is port 5198, page origin port 5197; CORS explicitly allows the
  page origin and exposes range/ETag headers.
- A rendered center pixel read from the real WebGL framebuffer was
  `[25, 135, 84, 255]`, matching the style's green polygon rather than background.

Tests exercise real pointer polygon creation above vector fields; preservation
of the complete GeoJSON and IDs across three raster/vector cycles; attribution;
view synchronization; two simultaneous maps; renderer `remove` events and DOM
cleanup; guarded/idempotent protocol teardown; HTTP error fallback; same-origin
example hosting; and WebGL-disabled synchronous construction rollback.

Artifacts (relative to worktree):

- `test-results/pmtiles/pmtiles-real-archive-range-f48bb--drawing-swaps-and-teardown/pmtiles-drawing.png`
- `test-results/pmtiles/pmtiles-real-archive-range-f48bb--drawing-swaps-and-teardown/range-evidence.json`
- `dist/leaflet-geokit.pmtiles.es.js` and `dist/types/pmtiles.d.ts`

Screenshot was visually inspected: green archive polygons, valid Leaflet marker,
blue drawn polygon above them, controls and attribution all visible.

## Issues found and resolved

The real integration exposed `leaflet-draw:ready` being emitted while status was
still `ready: false`, making a synchronous `setBasemapAdapter` ready listener
throw. The component now sets ready status before dispatch; the example/browser
suite is a regression check. A bridge WebGL constructor failure also needs the
half-created container cleaned up; this is verified using `--disable-webgl`.

The legacy provider server initially failed with host inotify `EMFILE`; rerunning
with scoped `CHOKIDAR_USEPOLLING=true` passed, without changing host limits.
The new PMTiles server already uses polling. Existing Vite framework chunking
warnings and Node module-loader deprecation warnings remain.

## Not verified / not claimed

No offline support, production Protomaps basemap style/schema, remote production
hosting, large archive performance, fonts/sprites, mobile GPU/high-DPI behavior,
WebGL context restoration, CSP restrictions, or heap/worker leak audit is claimed.
The tested archive is synthetic, not an OSM or real geographic extract. Offline
capability remains `unknown`. The full default Playwright suite and Node 20/24
matrix were not run; the commands above are the exact local verification scope.
