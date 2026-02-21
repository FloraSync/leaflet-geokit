---
work_package_id: "WP03"
subtasks:
  - "T012"
  - "T013"
  - "T014"
  - "T015"
  - "T016"
  - "T017"
  - "T018"
title: "Web Component Core Integration"
phase: "Phase 1 - Core Implementation"
lane: "planned"
dependencies: ["WP01", "WP02"]
assignee: ""
agent: ""
shell_pid: ""
review_status: ""
reviewed_by: ""
history:
  - timestamp: "2026-02-20T00:00:00Z"
    lane: "planned"
    agent: "system"
    shell_pid: ""
    action: "Prompt generated via /spec-kitty.tasks"
---

# Work Package Prompt: WP03 – Web Component Core Integration

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check `review_status` field. If `has_feedback`, see Review Feedback section.
- **Must address all feedback** before completion.
- **Mark as acknowledged**: Update `review_status: acknowledged`.
- **Report progress**: Update Activity Log.

---

## Review Feedback

_[Empty initially. Populated by reviewers if changes needed.]_

---

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

Depends on WP01 (TileProviderFactory) and WP02 (type system).

---

## Objectives & Success Criteria

**Primary Objective**: Integrate tile provider support into the LeafletDrawMapElement web component with full attribute reactivity and backward compatibility.

**Success Criteria**:

- ✅ Web component accepts `tile-provider`, `tile-style`, `api-key` attributes
- ✅ Attributes sync bidirectionally with properties
- ✅ Tile layer updates dynamically when attributes change
- ✅ Backward compatibility: existing `tile-url` behavior unchanged
- ✅ Error handling: emits custom events on failure, falls back to OSM
- ✅ TypeScript compilation succeeds

---

## Context & Constraints

### Related Documents

- **Quickstart Guide**: `/kitty-specs/001-here-maps-tile-provider-support/quickstart.md` (Section 3)
- **Web Component API Contract**: `/kitty-specs/001-here-maps-tile-provider-support/contracts/web-component-api.md`
- **Data Model**: `/kitty-specs/001-here-maps-tile-provider-support/data-model.md`

### Target File

- **Primary**: `src/components/LeafletDrawMapElement.ts` (~600 lines existing)

### Existing Patterns to Follow

- Attribute handling: Use `observedAttributes` + `attributeChangedCallback`
- Property reflection: Use `this._reflect(attrName, value)` helper
- State management: Private `_fieldName` properties
- Error logging: Use `this._logger.error(...)`

### Critical Constraints

1. **Backward Compatibility**: Must not break existing `tile-url` usage
2. **No Side Effects**: Attribute changes should only update state if controller is initialized
3. **Fail-Safe**: Errors should not crash the component - fallback to OSM

---

## Subtasks & Detailed Guidance

### Subtask T012 – Add private properties

**Purpose**: Add internal state tracking for tile provider configuration.

**Steps**:

1. Open `src/components/LeafletDrawMapElement.ts`
2. Find the private properties section (around line 30, after `_tileUrl = "..."`)
3. Add three new private properties:

   ```typescript
   private _tileProvider?: string;
   private _tileStyle?: string;
   private _apiKey?: string;
   ```

4. Place them right after `_tileUrl` and `_tileAttribution` for logical grouping

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~3 lines)

**Validation**:

- [ ] Properties added in correct location (with other tile-related fields)
- [ ] All three are optional (`?` type)
- [ ] No initialization (undefined by default)

---

### Subtask T013 – Update observedAttributes

**Purpose**: Register new attributes for observation so `attributeChangedCallback` fires.

**Steps**:

1. Find `static get observedAttributes()` method (around line 178)
2. Add new attribute names to the returned array:

   ```typescript
   static get observedAttributes(): string[] {
     return [
       // ... existing attributes ...
       "tile-url",
       "tile-attribution",
       // NEW: Add these three
       "tile-provider",
       "tile-style",
       "api-key",
       // ... rest of attributes ...
     ];
   }
   ```

3. Place after `tile-url` and `tile-attribution` for logical grouping

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~3 lines)

**Validation**:

- [ ] All three new attributes added to array
- [ ] Exact attribute names: `"tile-provider"`, `"tile-style"`, `"api-key"` (kebab-case)
- [ ] Placed near other tile-related attributes

---

### Subtask T014 – Update attributeChangedCallback

**Purpose**: Handle attribute changes and update internal state.

**Steps**:

1. Find `attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null)` method (around line 232)
2. Add three new cases in the switch statement:

   ```typescript
   case "tile-provider":
     this._tileProvider = value ?? undefined;
     if (this._controller) {
       this._updateTileLayer();
     }
     break;

   case "tile-style":
     this._tileStyle = value ?? undefined;
     if (this._controller) {
       this._updateTileLayer();
     }
     break;

   case "api-key":
     this._apiKey = value ?? undefined;
     if (this._controller) {
       this._updateTileLayer();
     }
     break;
   ```

