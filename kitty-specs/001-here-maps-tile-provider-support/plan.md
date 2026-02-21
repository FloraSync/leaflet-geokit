# Implementation Plan: HERE Maps Tile Provider Support

_Path: [plan-template.md](../../.kittify/missions/software-dev/templates/plan-template.md)_

**Branch**: `001-here-maps-tile-provider-support` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/kitty-specs/001-here-maps-tile-provider-support/spec.md`

## Summary

Add HERE maps as a second tile provider option for the leaflet-geokit web component. The web component will accept new attributes (`tile-provider`, `tile-style`, `api-key`) and construct tile URLs internally based on the provider. This addresses the tile jitter issue encountered when passing pre-constructed HERE URLs directly via the existing `tile-url` attribute. The dev harness will provide UI controls (provider dropdown, style dropdown, API key management via localStorage) to configure these attributes.

**Key Decision**: Move tile URL construction into the web component rather than passing pre-built URLs, fixing the jitter/tile ordering issue observed with HERE maps.

## Technical Context

**Language/Version**: TypeScript 5.x (compiled to vanilla JavaScript)
**Primary Dependencies**: Leaflet (already included), Vite (build system)
**Storage**: localStorage (dev harness only, for API key and preferences)
**Testing**: Vitest (unit tests), Playwright (e2e tests)
**Target Platform**: Modern browsers with web component support
**Project Type**: Single project (web component library)
**Performance Goals**: Tile load within 2 seconds, smooth provider switching without jitter
**Constraints**:

- Web component must remain framework-agnostic (vanilla JS)
- Backward compatibility with existing `tile-url` attribute
- Dev harness only (no production tile provider switching initially)
- Must resolve tile jitter issue when using HERE maps

**Scale/Scope**:

- 1 web component file modification (`LeafletDrawMapElement.ts`)
- 3-5 dev harness HTML files updated (index.html + framework variants)
- 2-3 provider types supported (OSM, HERE, extensible for future)
- 3 HERE map styles (lite.day, normal.day, satellite.day)

## Constitution Check

_No constitution file exists yet. Skipping Constitution Check as per instructions._

**Status**: N/A (constitution.md not found)

## Project Structure

### Documentation (this feature)

```
kitty-specs/001-here-maps-tile-provider-support/
├── spec.md              # Feature specification ✓
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0 research findings
├── data-model.md        # Phase 1 data model (tile provider config)
├── quickstart.md        # Phase 1 implementation guide
├── contracts/           # Phase 1 contracts (web component API)
│   └── web-component-api.md
├── checklists/          # Quality checklists
│   └── requirements.md  # Spec quality checklist ✓
└── tasks.md             # Work packages (created by /spec-kitty.tasks)
```

### Source Code (repository root)

```
src/
├── components/
│   └── LeafletDrawMapElement.ts    # [MODIFY] Add tile-provider, tile-style, api-key attributes
├── lib/
│   └── TileProviderFactory.ts      # [NEW] Tile URL construction logic
├── types/
│   └── public.ts                   # [MODIFY] Add TileProvider types
└── utils/
    └── tile-providers.ts           # [NEW] Provider configuration constants

tests/
├── unit/
│   └── tile-provider.spec.ts       # [NEW] Unit tests for provider logic
└── e2e/
    └── tile-switching.spec.ts      # [NEW] E2E tests for provider switching

# Dev Harness Files (root level)
index.html                          # [MODIFY] Add provider/style controls
preact.html                         # [MODIFY] Add provider/style controls
react.html                          # [MODIFY] Add provider/style controls
external.html                       # [MODIFY] Add provider/style controls

