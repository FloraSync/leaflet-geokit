# Implementation Quickstart: HERE Maps Tile Provider Support

**Feature**: 001-here-maps-tile-provider-support
**Date**: 2026-02-20

## Overview

This quickstart guide provides step-by-step instructions for implementing HERE Maps tile provider support in leaflet-geokit. Follow these steps in order to ensure proper integration.

---

## Prerequisites

- Familiarity with TypeScript and web components
- Understanding of Leaflet TileLayer API
- Access to leaflet-geokit codebase

---

## Implementation Steps

### Step 1: Create TileProviderFactory

**File**: `src/lib/TileProviderFactory.ts`

**Purpose**: Centralize tile URL construction logic for all providers.

**Implementation**:

```typescript
// src/lib/TileProviderFactory.ts

export interface TileProviderConfig {
  provider: "osm" | "here" | string;
  style?: string;
  apiKey?: string;
  attribution?: string;
}

export interface TileURLTemplate {
  urlTemplate: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string[];
}

/**
 * Provider configuration constants
 */
const PROVIDERS = {
  osm: {
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: ["a", "b", "c"],
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

/**
 * Build tile URL template from provider configuration
 */
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

    case "here": {
      if (!apiKey) {
        throw new Error("HERE Maps requires an API key");
      }

      const hereStyle =
        style && style in PROVIDERS.here.styles
          ? style
          : PROVIDERS.here.defaultStyle;

      return {
        urlTemplate: `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=${hereStyle}&apiKey=${apiKey}`,
        attribution: attribution || PROVIDERS.here.attribution,
        maxZoom: PROVIDERS.here.maxZoom,
        subdomains: undefined,
      };
    }

    default:
      throw new Error(`Unknown tile provider: ${provider}`);
  }
}

/**
 * Validate provider configuration
 */
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

**Test Coverage**: Create `tests/unit/tile-provider.spec.ts` to test URL construction for each provider.

---

### Step 2: Update Public Types

**File**: `src/types/public.ts`

**Add New Types**:

```typescript
// Add to src/types/public.ts

export interface TileProviderConfig {
  provider: "osm" | "here" | string;
  style?: string;
  apiKey?: string;
  attribution?: string;
}

export interface TileURLTemplate {
  urlTemplate: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string[];
}

export interface TileProviderErrorDetail {
  code:
    | "missing_api_key"
    | "invalid_api_key"
    | "tile_load_failed"
    | "unknown_provider";
  message: string;
  provider: string;
  timestamp: number;
}

export interface TileProviderChangedDetail {
  provider: string;
  style?: string;
  previousProvider: string;
  timestamp: number;
}

// Extend existing LeafletDrawMapElementAPI
export interface LeafletDrawMapElementAPI extends HTMLElement {
  // ... existing properties

  // New tile provider properties
  tileProvider?: "osm" | "here" | string;
  tileStyle?: string;
  apiKey?: string;
}
```

---

### Step 3: Modify LeafletDrawMapElement

**File**: `src/components/LeafletDrawMapElement.ts`

**Changes Required**:

#### 3.1 Add Private Properties

```typescript
// Add after existing private properties (around line 30)
private _tileProvider?: string;
private _tileStyle?: string;
private _apiKey?: string;
```

#### 3.2 Update observedAttributes

```typescript
// Update observedAttributes array (around line 178)
static get observedAttributes(): string[] {
  return [
    // ... existing attributes
    "tile-url",
    "tile-attribution",
    // New attributes
    "tile-provider",
    "tile-style",
    "api-key",
    // ... rest of attributes
  ];
}
```

#### 3.3 Update attributeChangedCallback

```typescript
// Add cases in attributeChangedCallback (around line 232)
attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
  // ... existing cases

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

  // ... rest of cases
}
```

#### 3.4 Add Getter/Setter Properties

```typescript
// Add after existing getters/setters (around line 341)
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

#### 3.5 Create \_updateTileLayer Method

```typescript
// Add new private method
import { buildTileURL, validateProviderConfig, type TileProviderConfig } from "@src/lib/TileProviderFactory";

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
        this._handleTileProviderError("missing_api_key", validation.error || "Invalid configuration", this._tileProvider);
        return;
      }

      // Build tile URL template
      const tileConfig = buildTileURL(config);

      // Update tile layer in MapController
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
    this._handleTileProviderError("tile_load_failed", error instanceof Error ? error.message : "Unknown error", this._tileProvider || "unknown");
  }
}

private _handleTileProviderError(code: string, message: string, provider: string): void {
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

private _emitTileProviderChanged(provider: string, style?: string): void {
  this.dispatchEvent(new CustomEvent("tile-provider-changed", {
    bubbles: true,
    detail: {
      provider,
      style,
      previousProvider: this._tileProvider,
      timestamp: Date.now()
    }
  }));
}
```

#### 3.6 Update MapController Integration

