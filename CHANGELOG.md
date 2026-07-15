# Changelog

## Unreleased

## 0.8.1 - 2026-07-15

- Added `toolbarGroups` / `toolbar-groups` for multiple independent map toolbar groups with Leaflet-like corner placement.
- Expanded `toolButtonConfig` / `tool-button-config` with stable `data-geokit-tool` hooks plus custom icons, labels, theme classes, icon renderers, and popover guidance for draw/edit/select/layer-style workflows.
- Added `activateTool(...)` / `deactivateTool(...)` plus public tool trigger events so outside DOM controls can enter and leave draw mode without private Leaflet internals; `triggerTool(...)` remains as a back-compat activation alias.
- Documented the public marker icon customization API in `README.md`, including HTML attributes, `markerIconConfig` precedence, non-fatal fallback behavior, and icon asset guidance for package consumers.
- Added `icon-customization.html` to the multi-page harness with deterministic local tiles, a default marker reference map, and a custom SVG marker comparison map.
- Added focused Playwright visual coverage for icon customization so missing assets, hidden icons, draw-marker regressions, and default-icon fallbacks fail in headless Chromium.
- Added `irrigation-draw-mode.html` and focused Playwright coverage for external panel activation and secondary toolbar polygon drawing.
- Rewrote emitted declaration imports during packaging so consumer entrypoints no longer leak internal `@src/*` aliases.
- Added optional Spec Kitty bootstrap scaffolding via [`.kittify/README.md`](.kittify/README.md) for future spec-driven workflows.
- Added non-blocking Spec Kitty helper scripts in [`package.json`](package.json) (`spec-kitty:init`, `spec-kitty:doctor`) with no impact on existing CI/release steps.
- Updated [`.gitignore`](.gitignore) to exclude Spec Kitty/agent runtime state while keeping source artifacts commit-friendly.

## 0.8.0 - 2026-04-11

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
