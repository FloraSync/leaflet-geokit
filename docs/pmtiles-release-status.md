# PMTiles 0.11.0 release status

## Candidate preparation

0.11.0 is an additive minor release of the optional `/pmtiles` integration.
At preparation, npm latest was 0.10.0 and fetched `main` and `develop` both
pointed at `8ca43b5caee4b33b23b838ea9750c18bf207edbb`, with no divergence.
No unrelated dependency or draft feature PR was included.

The release-candidate workflow now requires real PMTiles browser checks and
bundle isolation in addition to its existing gates. The PMTiles specs run under
their dedicated built-artifact/range-server config, not the generic Vite server.
Publication and exact-source/tarball approval checks are unchanged.

## Local execution

- Formatting: passed.
- Lint: passed with three existing unused-variable warnings.
- `release:dry`: **failed at strict packed-consumer compilation** after successful
  typecheck, coverage unit tests (393 passed, 4 skipped), builds and pack dry-run.
- Complete release Playwright suite: 74 passed, no retries, using a run-owned
  config and port 5297 with polling; initial server startup hit host watcher limits.
- Dedicated real PMTiles browser suite: 5 passed.
- Bundle isolation: passed; no MapLibre/PMTiles modules in core ES, UMD or external
  bundles; optional entrypoint 2403 bytes, peers external, declarations present.

## Publication blocker

Importing `/pmtiles` declarations exposes MapLibre's transitive declarations.
With the required `moduleResolution: NodeNext` and `skipLibCheck: false`, installed
`@maplibre/geojson-vt@6.1.2` and `@maplibre/vt-pbf@4.3.2` produce TS2834 because
relative imports in their published declarations omit file extensions. Those
were also the registry's latest versions at inspection. The error reproduces
with `npm run test:consumer` after building.

Do not bypass this gate with `skipLibCheck`, omit the optional entrypoint from
consumer verification, modify installed dependency declarations, or publish a
locally packed substitute. Resolve the public declaration compatibility first,
then rerun the unchanged strict consumer and full candidate gates. Only a green
`develop` push candidate can promote and provide an immutable release artifact.
The exact resulting source SHA and artifact SHA-256 still require explicit
approval before publication. No 0.11.0 registry artifact or release tag is claimed.
