# Release verification and consumer smoke

Run from the package root with installed dependencies (Node >=20, npm >=9).
These commands validate local source; they do not publish or authorize a release.

```sh
npm run prettier:check
npm run lint
npm run typecheck
npm run test:unit:focused -- tests/element.spec.ts tests/toolbar-contract.spec.ts tests/tool-capabilities.spec.ts tests/tool-lifecycle.spec.ts tests/geojson-pipeline.spec.ts
npm run build
npm run pack:dry
npm run test:consumer
npx playwright test --config playwright.release.config.ts --workers=1 e2e/custom-toolbar.spec.ts e2e/irrigation-draw-mode.spec.ts e2e/public-tool-acceptance.spec.ts
```

`pack:dry` invokes prepack and rebuilds. `test:consumer` expects a completed build,
packs with `--ignore-scripts` and `HUSKY=0` into an isolated temporary directory, checks all
export targets and required adoption docs in the actual tarball, rejects leaked
test declarations, then compiles imports of every package subpath with strict
TypeScript. It reuses installed dependency packages, not source aliases for
GeoKit, and removes its temporary consumer afterward. A missing declaration,
unresolved declaration dependency or absent export target fails the command.
This is a type-resolution smoke, not a claim that browser-only entries run in Node.
The gate compiles in strict NodeNext mode with `skipLibCheck: false`, including
transitive relative declaration imports. Some npm versions still invoke prepare
while packing with `--ignore-scripts`; `HUSKY=0` prevents hook installation.
After alias rewriting, the build normalizes relative declaration specifiers to
explicit `.js` paths using the TypeScript AST. This avoids depending on whether
the installed tsc-alias version adds extensions. Missing relative declaration
targets fail the build rather than ship unresolved imports.

For a release candidate, retain the full `npm run release:dry` (typecheck, coverage
unit suite, build, pack dry-run) and complete Playwright release suite. Focused
checks do not replace those gates. `.github/workflows/release-candidate.yml`
validates an exact source SHA and creates an immutable tarball;
`.github/workflows/npm-publish.yml` verifies approved bytes before publication.
The packed-consumer smoke is also part of `release:dry`.

## Browser evidence

- `/custom-toolbar.html`: minimal branded toolbar, guidance popover, external
  layer-cake activation/cancel, Save export and event-based activation. Its test
  captures light/dark mobile/tablet/desktop screenshots.
- `/irrigation-draw-mode.html`: retain actual external-panel and secondary-toolbar
  geometry creation/export assertions, not just idle button rendering.
- `e2e/public-tool-acceptance.spec.ts`: public tool interactions.
- Existing provider, GeoJSON, layer-manager, accessibility, responsive toolbar and
  touch suites remain release gates; see their `e2e/*.spec.ts` sources.

Install Chromium with `npx playwright install chromium` if absent. The committed
release config uses port 5173 and may reuse a dev server outside CI. In a shared
workspace, use an owned Playwright config with a distinct strict port, no server
reuse, HMR disabled and a run-owned artifact/cache directory. Do not stop another
agent's server or rewrite shared screenshot baselines to get green results.
Use polling when host inotify watches are exhausted.

## Publication and real consumer checks

1. Obtain explicit release authorization for the exact reviewed source and archive.
2. Run all release gates on that candidate; capture commands, statuses and SHA.
3. Verify package export targets and strict packed-consumer compilation.
4. Publish only approved bytes through the release workflow; never publish merely
   because `pack:dry` passed.
5. Download the registry tarball and compare SHA-256 and registry integrity with
   the approved archive. Verify source/tag provenance separately.
6. Load the version-pinned Django module in a real browser; require element
   registration and no page errors. A 200 response alone does not prove importability.
7. Verify the consuming app resolves the registry version, not a sibling source
   alias; exercise its actual React/Preact and Django surfaces, including screenshots.

Release 0.9.0 consumer evidence is tracked on FLOA-526 and FLOA-452. New local docs
or harness edits are not retroactively present in that published archive. Keep
local verification, published artifact verification and deployed app verification
separate in handoffs.
