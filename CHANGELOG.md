# Changelog

## Unreleased

- Added `draw-move` support to all dev harness variants so the Move/Translate toolbar tool is visible in Bundled WC, External WC, React, React (Bundled), Preact, and Preact (Bundled) demos.
- Improved Move tool drag stability by anchoring translation to the initial drag-start pointer location, reducing jitter while repositioning GeoJSON features.
- Kept Move confirmation workflow (`Save`/`Cancel`) and ensured docs/examples now include `draw-move` in supported draw attributes.
- Expanded move-related test coverage for draw option wiring in `MapController`.

## 0.4.0

- Added multi-page dev harness for live prototyping across all integration variants (Bundled WC, External WC, Preact, React).
- Added navigation menu to dev harness for easy switching between test scenarios.
- Improved dev harness UI with consistent geocoder, GeoJSON panel, and toast notifications across all pages.
- Added `rollup-plugin-visualizer` for bundle analysis across all entrypoints.
- Updated dependencies (Playwright, Preact, React).
- Reduced package size to ~130kb rendered (still requires leaflet and leaflet-draw as peer dependencies).

## 0.3.0

- Added first-class Preact wrapper entrypoints: `@florasync/leaflet-geokit/preact` and `@florasync/leaflet-geokit/preact-bundled`.
- Added first-class React wrapper entrypoints: `@florasync/leaflet-geokit/react` and `@florasync/leaflet-geokit/react-bundled`.
- Added real external entrypoint export: `@florasync/leaflet-geokit/external`.
- Added dedicated external build artifact (`dist/leaflet-geokit.external.es.js`) with Leaflet stack externalized.
- External mode now hard-falls back to bundled Leaflet/Draw when requested external Draw APIs are incomplete.
- Django shim no longer auto-initializes; consumers must call `window.GeoKitDjango.init(...)` explicitly.
- Added `elementAttributes` option to `initDjangoGeokit` for programmatic attribute overrides (takes precedence over textarea data attributes).
- Corrected framework wrapper naming: removed mistaken React-named Preact wrapper entrypoints.

## 0.2.0

- Added thin Django shim layer for easy integration in Django templates without build tooling.
- Added `initDjangoGeokit` helper to initialize GeoKit on a textarea with data attributes for configuration.
- Added `django` export entrypoint for the Django shim.

## 0.1.0

- Initial release.
