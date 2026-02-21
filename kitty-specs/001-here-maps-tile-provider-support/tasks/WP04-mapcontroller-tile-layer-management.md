---
work_package_id: WP04
title: MapController Tile Layer Management
lane: "doing"
dependencies: [WP02]
base_branch: 001-here-maps-tile-provider-support-WP02
base_commit: e77873405ea6f489aeb3d05e3630c7cf1aec7551
created_at: "2026-02-21T08:00:40.165407+00:00"
subtasks:
  - T019
  - T020
  - T021
  - T022
  - T023
  - T024
phase: Phase 1 - Core Implementation
assignee: ""
agent: "guille"
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

# Work Package Prompt: WP04 – MapController Tile Layer Management

## Implementation Command

```bash
spec-kitty implement WP04 --base WP02
```

## Objectives & Success Criteria

**Primary Objective**: Enable dynamic tile layer replacement in MapController without memory leaks or visual glitches.

**Success Criteria**:

- ✅ `setTileLayer()` method implemented and working
- ✅ Old tile layers properly removed before new ones added
- ✅ Tile load errors detected and logged
- ✅ Map view (zoom, center) preserved across layer changes
- ✅ No memory leaks from orphaned tile layers

---

## Context

**Target File**: `src/lib/MapController.ts`
**Related**: WP03 calls `setTileLayer()` from web component

---

## Subtasks & Detailed Guidance

### T019 – Add import for TileURLTemplate type

```typescript
import type { TileURLTemplate } from "@src/lib/TileProviderFactory";
```

Add at top with other imports.

---

### T020 – Implement setTileLayer() method

```typescript
setTileLayer(config: TileURLTemplate): void {
  // Remove existing tile layer
  if (this._tileLayer) {
    this._map.removeLayer(this._tileLayer);
  }

  // Create new tile layer
  this._tileLayer = L.tileLayer(config.urlTemplate, {
    attribution: config.attribution,
    maxZoom: config.maxZoom,
    subdomains: config.subdomains
  });

  // Add to map
  this._tileLayer.addTo(this._map);

  // Listen for tile errors (T022)
  this._tileLayer.on('tileerror', (error: any) => {
    console.error('Tile load error:', error);
  });
}
```

**Validation**:

- [ ] Removes old layer before adding new
- [ ] Creates L.tileLayer with config
- [ ] Adds to map with `.addTo()`
- [ ] Sets up tile error listener

---

### T021 – Add tile layer cleanup logic

**Already handled in T020** (line 2-4: `if (this._tileLayer) { this._map.removeLayer(this._tileLayer); }`)

**Verify**:

- [ ] `removeLayer()` is called before creating new layer
- [ ] No orphaned layers left in Leaflet's internal state

---

### T022 – Add tileerror event listener

**Already included in T020** (last 3 lines).

**Enhance if needed**:

```typescript
this._tileLayer.on("tileerror", (error: any) => {
  console.error("Tile load error:", error);
  // Could emit custom event here for web component to handle
  // For now, logging is sufficient
});
```

---

### T023 – Integrate setTileLayer with existing init

**Check**: Does MapController have tile layer initialization in constructor or init method?

If yes, refactor to use `setTileLayer()`:

```typescript
// In constructor or init():
const defaultConfig: TileURLTemplate = {
  urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  subdomains: ["a", "b", "c"],
};
this.setTileLayer(defaultConfig);
```

**Validation**:

- [ ] Initial tile layer setup uses `setTileLayer()`
- [ ] No code duplication (DRY principle)

---

### T024 – Add logging for tile changes

**Add to `setTileLayer()` start**:

```typescript
setTileLayer(config: TileURLTemplate): void {
  console.log('Switching tile layer:', config.urlTemplate);

  // ... rest of method
}
```

Or use existing logger if available:

```typescript
this._logger?.info("Tile layer changed:", config.urlTemplate);
```

**Validation**:

- [ ] Log entry when tile layer changes
- [ ] Uses existing logger pattern if available

**Parallel**: Can be done independently

---

## Testing Strategy

**Manual Testing** (via web component in WP03/WP05):

1. Switch providers → verify tiles update
2. Check browser console for "Switching tile layer" log
3. Use browser DevTools Memory profiler → verify old tile layers are garbage collected

---

## Review Guidance

**Checkpoints**:

1. ✅ `setTileLayer()` method is public
2. ✅ Old tile layer removed before adding new
3. ✅ Leaflet's `L.tileLayer()` called correctly
4. ✅ Tile errors logged
5. ✅ No memory leaks (verified via testing)

---

## Activity Log

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
- 2026-02-21T08:01:02Z – guille – shell_pid=16416 – lane=doing – Assigned agent via workflow command
