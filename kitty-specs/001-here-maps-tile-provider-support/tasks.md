# Work Packages: HERE Maps Tile Provider Support

**Feature**: 001-here-maps-tile-provider-support
**Inputs**: Design documents from `/kitty-specs/001-here-maps-tile-provider-support/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/web-component-api.md ✓, quickstart.md ✓

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). Each work package is independently deliverable and testable.

**Prompt Files**: Each work package references a matching prompt file in `tasks/` directory.

---

## Work Package WP01: Foundation – TileProviderFactory (Priority: P0)

**Goal**: Create the core tile provider abstraction layer that all provider implementations will use.
**Independent Test**: TileProviderFactory can build valid tile URL templates for both OSM and HERE providers, with proper validation.
**Prompt**: `tasks/WP01-foundation-tileprovider-factory.md`
**Estimated Size**: ~320 lines

### Included Subtasks

- [x] T001 Create `src/lib/TileProviderFactory.ts` with type interfaces
- [x] T002 Implement `buildTileURL()` function for OSM provider
- [x] T003 Implement `buildTileURL()` function for HERE provider with styles
- [x] T004 Implement `validateProviderConfig()` function
- [x] T005 Add provider configuration constants (OSM/HERE URLs, attributions, defaults)

### Implementation Notes

- Start with type definitions (TileProviderConfig, TileURLTemplate)
- OSM is simpler (no API key, no styles) - implement first
- HERE requires API key validation and style defaulting to `lite.day`
- Export all functions and types from the module

### Parallel Opportunities

- T002 (OSM) and T003 (HERE) can be implemented independently once type interfaces are defined

### Dependencies

- None (foundational package)

### Risks & Mitigations

- Risk: HERE API key exposure → Document in comments that this is dev harness only
- Risk: Invalid style names → HERE validator should check against known styles

---

## Work Package WP02: Type System Updates (Priority: P0)

**Goal**: Extend the public type definitions to support tile provider configuration.
**Independent Test**: TypeScript compilation succeeds with new types, existing code unaffected.
**Prompt**: `tasks/WP02-type-system-updates.md`
**Estimated Size**: ~250 lines

### Included Subtasks

- [ ] T006 Add `TileProviderConfig` interface to `src/types/public.ts`
- [ ] T007 Add `TileURLTemplate` interface to `src/types/public.ts`
- [ ] T008 Add `TileProviderErrorDetail` interface to `src/types/public.ts`
- [ ] T009 Add `TileProviderChangedDetail` interface to `src/types/public.ts`
- [ ] T010 Extend `LeafletDrawMapElementAPI` with new tile provider properties
- [ ] T011 [P] Verify backward compatibility (no breaking changes to existing types)

### Implementation Notes

- All interfaces are exported from `src/types/public.ts`
- Extend existing `LeafletDrawMapElementAPI` interface (don't replace)
- New properties: `tileProvider?`, `tileStyle?`, `apiKey?`
- Event detail types match the contract specification

### Parallel Opportunities

- T011 (backward compatibility check) can run in parallel with T006-T010 once changes are made

### Dependencies

- Depends on WP01 (references TileProviderFactory types)

### Risks & Mitigations

- Risk: Breaking changes to public API → Only extend, never modify existing interfaces
- Mitigation: Run `npm run type-check` to validate no regressions

---

## Work Package WP03: Web Component Core Integration (Priority: P1) 🎯 MVP Start

**Goal**: Add tile provider attributes and internal state management to LeafletDrawMapElement.
**Independent Test**: Web component accepts new attributes, reflects them as properties, and maintains backward compatibility with `tile-url`.
**Prompt**: `tasks/WP03-web-component-core-integration.md`
**Estimated Size**: ~480 lines

### Included Subtasks

- [ ] T012 Add private properties (`_tileProvider`, `_tileStyle`, `_apiKey`) to `LeafletDrawMapElement.ts`
- [ ] T013 Update `observedAttributes` static getter with new attributes
- [ ] T014 Update `attributeChangedCallback` to handle `tile-provider`, `tile-style`, `api-key`
- [ ] T015 Add getter/setter properties for `tileProvider`, `tileStyle`, `apiKey`
- [ ] T016 Implement `_updateTileLayer()` private method with provider factory integration
- [ ] T017 Implement `_handleTileProviderError()` private method with fallback logic
- [ ] T018 Implement `_emitTileProviderChanged()` private method for success events

### Implementation Notes

- Follow existing attribute handling patterns in the web component
- Use `this._reflect()` helper to sync properties back to attributes
- `_updateTileLayer()` should check if `_tileProvider` is set; if not, fallback to `_tileUrl` (backward compat)
- Error handling: emit custom event, log to console, fallback to OSM

### Parallel Opportunities

- None - these changes are sequential and interdependent within the same file

### Dependencies

- Depends on WP01 (TileProviderFactory) and WP02 (types)

### Risks & Mitigations

- Risk: Breaking existing `tile-url` behavior → Test fallback logic thoroughly
- Risk: Attribute changes triggering infinite loops → Ensure `_updateTileLayer()` guards against redundant updates

---

## Work Package WP04: MapController Tile Layer Management (Priority: P1) 🎯 MVP

**Goal**: Enable dynamic tile layer switching in MapController.
**Independent Test**: MapController can replace tile layers at runtime, clean up old layers, and handle tile errors.
**Prompt**: `tasks/WP04-mapcontroller-tile-layer-management.md`
**Estimated Size**: ~350 lines

### Included Subtasks

- [ ] T019 Add import for `TileURLTemplate` type in `src/lib/MapController.ts`
- [ ] T020 Implement `setTileLayer(config: TileURLTemplate)` public method
- [ ] T021 Add tile layer cleanup logic (remove existing layer before adding new)
- [ ] T022 Add Leaflet tile error event listener (`tileerror`)
- [ ] T023 Integrate `setTileLayer` with existing map initialization flow
- [ ] T024 Add logging for tile layer changes and errors

### Implementation Notes

- `setTileLayer()` should:
  1. Remove existing `_tileLayer` if it exists
  2. Create new `L.tileLayer()` with config
  3. Add to map with `.addTo(this._map)`
  4. Set up `tileerror` event listener
- Tile errors should bubble up to LeafletDrawMapElement for handling
- Preserve map view (zoom, center) across tile layer changes

### Parallel Opportunities

- None - sequential changes within MapController

### Dependencies

- Depends on WP02 (TileURLTemplate type)
- Logical dependency on WP03 (called from web component)

### Risks & Mitigations

- Risk: Memory leaks from old tile layers → Ensure proper cleanup with `removeLayer()`
- Risk: Tile load failures not detected → Test `tileerror` event propagation

---

## Work Package WP05: Dev Harness UI – Provider Controls (Priority: P1) 🎯 MVP

**Goal**: Add tile provider selection UI to the main dev harness (index.html).
**Independent Test**: User can select HERE provider, enter API key, choose style, and see tiles update in the map.
**Prompt**: `tasks/WP05-dev-harness-ui-provider-controls.md`
**Estimated Size**: ~420 lines

### Included Subtasks

- [ ] T025 Add provider dropdown HTML to `index.html` (OSM, HERE options)
- [ ] T026 Add style dropdown HTML (lite.day, normal.day, satellite.day) - hidden by default
- [ ] T027 Add API key input field HTML - hidden by default
- [ ] T028 Implement `toggleHEREControls()` JavaScript function for show/hide logic
- [ ] T029 Implement `applyTileProvider()` function to update web component attributes
- [ ] T030 Add localStorage persistence logic (save/restore provider, style, API key)
- [ ] T031 Wire up event listeners (provider change, style change, API key blur)

### Implementation Notes

- Insert UI controls in existing header section after geocoder controls
- Use inline `<script>` tag (matches existing dev harness pattern)
- localStorage keys: `leaflet-geokit:tile-provider`, `leaflet-geokit:tile-style`, `leaflet-geokit:here-api-key`
- On page load: restore from localStorage, apply to map, show/hide controls based on provider

### Parallel Opportunities

- None - all changes in single index.html file

### Dependencies

- Depends on WP03 and WP04 (web component must support attributes)

### Risks & Mitigations

- Risk: localStorage not available → Add try/catch around localStorage access
- Risk: Existing inline scripts → Insert carefully, test for conflicts

---

## Work Package WP06: Error Handling & Toast Notifications (Priority: P2)

**Goal**: Implement graceful error handling with user-visible feedback in dev harness.
**Independent Test**: Missing/invalid API key triggers error toast, falls back to OSM, disables HERE option.
**Prompt**: `tasks/WP06-error-handling-toast-notifications.md`
**Estimated Size**: ~380 lines

### Included Subtasks

- [ ] T032 Add event listener for `tile-provider-error` in `index.html`
- [ ] T033 Add event listener for `tile-provider-changed` in `index.html`
- [ ] T034 Implement `showToast()` function (or integrate with existing toast system)
- [ ] T035 Add error handling: disable HERE option on invalid API key
- [ ] T036 Add success feedback: show toast on successful provider switch
- [ ] T037 [P] Add error recovery: re-enable HERE when valid API key added

### Implementation Notes

- Check if dev harness already has toast implementation (reuse if available)
- Error codes: `missing_api_key`, `invalid_api_key`, `tile_load_failed`
- Disable HERE option: `providerSelect.querySelector('option[value="here"]').disabled = true`
- Re-enable on API key change + page refresh (check localStorage)

### Parallel Opportunities

- T037 (error recovery) can be tested independently

### Dependencies

- Depends on WP05 (dev harness UI structure)

### Risks & Mitigations

- Risk: Toast conflicts with existing UI → Use existing toast if available
- Risk: HERE option permanently disabled → Test re-enable path

---

## Work Package WP07: Framework Variant Updates (Priority: P2)

**Goal**: Replicate tile provider controls to all dev harness variants (preact.html, react.html, external.html).
**Independent Test**: All dev harness variants support provider switching with identical functionality.
**Prompt**: `tasks/WP07-framework-variant-updates.md`
**Estimated Size**: ~420 lines

### Included Subtasks

- [ ] T038 [P] Update `preact.html` with tile provider controls (copy from index.html)
- [ ] T039 [P] Update `react.html` with tile provider controls (copy from index.html)
- [ ] T040 [P] Update `external.html` with tile provider controls (copy from index.html)
- [ ] T041 [P] Test preact.html variant for functionality parity
- [ ] T042 [P] Test react.html variant for functionality parity
- [ ] T043 [P] Test external.html variant for functionality parity

### Implementation Notes

- Copy UI controls and JavaScript logic from index.html
- Adapt to inline React/Preact if needed (most dev harness code is vanilla JS)
- Ensure localStorage keys remain consistent across all variants
- Test each variant independently

### Parallel Opportunities

- ALL subtasks (T038-T043) can run in parallel - independent files

### Dependencies

- Depends on WP05 and WP06 (index.html implementation complete)

### Risks & Mitigations

- Risk: Framework-specific conflicts → Test each variant in isolation
- Risk: Copy/paste errors → Use diff to compare with index.html

---

## Work Package WP08: Documentation & README Updates (Priority: P3)

**Goal**: Document the new tile provider attributes and usage patterns in README.md.
**Independent Test**: README contains complete, accurate examples for OSM, HERE, and custom tile URLs.
**Prompt**: `tasks/WP08-documentation-readme-updates.md`
**Estimated Size**: ~290 lines

### Included Subtasks

- [ ] T044 Add "Tile Providers" section to `README.md`
- [ ] T045 Document OSM usage (default behavior)
- [ ] T046 Document HERE Maps usage with API key examples
- [ ] T047 Document available HERE styles (lite.day, normal.day, satellite.day)
- [ ] T048 Document backward compatibility with `tile-url` attribute
- [ ] T049 Add security warning about API key exposure (dev vs. production)

### Implementation Notes

- Place "Tile Providers" section after installation, before advanced usage
- Include complete code examples (HTML, JavaScript)
- Link to HERE developer portal for API key signup
- Emphasize server-side proxy recommendation for production

### Parallel Opportunities

- All documentation tasks can proceed in parallel with code implementation

### Dependencies

- Logically depends on WP03-WP07 (documents implemented features)
- Can start in parallel once contracts are finalized

### Risks & Mitigations

- Risk: Outdated examples → Validate against actual implementation
- Risk: Security guidance unclear → Emphasize production best practices

---

## Dependency & Execution Summary

### Execution Sequence

```
WP01 (TileProviderFactory) → WP02 (Types)
                                 ↓
                       WP03 (Web Component Core)
                                 ↓
                       WP04 (MapController)
                                 ↓
                       WP05 (Dev Harness - index.html)
                                 ↓
                       WP06 (Error Handling)
                                 ↓
     ┌─────────────────────────┴──────────────────────────┐
     ↓                         ↓                           ↓
