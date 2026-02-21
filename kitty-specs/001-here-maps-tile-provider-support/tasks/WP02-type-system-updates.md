---
work_package_id: WP02
title: Type System Updates
lane: "done"
dependencies: [WP01]
base_branch: 001-here-maps-tile-provider-support-WP01
base_commit: f6879baa2e2689ce39448ef20b6ea43ba54bec57
created_at: "2026-02-21T07:28:54.181214+00:00"
subtasks:
  - T006
  - T007
  - T008
  - T009
  - T010
  - T011
phase: Phase 0 - Foundation
assignee: ""
agent: "GeminiCLI"
shell_pid: "88931"
review_status: "approved"
reviewed_by: "Schuyler Ankele"
history:
  - timestamp: "2026-02-20T00:00:00Z"
    lane: planned
    agent: system
    shell_pid: ""
    action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP02 – Type System Updates

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.
- **Mark as acknowledged**: Update `review_status: acknowledged` in the frontmatter.
- **Report progress**: Update the Activity Log as you address feedback.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

This work package depends on WP01 (TileProviderFactory), so implement from the WP01 branch.

---

## Objectives & Success Criteria

**Primary Objective**: Extend the public TypeScript type system to support tile provider configuration without breaking existing code.

**Success Criteria**:

- ✅ All new types exported from `src/types/public.ts`
- ✅ `LeafletDrawMapElementAPI` extended with `tileProvider`, `tileStyle`, `apiKey` properties
- ✅ Event detail interfaces defined for `tile-provider-error` and `tile-provider-changed` events
- ✅ TypeScript compilation succeeds (no errors)
- ✅ Backward compatibility verified (existing code unaffected)

---

## Context & Constraints

### Related Documents

- **Web Component API Contract**: `/kitty-specs/001-here-maps-tile-provider-support/contracts/web-component-api.md`
- **Data Model**: `/kitty-specs/001-here-maps-tile-provider-support/data-model.md`
- **TileProviderFactory** (WP01): Defines `TileProviderConfig` and `TileURLTemplate` locally

### Key Decisions

1. **Export from public.ts**: All types must be in the public API (`src/types/public.ts`)
2. **Extend, Don't Replace**: Add new properties to existing interfaces, don't modify them
3. **Optional Properties**: All new properties are optional (`?`) to maintain backward compatibility
4. **Event Detail Types**: Separate interfaces for each custom event

---

## Subtasks & Detailed Guidance

### Subtask T006 – Add TileProviderConfig interface

**Purpose**: Define the public interface for tile provider configuration.

**Steps**:

1. Open `src/types/public.ts`
2. Find a suitable location (after existing map-related types, before component API)
3. Add the interface:

   ```typescript
   /**
    * Configuration for tile provider selection and styling
    */
   export interface TileProviderConfig {
     /** Tile provider identifier (e.g., "osm", "here") */
     provider: "osm" | "here" | string;

     /** Provider-specific style (e.g., "lite.day" for HERE) */
     style?: string;

     /** API key for authenticated providers */
     apiKey?: string;

     /** Optional override for tile attribution text */
     attribution?: string;
   }
   ```

**Files**:

- Modify: `src/types/public.ts` (~15 lines)

**Validation**:

- [ ] Interface is exported
- [ ] JSDoc comments present for each field
- [ ] `provider` field uses union type (`"osm" | "here" | string`)
- [ ] Optional fields marked with `?`

---

### Subtask T007 – Add TileURLTemplate interface

**Purpose**: Define the output type for tile layer configuration.

**Steps**:

1. Add the interface below `TileProviderConfig`:

   ```typescript
   /**
    * Tile layer configuration with URL template and provider settings
    */
   export interface TileURLTemplate {
     /** Leaflet tile URL template (e.g., "https://{s}.domain.com/{z}/{x}/{y}.png") */
     urlTemplate: string;

     /** Attribution text displayed on the map */
     attribution: string;

     /** Maximum zoom level supported */
     maxZoom?: number;

     /** Tile subdomains for load balancing */
     subdomains?: string[];
   }
   ```

**Files**:

- Modify: `src/types/public.ts` (~15 lines)

**Validation**:

- [ ] Interface exported
- [ ] JSDoc comments describe each field
- [ ] Matches TileProviderFactory output structure

---

### Subtask T008 – Add TileProviderErrorDetail interface

**Purpose**: Define the structure for `tile-provider-error` event details.

**Steps**:

1. Add the interface:

   ```typescript
   /**
    * Event detail for tile provider errors
    */
   export interface TileProviderErrorDetail {
     /** Error code identifying the failure type */
     code:
       | "missing_api_key"
       | "invalid_api_key"
       | "tile_load_failed"
       | "unknown_provider";

     /** Human-readable error message */
     message: string;

     /** Provider identifier where the error occurred */
     provider: string;

     /** Unix timestamp when error occurred */
     timestamp: number;
   }
   ```

**Files**:

- Modify: `src/types/public.ts` (~15 lines)

**Validation**:

- [ ] Exported interface
- [ ] `code` field uses union of literal types
- [ ] All fields required (no optional `?`)

---

### Subtask T009 – Add TileProviderChangedDetail interface

**Purpose**: Define the structure for `tile-provider-changed` success event.

**Steps**:

1. Add the interface:

   ```typescript
   /**
    * Event detail for successful tile provider changes
    */
   export interface TileProviderChangedDetail {
     /** New active provider */
     provider: string;

     /** New active style (if applicable) */
     style?: string;

     /** Previously active provider */
     previousProvider: string;

     /** Unix timestamp when change occurred */
     timestamp: number;
   }
   ```

**Files**:

- Modify: `src/types/public.ts` (~15 lines)

**Validation**:

- [ ] Exported interface
- [ ] `style` is optional (not all providers have styles)
- [ ] JSDoc comments present

---

### Subtask T010 – Extend LeafletDrawMapElementAPI

**Purpose**: Add new tile provider properties to the web component's public API.

**Steps**:

1. Find the existing `LeafletDrawMapElementAPI` interface in `src/types/public.ts`
2. Add new properties to the interface (do NOT modify existing properties):

   ```typescript
   export interface LeafletDrawMapElementAPI extends HTMLElement {
     // ... existing properties (tileUrl, latitude, etc.) ...

     // New tile provider properties
     /** Tile provider identifier (e.g., "osm", "here") */
     tileProvider?: "osm" | "here" | string;

     /** Provider-specific style (e.g., "lite.day" for HERE) */
     tileStyle?: string;

     /** API key for authenticated providers */
     apiKey?: string;
   }
   ```

3. Ensure new properties are added at the end, after existing properties

**Files**:

- Modify: `src/types/public.ts` (~10 lines)

**Validation**:

- [ ] New properties are optional (`?`)
- [ ] Added after existing properties (not mixed in)
- [ ] Type annotations match TileProviderConfig
- [ ] No existing properties modified or removed

---

### Subtask T011 – Verify backward compatibility

**Purpose**: Ensure type changes don't break existing code.

**Steps**:

1. Run TypeScript compilation:

   ```bash
   npm run build
   # Or
   npm run type-check
   ```

2. Verify no type errors in existing code

3. Check that existing web component usage still type-checks:

   ```typescript
   // This should still work without errors
   const map = document.querySelector("leaflet-geokit");
   map.tileUrl = "https://example.com/{z}/{x}/{y}.png";
   map.latitude = 37.7749;
   map.zoom = 12;
   ```

4. Check that new properties are recognized:
   ```typescript
   // This should type-check correctly
   map.tileProvider = "here";
   map.tileStyle = "lite.day";
   map.apiKey = "test-key";
   ```

**Files**:

- No file changes - verification only

**Validation**:

- [ ] `npm run build` completes without errors
- [ ] No type errors in existing component usage
- [ ] New properties type-check correctly
- [ ] Autocomplete works for new properties in IDE

**Parallel Opportunity**:
This task can start as soon as T006-T010 are complete.

---

## Testing Strategy

**Type Checking Tests**:

1. **Build Verification**:

   ```bash
   npm run build
   ```

   Should complete without TypeScript errors.

2. **Manual Type Checks** (in IDE or via tsc):
   - Verify new types are available
   - Check autocomplete for new properties
   - Validate that event detail types work in event listeners

**No runtime tests needed** - this WP is purely type definitions.

---

## Risks & Mitigations

| Risk                                    | Impact | Mitigation                                               |
| --------------------------------------- | ------ | -------------------------------------------------------- |
| Breaking existing code                  | High   | Make all new properties optional; verify backward compat |
| Type conflicts with TileProviderFactory | Medium | Ensure interface shapes match exactly                    |
| Missing exports                         | Low    | Double-check all interfaces are exported                 |

---

## Review Guidance

**Key Checkpoints**:

1. ✅ All 4 new interfaces exported from `public.ts`
2. ✅ `LeafletDrawMapElementAPI` extended (not replaced)
3. ✅ New properties are optional (`?`)
4. ✅ JSDoc comments present and helpful
5. ✅ TypeScript compilation succeeds
6. ✅ No changes to existing interfaces (only additions)

**Before Approval**:

- Run `npm run build` to verify compilation
- Check that new types appear in build output (`dist/` or `.d.ts` files)

---

## Activity Log

**Initial entry**:

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
- 2026-02-21T07:29:15Z – guille – shell_pid=16416 – lane=doing – Assigned agent via workflow command
- 2026-02-21T07:34:53Z – guille – shell_pid=16416 – lane=for_review – Ready for review: extended public tile provider and event detail types
- 2026-02-21T07:41:38Z – GeminiCLI – shell_pid=88931 – lane=doing – Started review via workflow command
- 2026-02-21T07:43:38Z – GeminiCLI – shell_pid=88931 – lane=done – Review passed: Public types extended to support tile providers (TileProviderConfig, TileURLTemplate) and event details (TileProviderErrorDetail, TileProviderChangedDetail). LeafletDrawMapElementAPI interface extended with new properties.