**File**: `src/lib/MapController.ts`

**Add method**:

```typescript
// Add to MapController class
import type { TileURLTemplate } from "@src/lib/TileProviderFactory";

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

  // Listen for tile errors
  this._tileLayer.on('tileerror', (error: any) => {
    console.error('Tile load error:', error);
    // Emit error event (handle in LeafletDrawMapElement)
  });
}
```

---

### Step 4: Update Dev Harness HTML Files

**Files to Modify**:

- `index.html`
- `preact.html`
- `react.html`
- `external.html`

**Add UI Controls** (insert after existing header controls):

```html
<!-- Tile Provider Controls -->
<div class="row">
  <label for="tile-provider-select">Tile Provider:</label>
  <select id="tile-provider-select">
    <option value="osm">OpenStreetMap</option>
    <option value="here">HERE Maps</option>
  </select>

  <label for="tile-style-select" id="style-label" style="display:none;"
    >Style:</label
  >
  <select id="tile-style-select" style="display:none;">
    <option value="lite.day">Lite Day</option>
    <option value="normal.day">Normal Day</option>
    <option value="satellite.day">Satellite Day</option>
  </select>

  <label for="api-key-input" id="api-key-label" style="display:none;"
    >HERE API Key:</label
  >
  <input
    type="text"
    id="api-key-input"
    placeholder="Enter HERE API key"
    style="display:none;"
  />
</div>
```

**Add JavaScript Logic** (in `<script>` section):

```javascript
// localStorage keys
const STORAGE_KEYS = {
  TILE_PROVIDER: "leaflet-geokit:tile-provider",
  TILE_STYLE: "leaflet-geokit:tile-style",
  HERE_API_KEY: "leaflet-geokit:here-api-key",
};

// Get elements
const providerSelect = document.getElementById("tile-provider-select");
const styleSelect = document.getElementById("tile-style-select");
const styleLabel = document.getElementById("style-label");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeyLabel = document.getElementById("api-key-label");
const mapElement = document.querySelector("leaflet-geokit");

// Restore preferences from localStorage
const savedProvider = localStorage.getItem(STORAGE_KEYS.TILE_PROVIDER) || "osm";
const savedStyle = localStorage.getItem(STORAGE_KEYS.TILE_STYLE) || "lite.day";
const savedApiKey = localStorage.getItem(STORAGE_KEYS.HERE_API_KEY) || "";

providerSelect.value = savedProvider;
styleSelect.value = savedStyle;
apiKeyInput.value = savedApiKey;

// Show/hide HERE-specific controls
function toggleHEREControls(show) {
  styleSelect.style.display = show ? "inline-block" : "none";
  styleLabel.style.display = show ? "inline-block" : "none";
  apiKeyInput.style.display = show ? "inline-block" : "none";
  apiKeyLabel.style.display = show ? "inline-block" : "none";
}

toggleHEREControls(savedProvider === "here");

// Apply saved configuration to map
function applyTileProvider() {
  const provider = providerSelect.value;
  const style = styleSelect.value;
  const apiKey = apiKeyInput.value;

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

  // Save to localStorage
  localStorage.setItem(STORAGE_KEYS.TILE_PROVIDER, provider);
  localStorage.setItem(STORAGE_KEYS.TILE_STYLE, style);
  if (apiKey) {
    localStorage.setItem(STORAGE_KEYS.HERE_API_KEY, apiKey);
  }
}

// Event listeners
providerSelect.addEventListener("change", applyTileProvider);
styleSelect.addEventListener("change", applyTileProvider);
apiKeyInput.addEventListener("blur", applyTileProvider);

// Error handling
mapElement.addEventListener("tile-provider-error", (event) => {
  const { code, message } = event.detail;
  showToast(`Error: ${message}`, "error");

  // Disable HERE option if API key is invalid
  if (code === "missing_api_key" || code === "invalid_api_key") {
    providerSelect.querySelector('option[value="here"]').disabled = true;
  }
});

// Success feedback
mapElement.addEventListener("tile-provider-changed", (event) => {
  const { provider, style } = event.detail;
  const styleName = style ? ` (${style})` : "";
  showToast(`Switched to ${provider}${styleName}`, "success");
});

// Toast notification helper
function showToast(message, type = "info") {
  // Use existing toast implementation in dev harness
  // ... (implementation details)
}

// Apply initial configuration
applyTileProvider();
```

---

### Step 5: Create Tests

#### 5.1 Unit Tests

