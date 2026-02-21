---
work_package_id: WP01
title: Foundation – TileProviderFactory
lane: "doing"
dependencies: []
base_branch: main
base_commit: adc17e96cb3c379188d76129f106b8d0bf1765b7
created_at: "2026-02-21T07:04:03.252289+00:00"
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
phase: Phase 0 - Foundation
assignee: ""
agent: ""
shell_pid: "16416"
review_status: ""
reviewed_by: ""
history:
  - timestamp: "2026-02-20T00:00:00Z"
    lane: planned
    agent: system
    shell_pid: ""
    action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP01 – Foundation – TileProviderFactory

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately (right below this notice).
- **You must address all feedback** before your work is complete. Feedback items are your implementation TODO list.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, update `review_status: acknowledged` in the frontmatter.
- **Report progress**: As you address each feedback item, update the Activity Log explaining what you changed.

---

## Review Feedback

> **Populated by `/spec-kitty.review`** – Reviewers add detailed feedback here when work needs changes. Implementation must address every item listed below before returning for re-review.

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Implementation Command

```bash
spec-kitty implement WP01
```

This work package has no dependencies and can be implemented directly from the main branch.

---

## Objectives & Success Criteria

**Primary Objective**: Create the TileProviderFactory module that centralizes tile URL construction for multiple providers (OSM, HERE).

**Success Criteria**:

- ✅ `buildTileURL()` function constructs correct URLs for both OSM and HERE providers
- ✅ HERE provider includes API key in URL and applies default style (`lite.day`) when not specified
- ✅ `validateProviderConfig()` correctly validates provider configurations
- ✅ TypeScript compilation succeeds with no errors
- ✅ All exports are properly typed and documented

---

## Context & Constraints

### Related Documents

- **Feature Spec**: `/kitty-specs/001-here-maps-tile-provider-support/spec.md`
- **Implementation Plan**: `/kitty-specs/001-here-maps-tile-provider-support/plan.md`
- **Data Model**: `/kitty-specs/001-here-maps-tile-provider-support/data-model.md`
- **Quickstart Guide**: `/kitty-specs/001-here-maps-tile-provider-support/quickstart.md`

### Key Architectural Decisions

1. **Internal URL Construction**: Tile URLs are built inside the web component (not passed pre-constructed) to fix tile jitter issues
2. **Provider Extensibility**: Design supports future providers beyond OSM and HERE
3. **Validation First**: Always validate configuration before building URLs
4. **HERE Style Defaulting**: If no style specified for HERE, default to `lite.day`

### Constraints

- Must support both OSM (public, no auth) and HERE (requires API key)
- HERE API key must be included in URL query parameter
- No external dependencies beyond existing TypeScript/Leaflet setup
- Follow existing code style and patterns in `src/lib/`

---

## Subtasks & Detailed Guidance

### Subtask T001 – Create TileProviderFactory.ts with type interfaces

**Purpose**: Establish the module file and define TypeScript interfaces for provider configuration.

**Steps**:

1. Create new file: `src/lib/TileProviderFactory.ts`
2. Add copyright header (match existing files in `src/lib/`)
3. Define `TileProviderConfig` interface:
   ```typescript
   export interface TileProviderConfig {
     provider: "osm" | "here" | string;
     style?: string;
     apiKey?: string;
     attribution?: string;
   }
   ```
4. Define `TileURLTemplate` interface:
   ```typescript
   export interface TileURLTemplate {
     urlTemplate: string;
     attribution: string;
     maxZoom?: number;
     subdomains?: string[];
   }
   ```
5. Add JSDoc comments explaining each interface field

**Files**:

- Create: `src/lib/TileProviderFactory.ts` (~50 lines)

**Validation**:

- [ ] File created in correct location
- [ ] Both interfaces exported
- [ ] JSDoc comments present
- [ ] TypeScript compiles without errors

---

### Subtask T002 – Implement buildTileURL() for OSM provider

**Purpose**: Implement URL construction for OpenStreetMap tiles (the simpler case with no auth).