3. Place these cases after the `tile-url` case for consistency
4. **Guard with `if (this._controller)`**: Only update tile layer if map is initialized

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~20 lines)

**Validation**:

- [ ] Three new cases added to switch
- [ ] Each case updates corresponding private property
- [ ] Each case guards `_updateTileLayer()` call with `if (this._controller)`
- [ ] Uses `value ?? undefined` pattern (matches existing code)

**Edge Cases**:

- `null` attribute value (removal) should set property to `undefined`
- `_updateTileLayer()` call before controller init should be skipped

---

### Subtask T015 – Add getter/setter properties

**Purpose**: Provide JavaScript property API that syncs with HTML attributes.

**Steps**:

1. Find the existing getters/setters section (around line 341, after `set tileUrl(v: string)`)
2. Add three new property pairs:

   ```typescript
   get tileProvider(): string | undefined {
     return this._tileProvider;
   }
   set tileProvider(v: string | undefined) {
     this._tileProvider = v;
     this._reflect("tile-provider", v);
     if (this._controller) {
       this._updateTileLayer();
     }
   }

   get tileStyle(): string | undefined {
     return this._tileStyle;
   }
   set tileStyle(v: string | undefined) {
     this._tileStyle = v;
     this._reflect("tile-style", v);
     if (this._controller) {
       this._updateTileLayer();
     }
   }

   get apiKey(): string | undefined {
     return this._apiKey;
   }
   set apiKey(v: string | undefined) {
     this._apiKey = v;
     this._reflect("api-key", v);
     if (this._controller) {
       this._updateTileLayer();
     }
   }
   ```

3. Place after `tileUrl` getter/setter for logical grouping

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~35 lines)

**Validation**:

- [ ] Six methods added (3 getters, 3 setters)
- [ ] Getters return private property value
- [ ] Setters call `this._reflect(attr, value)` to sync to HTML
- [ ] Setters call `_updateTileLayer()` if controller exists

**Pattern Note**:
The `_reflect()` helper syncs property → attribute direction (JavaScript → HTML).

---

### Subtask T016 – Implement \_updateTileLayer() method

**Purpose**: Core logic to rebuild tile layer when provider/style/apiKey changes.

**Steps**:

1. Add import at top of file:

   ```typescript
   import {
     buildTileURL,
     validateProviderConfig,
     type TileProviderConfig,
   } from "@src/lib/TileProviderFactory";
   ```

2. Add new private method (after existing private methods, before getter/setters):

   ```typescript
   private _updateTileLayer(): void {
     if (!this._controller) {
       return;
     }

     try {
       // If tile-provider is set, use TileProviderFactory
       if (this._tileProvider) {
         const config: TileProviderConfig = {
           provider: this._tileProvider,
           style: this._tileStyle,
           apiKey: this._apiKey
         };

         // Validate configuration
         const validation = validateProviderConfig(config);
         if (!validation.valid) {
           this._handleTileProviderError(
             "missing_api_key",
             validation.error || "Invalid configuration",
             this._tileProvider
           );
           return;
         }

         // Build tile URL template
         const tileConfig = buildTileURL(config);

         // Update tile layer in MapController (WP04 implements this)
         this._controller.setTileLayer(tileConfig);

         // Emit success event
         this._emitTileProviderChanged(this._tileProvider, this._tileStyle);

       } else {
         // Fallback to tile-url (backward compatible)
         this._controller.setTileLayer({
           urlTemplate: this._tileUrl,
           attribution: this._tileAttribution || "",
           maxZoom: this._maxZoom,
           subdomains: ["a", "b", "c"]
         });
       }

     } catch (error) {
       this._logger.error("Failed to update tile layer:", error);
       this._handleTileProviderError(
         "tile_load_failed",
         error instanceof Error ? error.message : "Unknown error",
         this._tileProvider || "unknown"
       );
     }
   }
   ```

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~50 lines)

**Validation**:

- [ ] Method is private (accessible only within class)
- [ ] Early return if `_controller` is null
- [ ] Validates config before building URL
- [ ] Calls `setTileLayer()` on controller (WP04 dependency)
- [ ] Emits success event on successful change
- [ ] Falls back to `_tileUrl` when `_tileProvider` not set
- [ ] Catches exceptions and handles via error method

**Edge Cases**:

- Controller not initialized → early return
- Validation fails → error handler
- buildTileURL throws → catch block
- No tile-provider set → fallback to tile-url

---

### Subtask T017 – Implement \_handleTileProviderError() method

**Purpose**: Centralized error handling with fallback and event emission.

**Steps**:

1. Add method after `_updateTileLayer()`:

   ```typescript
   private _handleTileProviderError(
     code: string,
     message: string,
     provider: string
   ): void {
     // Log error
     this._logger.error(`Tile provider error (${code}): ${message}`);

     // Emit error event
     this.dispatchEvent(new CustomEvent("tile-provider-error", {
       bubbles: true,
       detail: {
         code,
         message,
         provider,
         timestamp: Date.now()
       }
     }));

     // Fallback to OSM
     this._tileProvider = "osm";
     this._tileStyle = undefined;
     this._apiKey = undefined;

     // Reload with OSM
     if (this._controller) {
       this._controller.setTileLayer({
         urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
         attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
         maxZoom: 19,
         subdomains: ["a", "b", "c"]
       });
     }
   }
   ```

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~30 lines)

**Validation**:

- [ ] Logs error to console via `_logger`
- [ ] Emits `tile-provider-error` CustomEvent with proper detail structure
- [ ] Resets internal state to OSM (`_tileProvider = "osm"`)
- [ ] Calls `setTileLayer()` with hardcoded OSM config
- [ ] Event bubbles (allows dev harness to listen)

**Event Detail Structure**:

```typescript
{
  code: string,        // e.g., "missing_api_key"
  message: string,     // e.g., "HERE Maps requires an API key"
  provider: string,    // e.g., "here"
  timestamp: number    // Date.now()
}
```

---

### Subtask T018 – Implement \_emitTileProviderChanged() method

**Purpose**: Emit success event when provider successfully changes.

**Steps**:

1. Add method after `_handleTileProviderError()`:
   ```typescript
   private _emitTileProviderChanged(provider: string, style?: string): void {
     this.dispatchEvent(new CustomEvent("tile-provider-changed", {
       bubbles: true,
       detail: {
         provider,
         style,
         previousProvider: this._tileProvider, // Current becomes previous
         timestamp: Date.now()
       }
     }));
   }
   ```

**Files**:

- Modify: `src/components/LeafletDrawMapElement.ts` (~15 lines)

**Validation**:

- [ ] Emits `tile-provider-changed` CustomEvent
- [ ] Event bubbles
- [ ] Detail includes: provider, style (optional), previousProvider, timestamp
- [ ] Called from `_updateTileLayer()` after successful tile change

**Event Detail Structure**:

```typescript
{
  provider: string,         // e.g., "here"
  style?: string,           // e.g., "satellite.day" (optional)
  previousProvider: string, // e.g., "osm"
  timestamp: number         // Date.now()
}
```

**Note**: `previousProvider` tracking is simplified - it uses current `_tileProvider` value which will be updated after this event.

---

## Testing Strategy

**Manual Testing** (dev harness testing in WP05):

1. **Attribute Reactivity**:

   ```javascript
   const map = document.querySelector("leaflet-geokit");
   map.setAttribute("tile-provider", "osm");
   // Verify OSM tiles load

   map.setAttribute("tile-provider", "here");
   map.setAttribute("api-key", "YOUR_KEY");
   // Verify HERE tiles load
   ```

2. **Property Reactivity**:

   ```javascript
   map.tileProvider = "here";
   map.tileStyle = "satellite.day";
   map.apiKey = "YOUR_KEY";
   // Verify tiles update
   ```

3. **Backward Compatibility**:

   ```javascript
   // Should still work without tile-provider
   map.tileUrl = "https://custom.com/{z}/{x}/{y}.png";
   // Verify custom tiles load
   ```

4. **Error Handling**:
   ```javascript
   map.tileProvider = "here";
   // (no API key set)
   // Verify: error event emitted, falls back to OSM
   ```

**Build Verification**:

```bash
npm run build
```

Should complete without TypeScript errors.

---

## Risks & Mitigations

| Risk                           | Impact | Mitigation                                                           |
| ------------------------------ | ------ | -------------------------------------------------------------------- |
| Breaking tile-url behavior     | High   | Test fallback path thoroughly; only use factory if tile-provider set |
| Infinite update loops          | Medium | Guard all update calls with `if (this._controller)`                  |
| Memory leaks (old tile layers) | Medium | WP04 handles cleanup; verify in integration                          |
| Error event not caught         | Low    | Events bubble; dev harness listens (WP06)                            |

---

## Review Guidance

**Key Checkpoints**:

1. ✅ Three new private properties added
2. ✅ Three new attributes in `observedAttributes`
3. ✅ Three new cases in `attributeChangedCallback`
4. ✅ Six new getter/setter methods
5. ✅ `_updateTileLayer()` validates before building URL
6. ✅ Error handler emits event and falls back to OSM
7. ✅ Success event emitted on provider change
8. ✅ Backward compatibility: `tile-url` still works

**Before Approval**:

- Run `npm run build` to verify TypeScript
- Check that imports resolve (`buildTileURL`, `validateProviderConfig`)
- Verify `_controller.setTileLayer()` is called (WP04 dependency)

---

## Activity Log

**Initial entry**:

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
