# Changelog

## 0.1.0

- Initial release.

## Unreleased

- Django shim no longer auto-initializes; consumers must call `window.GeoKitDjango.init(...)` explicitly.
- Added `elementAttributes` option to `initDjangoGeokit` for programmatic attribute overrides (takes precedence over textarea data attributes).
- Corrected framework wrapper naming: removed mistaken React-named Preact wrapper entrypoints.
- Added explicit Preact wrapper entrypoints: `@florasync/leaflet-geokit/preact` and `@florasync/leaflet-geokit/preact-bundled`.
- Added first-class React wrapper entrypoints: `@florasync/leaflet-geokit/react` and `@florasync/leaflet-geokit/react-bundled`.
- Added React shim docs and framework support entries in README.
- Added real external entrypoint export: `@florasync/leaflet-geokit/external`.
- Added dedicated external build artifact (`dist/leaflet-geokit.external.es.js`) with Leaflet stack externalized.
- External mode now hard-falls back to bundled Leaflet/Draw when requested external Draw APIs are incomplete.