**File**: `tests/unit/tile-provider.spec.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  buildTileURL,
  validateProviderConfig,
} from "@src/lib/TileProviderFactory";

describe("TileProviderFactory", () => {
  describe("buildTileURL", () => {
    it("should build OSM tile URL", () => {
      const result = buildTileURL({ provider: "osm" });
      expect(result.urlTemplate).toContain("openstreetmap.org");
      expect(result.maxZoom).toBe(19);
    });

    it("should build HERE tile URL with default style", () => {
      const result = buildTileURL({ provider: "here", apiKey: "test-key" });
      expect(result.urlTemplate).toContain("maps.hereapi.com");
      expect(result.urlTemplate).toContain("style=lite.day");
      expect(result.urlTemplate).toContain("apiKey=test-key");
    });

    it("should build HERE tile URL with custom style", () => {
      const result = buildTileURL({
        provider: "here",
        style: "satellite.day",
        apiKey: "test-key",
      });
      expect(result.urlTemplate).toContain("style=satellite.day");
    });

    it("should throw error for HERE without API key", () => {
      expect(() => buildTileURL({ provider: "here" })).toThrow(
        "requires an API key",
      );
    });
  });

  describe("validateProviderConfig", () => {
    it("should validate OSM config", () => {
      const result = validateProviderConfig({ provider: "osm" });
      expect(result.valid).toBe(true);
    });

    it("should reject HERE without API key", () => {
      const result = validateProviderConfig({ provider: "here" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("API key");
    });
  });
});
```

#### 5.2 E2E Tests

**File**: `tests/e2e/tile-switching.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Tile Provider Switching", () => {
  test("should switch from OSM to HERE", async ({ page }) => {
    await page.goto("/");

    // Mock HERE API responses
    await page.route("https://maps.hereapi.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("mock-tile-image"),
      });
    });

    // Select HERE provider
    await page.selectOption("#tile-provider-select", "here");
    await page.fill("#api-key-input", "test-api-key");
    await page.selectOption("#tile-style-select", "lite.day");

    // Verify map component attributes
    const map = page.locator("leaflet-geokit");
    await expect(map).toHaveAttribute("tile-provider", "here");
    await expect(map).toHaveAttribute("tile-style", "lite.day");
    await expect(map).toHaveAttribute("api-key", "test-api-key");
  });

  test("should show error for missing API key", async ({ page }) => {
    await page.goto("/");

    // Select HERE without API key
    await page.selectOption("#tile-provider-select", "here");

    // Wait for error event
    const errorEvent = await page.evaluate(() => {
      return new Promise((resolve) => {
        document
          .querySelector("leaflet-geokit")
          .addEventListener("tile-provider-error", (e) => {
            resolve(e.detail);
          });
      });
    });

    expect(errorEvent.code).toBe("missing_api_key");
  });
});
```

---

### Step 6: Update Documentation

**File**: `README.md`

**Add Section**:

````markdown
## Tile Providers

The `<leaflet-geokit>` web component supports multiple tile providers:

### OpenStreetMap (Default)

```html
<leaflet-geokit tile-provider="osm"></leaflet-geokit>
```
````

### HERE Maps

Requires a HERE API key ([get one here](https://developer.here.com/)):

```html
<leaflet-geokit
  tile-provider="here"
  tile-style="lite.day"
  api-key="YOUR_HERE_API_KEY"
>
</leaflet-geokit>
```

**Available HERE Styles**:

- `lite.day` - Lightweight basemap (default)
- `normal.day` - Standard street map
- `satellite.day` - Satellite imagery

### Custom Tile Server (Backward Compatible)

You can still use custom tile URLs:

```html
<leaflet-geokit
  tile-url="https://example.com/tiles/{z}/{x}/{y}.png"
></leaflet-geokit>
```

### Security Note

⚠️ For production use, **do not** expose API keys client-side. Use a server-side proxy to request tiles.

```

---

## Testing Checklist

Before marking this feature complete, verify:

- [ ] TileProviderFactory correctly builds URLs for OSM and HERE
- [ ] Web component accepts and reflects new attributes
- [ ] Changing tile-provider updates the map tiles
- [ ] Missing API key for HERE triggers error event and fallback to OSM
- [ ] Dev harness saves preferences to localStorage
- [ ] Dev harness restores preferences on page reload
- [ ] Style dropdown is visible only when HERE is selected
- [ ] Tests pass (unit + e2e)
- [ ] README.md documents new attributes
- [ ] No TypeScript errors

---

## Rollout Plan

1. **Phase 1**: Implement TileProviderFactory and unit tests
2. **Phase 2**: Update web component (attributes, error handling)
3. **Phase 3**: Update dev harness UI (one HTML file first, then replicate)
4. **Phase 4**: Add e2e tests
5. **Phase 5**: Update documentation

---

## Troubleshooting

### Tiles not loading after provider switch

**Check**:
1. Console for errors
2. Network tab for tile requests (check URLs and status codes)
3. API key validity (test in HERE developer console)

### localStorage not persisting

**Check**:
1. Browser privacy settings (localStorage enabled?)
2. Correct storage keys used
3. localStorage quota not exceeded

### Tests failing

**Check**:
1. Mock API responses configured correctly
2. Playwright running with network mocking enabled
3. Test API key matches expected value in tests
```
