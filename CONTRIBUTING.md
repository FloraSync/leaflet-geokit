# Contributing to @florasync/leaflet-geokit

Welcome! This doc captures how to keep the momentum going—with kindness, clarity, and a high bar for quality.

## Good Vibes Policy

- Be kind, constructive, and curious. We only accept good vibes.
- Prefer suggestions with rationale over drive-by critiques.
- Assume positive intent; ask questions before conclusions.

## Environment

- Node: 22 LTS or 24.x recommended (engines: >=20). Avoid 23.x (npm 11 quirks).
- Package manager: npm (with a local `.npmrc` already checked in).

Dev container

- A VS Code Dev Container is available at [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json) using [docker/Dockerfile.devcontainer](docker/Dockerfile.devcontainer).
- On first open, it runs [`.devcontainer/setup-from-env.sh`](.devcontainer/setup-from-env.sh) which can read `.env` to set git identity, HTTPS origin, GitHub PAT, and npm token.
- It’s intentionally light: no automated push/publish; you run `git push` and `npm publish` manually as needed. Use the publisher sidecar for release automation.

## Getting Started

- Install: `npm install`
- Dev harness: `npm run dev` then open the page Vite prints.
- Unit tests: `npm run test:unit`
- Type check: `npm run typecheck`
- Lint/format: `npm run lint` and `npm run format`

## Testing & Coverage

- Unit tests live under `tests/` and run in happy-dom.
- Target coverage: ≥ 70% (configured in `vitest.config.ts`).
- Add focused tests for:
  - utils/geojson: bbox, expansion, coordinate walking
  - FeatureStore: ID behavior, bounds, snapshots
  - Component API: delegation to controller, event hooks (`leaflet-draw:*`)
  - Regressions: drawing behavior such as the “3rd click closes polygon” fix

Tip: prefer small, deterministic tests over broad flake-prone scenarios. For browser flows, add Playwright e2e sparingly.

## Code Style & Principles

- TypeScript strict, no `any` unless isolated at boundaries.
- Keep dependencies light; avoid heavy new libraries.
- Solve root causes, not symptoms.
- Prefer small, composable utilities over large god functions.
- Favor progressive enhancement (e.g., optional features behind event hooks).

## Public API

- Treat `src/types/public.ts` and custom element events as a stable contract.
- Additive changes are fine; breaking changes require a migration note in README.
- When adding a method or event:
  - Update types, component, controller, and README.
  - Add a unit test exercising the new surface.

## Commit & PR Guidelines

- Clear, imperative commit messages (e.g., "add ingest hook to flatten Multi\*").
- PRs should include: summary, rationale, screenshots/recordings if UI-visible, and test notes.
- Keep PRs focused; avoid drive-by refactors unless they’re tiny and obviously safe.

## Performance & UX Guardrails

- Large GeoJSON: avoid O(n²) operations; consider batching and lightweight rendering.
- Accessibility: keep keyboard affordances (we added Ctrl/Cmd+S and Ctrl/Cmd+O) and ARIA roles/toasts informative.
- Shadow DOM: be mindful of event retargeting; where necessary, use robust patches like our polygon-finish helper.

## Security & Safety

- Never `eval` or execute untrusted code.
- Validate uploaded files; we already gate GeoJSON parsing and geometry validity.

## Notes for Future You (Next Epic Session)

- Consider an option to re-merge split Multi\* features on export (opt-in), while keeping editability.
- Add drag-and-drop upload and an optional “replace vs add” persisted setting.
- Add Playwright e2e for: draw 3+ points without finishing; finish on first-vertex click; vertex delete context menu.
- Consider i18n hooks for geocoder/toasts.
- Optionally expose a flag to disable polygon area tooltips.

Thanks again—your energy and care keep this fun and excellent. Chef’s kiss.