WP07 (Framework Variants)  WP08 (Documentation)     (Optional Testing WP)
```

### Parallelization Opportunities

- **After WP02**: WP03 and WP08 (documentation) can start in parallel
- **After WP06**: WP07 (all variants) can run fully in parallel (3 engineers)
- **Throughout**: Documentation (WP08) can progress alongside implementation

### MVP Scope (P1 Priority)

**Minimum Release**: WP01 → WP02 → WP03 → WP04 → WP05

- Delivers: Basic HERE provider selection in main dev harness (index.html)
- Validates: Core tile switching functionality, API key handling
- Users can: Select HERE, enter API key, see tiles load

**Full Release**: Add WP06 → WP07 → WP08

- Adds: Error handling, all framework variants, complete documentation

---

## Subtask Index (Reference)

| Subtask ID | Summary                                         | Work Package | Priority | Parallel?        |
| ---------- | ----------------------------------------------- | ------------ | -------- | ---------------- |
| T001       | Create TileProviderFactory.ts with types        | WP01         | P0       | No               |
| T002       | Implement buildTileURL for OSM                  | WP01         | P0       | Yes (after T001) |
| T003       | Implement buildTileURL for HERE                 | WP01         | P0       | Yes (after T001) |
| T004       | Implement validateProviderConfig                | WP01         | P0       | Yes (after T001) |
| T005       | Add provider constants                          | WP01         | P0       | Yes (after T001) |
| T006       | Add TileProviderConfig to public.ts             | WP02         | P0       | No               |
| T007       | Add TileURLTemplate to public.ts                | WP02         | P0       | No               |
| T008       | Add TileProviderErrorDetail to public.ts        | WP02         | P0       | No               |
| T009       | Add TileProviderChangedDetail to public.ts      | WP02         | P0       | No               |
| T010       | Extend LeafletDrawMapElementAPI                 | WP02         | P0       | No               |
| T011       | Verify backward compatibility                   | WP02         | P0       | Yes              |
| T012       | Add private properties to LeafletDrawMapElement | WP03         | P1       | No               |
| T013       | Update observedAttributes                       | WP03         | P1       | No               |
| T014       | Update attributeChangedCallback                 | WP03         | P1       | No               |
| T015       | Add getter/setter properties                    | WP03         | P1       | No               |
| T016       | Implement \_updateTileLayer()                   | WP03         | P1       | No               |
| T017       | Implement \_handleTileProviderError()           | WP03         | P1       | No               |
| T018       | Implement \_emitTileProviderChanged()           | WP03         | P1       | No               |
| T019       | Import TileURLTemplate in MapController         | WP04         | P1       | No               |
| T020       | Implement setTileLayer() method                 | WP04         | P1       | No               |
| T021       | Add tile layer cleanup logic                    | WP04         | P1       | No               |
| T022       | Add tileerror event listener                    | WP04         | P1       | No               |
| T023       | Integrate setTileLayer with init                | WP04         | P1       | No               |
| T024       | Add logging for tile changes                    | WP04         | P1       | Yes              |
| T025       | Add provider dropdown to index.html             | WP05         | P1       | No               |
| T026       | Add style dropdown to index.html                | WP05         | P1       | No               |
| T027       | Add API key input to index.html                 | WP05         | P1       | No               |
| T028       | Implement toggleHEREControls()                  | WP05         | P1       | No               |
| T029       | Implement applyTileProvider()                   | WP05         | P1       | No               |
| T030       | Add localStorage logic                          | WP05         | P1       | No               |
| T031       | Wire up event listeners                         | WP05         | P1       | No               |
| T032       | Add tile-provider-error listener                | WP06         | P2       | No               |
| T033       | Add tile-provider-changed listener              | WP06         | P2       | No               |
| T034       | Implement showToast()                           | WP06         | P2       | No               |
| T035       | Disable HERE on invalid key                     | WP06         | P2       | No               |
| T036       | Show success toast                              | WP06         | P2       | No               |
| T037       | Re-enable HERE on valid key                     | WP06         | P2       | Yes              |
| T038       | Update preact.html                              | WP07         | P2       | Yes              |
| T039       | Update react.html                               | WP07         | P2       | Yes              |
| T040       | Update external.html                            | WP07         | P2       | Yes              |
| T041       | Test preact.html                                | WP07         | P2       | Yes              |
| T042       | Test react.html                                 | WP07         | P2       | Yes              |
| T043       | Test external.html                              | WP07         | P2       | Yes              |
| T044       | Add Tile Providers section to README            | WP08         | P3       | Yes              |
| T045       | Document OSM usage                              | WP08         | P3       | Yes              |
| T046       | Document HERE usage                             | WP08         | P3       | Yes              |
| T047       | Document HERE styles                            | WP08         | P3       | Yes              |
| T048       | Document tile-url compatibility                 | WP08         | P3       | Yes              |
| T049       | Add security warning                            | WP08         | P3       | Yes              |

**Total Subtasks**: 49
**Total Work Packages**: 8
**Average Subtasks per WP**: 6.1 (within ideal 3-7 range)
**Estimated Total Lines**: ~2,910 lines across all prompts
**Average Prompt Size**: ~364 lines (within ideal 200-500 range)

---

> This task breakdown follows the sizing guidelines: Each WP contains 3-7 subtasks (except WP07 with 6 parallel tasks), resulting in prompts of 250-480 lines. The feature is decomposed into focused, independently testable work packages that can be implemented in sequence or (where noted) in parallel.