**Steps**:

1. Add OSM configuration constant after the interfaces:

   ```typescript
   const PROVIDERS = {
     osm: {
       urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
       attribution:
         '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
       maxZoom: 19,
       subdomains: ["a", "b", "c"],
     },
   } as const;
   ```

2. Create `buildTileURL()` function skeleton:

   ```typescript
   export function buildTileURL(config: TileProviderConfig): TileURLTemplate {
     const { provider, style, apiKey, attribution } = config;

     switch (provider) {
       case "osm":
         return {
           urlTemplate: PROVIDERS.osm.urlTemplate,
           attribution: attribution || PROVIDERS.osm.attribution,
           maxZoom: PROVIDERS.osm.maxZoom,
           subdomains: PROVIDERS.osm.subdomains,
         };

       default:
         throw new Error(`Unknown tile provider: ${provider}`);
     }
   }
   ```

3. Add JSDoc comment above function explaining parameters and return value

**Files**:

- Modify: `src/lib/TileProviderFactory.ts` (add ~30 lines)

**Validation**:

- [ ] Function accepts TileProviderConfig and returns TileURLTemplate
- [ ] OSM case returns correct URL template
- [ ] Attribution can be overridden via config.attribution
- [ ] Unknown provider throws Error

**Edge Cases**:

- Custom attribution should override default OSM attribution
- Provider name is case-sensitive ("osm" not "OSM")

---

### Subtask T003 – Implement buildTileURL() for HERE provider with styles

**Purpose**: Add HERE Maps support with API key authentication and style handling.

**Steps**:

1. Extend the `PROVIDERS` constant to include HERE configuration:

   ```typescript
   const PROVIDERS = {
     osm: {
       /* ... existing OSM config ... */
     },
     here: {
       styles: {
         "lite.day": "lite.day",
         "normal.day": "normal.day",
         "satellite.day": "satellite.day",
       },
       defaultStyle: "lite.day",
       attribution: 'Map Tiles &copy; <a href="https://www.here.com">HERE</a>',
       maxZoom: 20,
     },
   } as const;
   ```

2. Add HERE case to the switch statement in `buildTileURL()`:

   ```typescript
   case "here": {
     if (!apiKey) {
       throw new Error("HERE Maps requires an API key");
     }

     const hereStyle = style && style in PROVIDERS.here.styles
       ? style
       : PROVIDERS.here.defaultStyle;

     return {
       urlTemplate: `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=${hereStyle}&apiKey=${apiKey}`,
       attribution: attribution || PROVIDERS.here.attribution,
       maxZoom: PROVIDERS.here.maxZoom,
       subdomains: undefined
     };
   }
   ```

3. Update function JSDoc to document HERE-specific behavior

**Files**:

- Modify: `src/lib/TileProviderFactory.ts` (add ~25 lines)

**Validation**:

- [ ] HERE case requires API key (throws if missing)
- [ ] Default style is `lite.day` when not specified
- [ ] Invalid style names fallback to `lite.day`
- [ ] Valid styles: `lite.day`, `normal.day`, `satellite.day`
- [ ] URL includes both style and apiKey query parameters
- [ ] No subdomains for HERE (set to undefined)

**Edge Cases**:

- Empty string API key should be treated as missing (truthy check)
- Style name validation: only accept known styles, default to `lite.day` for unknown
- URL encoding: Ensure API key and style are properly encoded (template literals handle this)

---

### Subtask T004 – Implement validateProviderConfig() function

**Purpose**: Provide upfront validation of provider configuration before URL construction.

**Steps**:

1. Create `validateProviderConfig()` function below `buildTileURL()`:

   ```typescript
   export function validateProviderConfig(config: TileProviderConfig): {
     valid: boolean;
     error?: string;
   } {
     const { provider, apiKey } = config;

     if (!provider) {
       return { valid: false, error: "Provider is required" };
     }

     if (provider === "here" && !apiKey) {
       return { valid: false, error: "HERE Maps requires an API key" };
     }

     return { valid: true };
   }
   ```

