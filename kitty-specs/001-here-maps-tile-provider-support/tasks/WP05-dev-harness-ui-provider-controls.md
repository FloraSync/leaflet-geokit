---
work_package_id: WP05
title: Dev Harness UI – Provider Controls
lane: "doing"
dependencies: [WP03, WP04]
base_branch: 001-here-maps-tile-provider-support-WP05-merge-base
base_commit: 7c3496e6e1b86fa19ace5403c39180194029b6c1
created_at: "2026-02-21T08:09:27.330820+00:00"
subtasks: [T025, T026, T027, T028, T029, T030, T031]
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

# Work Package Prompt: WP05 – Dev Harness UI Provider Controls

## Implementation Command

```bash
spec-kitty implement WP05 --base WP03
```

## Objectives

Add tile provider selection UI to `index.html` dev harness with localStorage persistence.

**Success Criteria**:

- ✅ Provider dropdown (OSM, HERE)
- ✅ Style dropdown (visible only for HERE)
- ✅ API key input (visible only for HERE)
- ✅ localStorage persistence (provider, style, API key)
- ✅ Map tiles update when selections change

---

## Context

**Target File**: `index.html` (root directory)
**Pattern**: Inline `<script>` tag with vanilla JavaScript (matches existing dev harness style)

---

## Subtasks & Guidance

### T025 – Add provider dropdown HTML

Insert in header section, after geocoder controls:

```html
<div class="row">
  <label for="tile-provider-select">Tile Provider:</label>
  <select id="tile-provider-select">
    <option value="osm">OpenStreetMap</option>
    <option value="here">HERE Maps</option>
  </select>
</div>
```

---

### T026 – Add style dropdown (hidden by default)

```html
<label for="tile-style-select" id="style-label" style="display:none;"
  >Style:</label
>
<select id="tile-style-select" style="display:none;">
  <option value="lite.day">Lite Day</option>
  <option value="normal.day">Normal Day</option>
  <option value="satellite.day">Satellite Day</option>
</select>
```

**Same row as T025**.

---

### T027 – Add API key input (hidden by default)

```html
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

**Same row**.

---

### T028 – Implement toggleHEREControls()

In `<script>` section:

```javascript
function toggleHEREControls(show) {
  const styleSelect = document.getElementById("tile-style-select");
  const styleLabel = document.getElementById("style-label");
  const apiKeyInput = document.getElementById("api-key-input");
  const apiKeyLabel = document.getElementById("api-key-label");

  const display = show ? "inline-block" : "none";
  styleSelect.style.display = display;
  styleLabel.style.display = display;
  apiKeyInput.style.display = display;
  apiKeyLabel.style.display = display;
}
```

---

### T029 – Implement applyTileProvider()

```javascript
function applyTileProvider() {
  const provider = providerSelect.value;
  const style = styleSelect.value;
  const apiKey = apiKeyInput.value;
  const mapElement = document.querySelector("leaflet-geokit");

  mapElement.setAttribute("tile-provider", provider);

  if (provider === "here") {
    mapElement.setAttribute("tile-style", style);
    mapElement.setAttribute("api-key", apiKey);
    toggleHEREControls(true);
  } else {
    mapElement.removeAttribute("tile-style");
    mapElement.removeAttribute("api-key");
    toggleHEREControls(false);
  }

  // Save to localStorage (T030)
  localStorage.setItem("leaflet-geokit:tile-provider", provider);
  localStorage.setItem("leaflet-geokit:tile-style", style);
  if (apiKey) {
    localStorage.setItem("leaflet-geokit:here-api-key", apiKey);
  }
}
```

---

### T030 – Add localStorage logic

**Storage keys**:

- `leaflet-geokit:tile-provider`
- `leaflet-geokit:tile-style`
- `leaflet-geokit:here-api-key`

**On page load** (in `<script>`):

```javascript
const STORAGE_KEYS = {
  TILE_PROVIDER: "leaflet-geokit:tile-provider",
  TILE_STYLE: "leaflet-geokit:tile-style",
  HERE_API_KEY: "leaflet-geokit:here-api-key",
};

const savedProvider = localStorage.getItem(STORAGE_KEYS.TILE_PROVIDER) || "osm";
const savedStyle = localStorage.getItem(STORAGE_KEYS.TILE_STYLE) || "lite.day";
const savedApiKey = localStorage.getItem(STORAGE_KEYS.HERE_API_KEY) || "";

providerSelect.value = savedProvider;
styleSelect.value = savedStyle;
apiKeyInput.value = savedApiKey;

toggleHEREControls(savedProvider === "here");
applyTileProvider(); // Apply saved config
```

---

### T031 – Wire up event listeners

```javascript
const providerSelect = document.getElementById("tile-provider-select");
const styleSelect = document.getElementById("tile-style-select");
const apiKeyInput = document.getElementById("api-key-input");

providerSelect.addEventListener("change", applyTileProvider);
styleSelect.addEventListener("change", applyTileProvider);
apiKeyInput.addEventListener("blur", applyTileProvider);
```

---

## Testing

**Manual**:

1. Open dev harness → select HERE → enter API key → verify tiles load
2. Refresh page → verify selections persist
3. Switch to OSM → verify HERE controls hide
4. Check localStorage in DevTools → verify keys stored

---

## Review Guidance

**Checkpoints**:

- ✅ UI controls in correct location (header)
- ✅ HERE controls hidden by default
- ✅ localStorage keys match specification
- ✅ Event listeners attached
- ✅ Provider switching works visually

---

## Activity Log

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
- 2026-02-21T08:09:48Z – guille – shell_pid=16416 – lane=doing – Assigned agent via workflow command