# Documentation
README.md                           # [MODIFY] Document new attributes
```

**Structure Decision**: This is a single-project library with a web component. Source modifications are focused on:

1. **Web component** (`src/components/LeafletDrawMapElement.ts`) - add new attributes and tile URL construction
2. **New provider factory** (`src/lib/TileProviderFactory.ts`) - encapsulate provider-specific URL building
3. **Dev harness updates** (root HTML files) - add UI controls for provider selection
4. **Tests** - validate provider switching and tile loading

## Complexity Tracking

_No constitution violations to justify._

**Status**: N/A

---

## Phase 0: Research & Discovery

### Research Questions

1. **HERE Maps API Integration Patterns**
   - Question: What is the exact URL format for HERE maps v3 base tiles?
   - Why: Need to construct URLs correctly to avoid tile ordering issues
   - Finding: `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style={style}&apiKey={apiKey}`

2. **Tile Jitter Root Cause**
   - Question: Why does passing pre-constructed HERE URLs cause tile jitter/ordering issues?
   - Why: Need to understand the root cause to implement the fix correctly
   - Finding: [TO BE RESEARCHED] Hypothesis: Leaflet tile loading queue conflicts with HERE's URL parameters or rate limiting

3. **Web Component Attribute Best Practices**
   - Question: What's the best pattern for multi-value attributes in web components?
   - Why: Need to decide between `tile-provider="here"` + `tile-style="lite.day"` vs. `tile-config='{"provider":"here","style":"lite.day"}'`
   - Finding: [TO BE RESEARCHED] Separate attributes are more idiomatic and easier to use

4. **Backward Compatibility Strategy**
   - Question: How to maintain compatibility with existing `tile-url` usage?
   - Why: Existing users may rely on custom tile URLs
   - Finding: [TO BE RESEARCHED] If `tile-provider` is not set, fallback to `tile-url` (current behavior)

5. **localStorage API Key Security**
   - Question: Are there security implications of storing HERE API key in localStorage?
   - Why: Need to document security considerations for dev harness usage
   - Finding: [TO BE RESEARCHED] localStorage is acceptable for dev harness; production apps should use server-side proxy

### Research Tasks

These research findings will be documented in `research.md`:

1. **HERE Maps URL Construction**
   - Validate URL format with HERE documentation
   - Test different style parameters
   - Verify API key authentication method

2. **Tile Loading Investigation**
   - Debug tile jitter issue with pre-constructed URLs
   - Compare Leaflet tile loading behavior between OSM and HERE
   - Identify timing/race condition issues

3. **Web Component Architecture**
   - Review leaflet-geokit's current attribute handling pattern
   - Evaluate attribute vs. property API design
   - Ensure framework-agnostic compatibility

4. **Testing Strategy**
   - Identify test cases for provider switching
   - Plan e2e tests for tile loading validation
   - Consider API key mocking strategies

## Phase 1: Design & Contracts

### 1.1 Data Model

**Entities** (documented in `data-model.md`):

1. **TileProviderConfig**
   - Purpose: Configuration for tile provider selection and styling
   - Fields:
     - `provider`: "osm" | "here" | string (extensible)
     - `style`: string | undefined (HERE: "lite.day" | "normal.day" | "satellite.day")
     - `apiKey`: string | undefined (required for HERE)
     - `attribution`: string | undefined (override default attribution)
   - Validation:
     - `provider="here"` requires `apiKey` to be set
     - `style` only applies when `provider="here"`
   - State Transitions:
     - Default: `{ provider: "osm" }` (uses existing tile-url if set)
     - HERE selected: `{ provider: "here", style: "lite.day", apiKey: "..." }`
     - Provider change: Clear tile layer, construct new URL, reload tiles

2. **TileURLTemplate**
   - Purpose: Provider-specific URL template and configuration
   - Fields:
     - `urlTemplate`: string (e.g., `"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"`)
     - `attribution`: string
     - `maxZoom`: number | undefined
     - `subdomains`: string[] | undefined
   - Relationships: Generated by TileProviderFactory based on TileProviderConfig

### 1.2 Web Component API Contract

**New Attributes** (documented in `contracts/web-component-api.md`):

```typescript
// Attribute: tile-provider
// Type: string
// Default: undefined (falls back to tile-url behavior)
// Values: "osm" | "here"
// Example: <leaflet-geokit tile-provider="here" tile-style="lite.day" api-key="...">

interface LeafletDrawMapElement extends HTMLElement {
  // New properties
  tileProvider?: "osm" | "here";
  tileStyle?: string;
  apiKey?: string;

  // Existing (unchanged)
  tileUrl: string;
  tileAttribution?: string;
  latitude: number;
  longitude: number;
  zoom: number;
  // ... other existing properties
}
```

**Attribute Handling Logic**:

```
IF tile-provider is set:
  - Construct tile URL using TileProviderFactory
  - Ignore tile-url attribute (or use as fallback for unknown providers)
  - Apply provider-specific defaults (attribution, maxZoom, subdomains)

ELSE:
  - Use tile-url attribute (backward compatible behavior)
  - Apply default OSM tile URL if tile-url not set
```

**Error Handling**:

```
WHEN tile-provider="here" AND apiKey is missing:
  - Emit custom event: "tile-provider-error" with details
  - Fallback to OSM tiles
  - Log error to console