2. Add JSDoc comment explaining validation rules

**Files**:

- Modify: `src/lib/TileProviderFactory.ts` (add ~20 lines)

**Validation**:

- [ ] Returns `{valid: true}` for valid OSM config
- [ ] Returns `{valid: true}` for valid HERE config (with API key)
- [ ] Returns `{valid: false, error: "..."}` for HERE without API key
- [ ] Returns `{valid: false, error: "..."}` for empty provider

**Edge Cases**:

- Empty string provider should fail validation
- Empty string API key for HERE should fail validation
- OSM with API key is allowed (key is simply ignored)

---

### Subtask T005 – Add provider configuration constants

**Purpose**: Document provider capabilities and ensure constants are easily maintainable.

**Steps**:

1. The `PROVIDERS` constant is already created in T002 and T003 - verify it's structured as `const`
2. Add comments above the constant explaining its purpose:

   ```typescript
   /**
    * Provider configuration constants
    *
    * Defines URL templates, attributions, and provider-specific settings
    * for all supported tile providers.
    */
   const PROVIDERS = {
     // ... OSM and HERE configs
   } as const;
   ```

3. Ensure the constant is properly typed with `as const` for literal type inference

**Files**:

- Modify: `src/lib/TileProviderFactory.ts` (add ~10 lines of comments)

**Validation**:

- [ ] `PROVIDERS` is declared with `as const`
- [ ] OSM configuration includes: urlTemplate, attribution, maxZoom, subdomains
- [ ] HERE configuration includes: styles object, defaultStyle, attribution, maxZoom
- [ ] JSDoc comment explains purpose
- [ ] TypeScript infers literal types (e.g., `"osm" | "here"` not just `string`)

**Notes**:

- Using `as const` ensures TypeScript treats string values as literal types
- This enables better autocomplete and type checking
- Future providers can be added by extending the PROVIDERS object

---

## Testing Strategy

**Manual Testing** (no automated tests required at this stage):

1. **OSM URL Construction**:
   - Verify `buildTileURL({ provider: "osm" })` returns correct OSM URL
   - Check that OSM tiles load in browser when URL is used

2. **HERE URL Construction**:
   - Verify `buildTileURL({ provider: "here", apiKey: "test" })` includes API key in URL
   - Check default style is `lite.day`
   - Verify custom styles work: `buildTileURL({ provider: "here", style: "satellite.day", apiKey: "test" })`

3. **Validation**:
   - Confirm `validateProviderConfig({ provider: "here" })` returns `{valid: false}`
   - Confirm `validateProviderConfig({ provider: "osm" })` returns `{valid: true}`

**Test Commands**:

```bash
# TypeScript compilation check
npm run build

# Or if type-check script exists
npm run type-check
```

---

## Risks & Mitigations

| Risk                     | Impact | Mitigation                                                                      |
| ------------------------ | ------ | ------------------------------------------------------------------------------- |
| API key exposure in URLs | Medium | Document that this is dev harness only; production should use server-side proxy |
| HERE API changes         | Low    | Pin to v3 API; monitor HERE deprecation notices                                 |
| Invalid style names      | Low    | Validation falls back to default style instead of failing                       |
| URL encoding issues      | Low    | Template literals handle basic encoding; monitor for edge cases                 |

---

## Review Guidance

**Key Checkpoints for Reviewers**:

1. ✅ Both `buildTileURL()` and `validateProviderConfig()` are exported
2. ✅ TypeScript types are correct (no `any`, proper return types)
3. ✅ HERE requires API key (throws error if missing)
4. ✅ Default HERE style is `lite.day`
5. ✅ Code follows existing patterns in `src/lib/` directory
6. ✅ JSDoc comments are present and helpful
7. ✅ No hardcoded API keys in the code

**Testing Before Approval**:

- Run `npm run build` to verify TypeScript compilation
- Review generated types in build output

---

## Activity Log

**Initial entry**:

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
