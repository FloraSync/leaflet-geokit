**Scope**

- Repository: `@florasync/leaflet-geokit` (repo root)
- Component: `<leaflet-geokit>` custom element, Leaflet + Leaflet.draw bridge, Feature store, build config

**Summary**

- This is where we log pesky bugs, known limitations, and other issues. Ideally we would have most things linked to issues or PRs, but for now this is a living document.

**Functional Mismatches**

- **loadGeoJSON fit behavior:** `README.md` states load fits bounds by default; `LeafletDrawMapElement.loadGeoJSON(fc)` passes `false` to controller (no auto‑fit). Impact: confusing DX; dev harness button won’t recenter after load. Suggest: default to auto‑fit or add a `fit-to-data-on-load` attribute..
- **Event coverage (verbose events):** `events.ts` exports draw/edit start/stop constants, but controller does not dispatch them. Impact: consumers relying on advertised events won’t receive them. Suggest: wire Leaflet.draw lifecycle events.

**Data & ID Mapping**

- **Store mutates input features:** `ensureId()` writes `feature.id` and `feature.properties.id` directly to the caller’s objects. Impact: surprising side‑effects for consumers. Suggest: deep/shallow copy before mutation or document clearly.

**Attribute Handling & Reflection**

- **`tile-url` removal keeps stale value:** On attribute remove, code keeps previous `_tileUrl` (`value ?? this._tileUrl`). Impact: attribute→property asymmetry. Suggest: revert to default OSM URL when attribute is removed.
- **`fit-to-data-on-load` not supported:** Architecture/docs mention it, but it’s neither observed nor used. Impact: cannot configure default fit behavior declaratively. Suggest: add observed attribute and thread through config.
- **`setView` double work:** Property setters reflect to attributes which trigger `attributeChangedCallback` calling `controller.setView` again; method then calls `controller.setView` directly. Impact: redundant calls. Suggest: skip controller call in attributeChanged path when the change originated from `setView` or debounce.

**Lifecycle, Re‑init, and State Loss**

- **Re‑init race potential:** Rapid successive attribute changes chain `destroy().then(() => init())` calls without cancellation. Impact: flicker/inconsistent final state. Suggest: queue or coalesce changes, or guard with a reentrancy token.

**Events & Error Handling**

- **Errors during init suppressed to event only:** Controller catches init errors and emits `leaflet-draw:error`, but consumers who await readiness have no promise. Impact: harder to coordinate app flow. Suggest: expose an `onReady` promise or resolve an internal ready state.
- **`loadGeoJSONFromText` error detail:** On JSON parse error, event emits a generic message; original text is discarded. Impact: limited debugging. Suggest: include a snippet/length or validation details (safely).

**Tests & Tooling**

- **Unit tests won’t catch every browser runtime issue:** Tests run in `happy-dom`, so Leaflet/browser integration still needs Playwright coverage for draw/edit/delete behavior. Current focused gates cover marker icons, draw runtime, edit vertex delete, performance, and irrigation draw mode; keep them release-blocking instead of relying on unit tests alone.
- **Local Playwright artifact ownership can block the normal runner:** Root-owned `test-results/.last-run.json` or Vite cache files can fail before tests execute. Use the tracked `.wip` audit config workaround or fix artifact ownership before interpreting a Playwright startup failure as product failure.

**Types & Declarations**

- **`src/types/uuid.d.ts` can conflict with real types:** `uuid@9` ships its own typings; the ambient module declaration may cause duplication depending on resolution. Impact: potential TS ambiguity in some setups. Suggest: remove shim or guard it behind a path import.
- **Architecture references non‑existent types/modules:** Docs reference `src/types/logger.ts`, `src/utils/attribute.ts`, `src/state/store.ts`, `src/ui/...` that are not present. Impact: confusion for contributors. Suggest: align docs with code or add stubs.

**SSR/Runtime Assumptions**

- **Browser‑only side effects in constructor/connectedCallback:** Shadow DOM creation and style injection assume DOM APIs; importing in SSR will fail if not gated by the host app. Impact: SSR hydration/import crashes. Suggest: document client‑only import guard; optionally no‑op if `window`/`document` absent.
- **Leaflet icon assets require DOM/bundler:** `configureLeafletDefaultIcons` relies on runtime asset URLs; ensure bundler settings cover SSR/client splits. Impact: missing markers if not called in client.

**Build & Packaging**

- **UMD global and ESM export fine, but no default export:** Consumers expecting a side‑effect registration import may be confused. Impact: mild DX friction. Suggest: document usage clearly (importing the bundle registers the element).
- **`sideEffects` includes only CSS:** Runtime style injection occurs from TS; tree‑shaking shouldn’t drop it, but verify for aggressive bundlers. Impact: potential broken styling. Suggest: keep as is; add note in docs.

**Minor UX/Perf**

- **Read‑only still adds an empty control:** Controller adds a Draw control with both `draw:false` and `edit:false`. Impact: minor UI clutter. Suggest: skip adding the control in read‑only mode.
- **Repeated `invalidateSize` timeout:** Double call is fine; consider debouncing on container resize observer in future. Impact: negligible.

**Recommendations (Prioritized)**

- Fix default fit behavior for `loadGeoJSON` and/or implement `fit-to-data-on-load` attribute.
- Wire exported draw/edit lifecycle events or remove them from the advertised public event surface.
- Expose an explicit readiness promise/state and improve safe parse-error detail for host diagnostics.
- Coalesce rapid attribute-change re-init calls to avoid lifecycle race flicker.
- Clean up type shims and stale documentation references to avoid confusion.