WHEN tile loading fails (network error, 403, etc.):
  - Emit custom event: "tile-load-error"
  - Maintain current tile layer (don't break existing view)
  - Log error to console
```

### 1.3 Dev Harness UI Contract

**Provider Selection UI** (index.html and variants):

```html
<!-- Provider Dropdown -->
<label for="tile-provider-select">Tile Provider:</label>
<select id="tile-provider-select">
  <option value="osm">OpenStreetMap</option>
  <option value="here">HERE Maps</option>
</select>

<!-- Style Dropdown (visible only when HERE selected) -->
<label for="tile-style-select" id="style-label" style="display:none;"
  >Style:</label
>
<select id="tile-style-select" style="display:none;">
  <option value="lite.day">Lite Day</option>
  <option value="normal.day">Normal Day</option>
  <option value="satellite.day">Satellite Day</option>
</select>

<!-- API Key Input (visible only when HERE selected) -->
<label for="api-key-input" id="api-key-label" style="display:none;"
  >HERE API Key:</label
>
<input
  type="text"
  id="api-key-input"
  placeholder="Enter HERE API key"
  style="display:none;"
/>
```

**localStorage Contract**:

```typescript
// Storage keys
const STORAGE_KEYS = {
  TILE_PROVIDER: "leaflet-geokit:tile-provider",
  TILE_STYLE: "leaflet-geokit:tile-style",
  HERE_API_KEY: "leaflet-geokit:here-api-key",
};

// On page load: restore preferences
const savedProvider = localStorage.getItem(STORAGE_KEYS.TILE_PROVIDER) || "osm";
const savedStyle = localStorage.getItem(STORAGE_KEYS.TILE_STYLE) || "lite.day";
const savedApiKey = localStorage.getItem(STORAGE_KEYS.HERE_API_KEY) || "";

// On change: persist preferences
function saveProviderPreferences(
  provider: string,
  style: string,
  apiKey: string,
) {
  localStorage.setItem(STORAGE_KEYS.TILE_PROVIDER, provider);
  localStorage.setItem(STORAGE_KEYS.TILE_STYLE, style);
  if (apiKey) {
    localStorage.setItem(STORAGE_KEYS.HERE_API_KEY, apiKey);
  }
}
```

### 1.4 Implementation Quickstart

**File Modifications** (documented in `quickstart.md`):

1. **Create `src/lib/TileProviderFactory.ts`**
   - Export `buildTileURL(config: TileProviderConfig): TileURLTemplate`
   - Implement provider-specific URL construction
   - Include provider constants (URLs, attributions, defaults)

2. **Modify `src/components/LeafletDrawMapElement.ts`**
   - Add new private properties: `_tileProvider`, `_tileStyle`, `_apiKey`
   - Add to `observedAttributes`: `"tile-provider"`, `"tile-style"`, `"api-key"`
   - Update `attributeChangedCallback` to handle new attributes
   - Add getter/setter properties for new attributes
   - Modify tile layer initialization to use TileProviderFactory when `_tileProvider` is set
   - Add error event emission on tile loading failure

3. **Update `src/types/public.ts`**
   - Add `TileProviderConfig` type
   - Add `TileURLTemplate` type
   - Extend `LeafletDrawMapElementAPI` with new properties

4. **Update dev harness HTML files**
   - Add provider/style/API key UI controls
   - Add localStorage persistence logic
   - Add toast notification for errors
   - Wire up event listeners to update web component attributes

5. **Create tests**
   - `tests/unit/tile-provider.spec.ts` - Test TileProviderFactory URL construction
   - `tests/e2e/tile-switching.spec.ts` - Test provider switching in dev harness
   - Mock API key for tests

6. **Update README.md**
   - Document new `tile-provider`, `tile-style`, `api-key` attributes
   - Provide usage examples
   - Note backward compatibility with `tile-url`

---

## ⛔ STOP: Planning Complete

This implementation plan is ready for task generation.

**Artifacts Created**:

- ✅ plan.md (this file)
- 🔄 research.md (to be created during task execution)
- 🔄 data-model.md (to be created during task execution)
- 🔄 contracts/web-component-api.md (to be created during task execution)
- 🔄 quickstart.md (to be created during task execution)

**Next Step**: Run `/spec-kitty.tasks` to generate work packages and implementation tasks.

**Key Implementation Notes**:

1. **Priority order**: P1 (basic provider switching) → P2 (style selection) → P3 (error handling)
2. **Testing strategy**: Unit tests for URL construction, e2e tests for dev harness interaction
3. **Backward compatibility**: Maintain existing `tile-url` attribute behavior when `tile-provider` is not set
4. **Security note**: Document that localStorage API key storage is for dev harness only; production apps should proxy requests
