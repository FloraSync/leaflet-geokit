# Web Component API Contract: Tile Provider Support

**Feature**: 001-here-maps-tile-provider-support
**Date**: 2026-02-20
**Component**: `<leaflet-geokit>` (LeafletDrawMapElement)

## Overview

This document defines the public API contract for tile provider configuration in the leaflet-geokit web component. It specifies new attributes, properties, methods, and events added to support multiple tile providers (OSM, HERE).

---

## New Attributes

### `tile-provider`

**Description**: Specifies the tile provider to use for map rendering.

**Type**: `string`
**Default**: `undefined` (fallback to `tile-url` behavior)
**Valid Values**:

- `"osm"` - OpenStreetMap
- `"here"` - HERE Maps
- Other custom provider identifiers (extensible)

**HTML Usage**:

```html
<leaflet-geokit tile-provider="osm"></leaflet-geokit>
<leaflet-geokit tile-provider="here" api-key="YOUR_KEY"></leaflet-geokit>
```

**JavaScript Usage**:

```javascript
const map = document.querySelector("leaflet-geokit");
map.setAttribute("tile-provider", "here");
// Or via property:
map.tileProvider = "here";
```

**Behavior**:

- When set, the web component constructs tile URLs internally using TileProviderFactory
- When `undefined` or `null`, falls back to `tile-url` attribute (backward compatibility)
- Changing this attribute triggers tile layer replacement

---

### `tile-style`

**Description**: Specifies the visual style for tile providers that support multiple styles (e.g., HERE Maps).

**Type**: `string`
**Default**: Provider-specific default (HERE: `"lite.day"`)
**Valid Values** (HERE):

- `"lite.day"` - Lightweight basemap (default)
- `"normal.day"` - Standard street map
- `"satellite.day"` - Satellite imagery

**HTML Usage**:

```html
<leaflet-geokit
  tile-provider="here"
  tile-style="satellite.day"
  api-key="YOUR_KEY"
>
</leaflet-geokit>
```

**JavaScript Usage**:

```javascript
const map = document.querySelector("leaflet-geokit");
map.setAttribute("tile-style", "normal.day");
// Or via property:
map.tileStyle = "normal.day";
```

**Behavior**:

- Ignored when `tile-provider` is not set or is `"osm"`
- Changing this attribute re-generates tile URLs and reloads tiles
- Invalid styles are ignored (falls back to default)

---

### `api-key`

**Description**: API key for authenticated tile providers (e.g., HERE Maps).

**Type**: `string`
**Default**: `undefined`
**Required For**: `tile-provider="here"`

**HTML Usage**:

```html
<leaflet-geokit tile-provider="here" api-key="YOUR_HERE_API_KEY">
</leaflet-geokit>
```

**JavaScript Usage**:

```javascript
const map = document.querySelector("leaflet-geokit");
map.setAttribute("api-key", "YOUR_KEY");
// Or via property:
map.apiKey = "YOUR_KEY";
```

**Behavior**:

- Required when `tile-provider="here"`
- If missing for HERE, emits `tile-provider-error` event and falls back to OSM
- Changing this attribute re-generates tile URLs and reloads tiles
- **Security Note**: In dev harness, stored in localStorage. Production apps should use server-side proxy.

---

## Updated Properties

### `tileProvider`

**Type**: `string | undefined`
**Getter**: Returns current tile provider identifier
**Setter**: Updates tile provider and triggers tile layer replacement

**Example**:

```javascript
const map = document.querySelector("leaflet-geokit");
console.log(map.tileProvider); // "osm"
map.tileProvider = "here";
```

---

### `tileStyle`

**Type**: `string | undefined`
**Getter**: Returns current tile style
**Setter**: Updates tile style and triggers tile layer replacement

**Example**:

```javascript
const map = document.querySelector("leaflet-geokit");
console.log(map.tileStyle); // "lite.day"
map.tileStyle = "satellite.day";
```

---

### `apiKey`

**Type**: `string | undefined`
**Getter**: Returns current API key (or undefined if not set)
**Setter**: Updates API key and triggers tile layer replacement

**Example**:

```javascript
const map = document.querySelector("leaflet-geokit");
map.apiKey = "NEW_API_KEY";
```

**Security Note**: Getter returns the stored API key. Avoid logging or exposing this value.

---

## Existing Attributes (Unchanged Behavior)

### `tile-url`

**Backward Compatibility**: When `tile-provider` is not set, the component uses `tile-url` for custom tile servers (existing behavior).

**Example**:

```html
<!-- Old usage (still works) -->
<leaflet-geokit
  tile-url="https://example.com/tiles/{z}/{x}/{y}.png"
></leaflet-geokit>

<!-- New usage (overrides tile-url) -->
<leaflet-geokit tile-provider="here" api-key="YOUR_KEY"></leaflet-geokit>
```

**Priority**:

1. If `tile-provider` is set → Use TileProviderFactory (ignore `tile-url`)
2. If `tile-provider` is not set → Use `tile-url` (backward compatible)

---

## New Events

### `tile-provider-error`

**Description**: Emitted when tile provider configuration is invalid or tile loading fails.

**Event Type**: `CustomEvent`
**Bubbles**: Yes
**Cancelable**: No

**Event Detail**:

```typescript
interface TileProviderErrorDetail {
  code:
    | "missing_api_key"
    | "invalid_api_key"
    | "tile_load_failed"
    | "unknown_provider";
  message: string;
  provider: string;
  timestamp: number;
}
```

**Usage**:

```javascript
const map = document.querySelector("leaflet-geokit");
map.addEventListener("tile-provider-error", (event) => {
  console.error("Tile provider error:", event.detail);
  // Example: { code: "missing_api_key", message: "HERE Maps requires an API key", provider: "here", timestamp: 1234567890 }
});
```

**Triggered When**:

- HERE provider selected without API key
- Tile loading fails (network error, 403 Forbidden, 404 Not Found)
- Invalid provider identifier

**Default Behavior**:

- Error is logged to console
- Component falls back to OSM tiles
- Dev harness disables failed provider option

---

### `tile-provider-changed`

**Description**: Emitted when tile provider successfully changes.

**Event Type**: `CustomEvent`
**Bubbles**: Yes
**Cancelable**: No

**Event Detail**:

```typescript
interface TileProviderChangedDetail {
  provider: string;
  style?: string;
  previousProvider: string;
  timestamp: number;
}
```

**Usage**:

```javascript
const map = document.querySelector("leaflet-geokit");
map.addEventListener("tile-provider-changed", (event) => {
  console.log("Provider changed:", event.detail);
  // Example: { provider: "here", style: "lite.day", previousProvider: "osm", timestamp: 1234567890 }
});
```

**Triggered When**:

- Tile provider attribute changes and new tiles load successfully
- Useful for UI feedback (e.g., show success toast in dev harness)

---

## Methods

### No new public methods

All tile provider configuration is done via attributes/properties. The component handles tile layer management internally.

---

## Attribute Change Behavior

### Reactivity

All new attributes (`tile-provider`, `tile-style`, `api-key`) are observed and trigger tile layer updates when changed.

**Implementation**:

```typescript
static get observedAttributes(): string[] {
  return [
    // Existing attributes...
    "tile-url",
    "latitude",
    "longitude",
    // New attributes
    "tile-provider",
    "tile-style",
    "api-key"
  ];
}

attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
  switch (name) {
    case "tile-provider":
      this._tileProvider = newValue ?? undefined;
      this._updateTileLayer();
      break;
    case "tile-style":
      this._tileStyle = newValue ?? undefined;
      this._updateTileLayer();
      break;
    case "api-key":
      this._apiKey = newValue ?? undefined;
      this._updateTileLayer();
      break;
    // ... handle other attributes
  }
}
```

### Update Strategy

**When tile provider attributes change**:

1. Validate new configuration
2. If invalid:
   - Emit `tile-provider-error` event
   - Keep existing tile layer (no visual disruption)
   - Log error to console
3. If valid:
   - Remove existing tile layer from map
   - Generate new TileURLTemplate via TileProviderFactory
   - Create new Leaflet TileLayer
   - Add new tile layer to map
   - Emit `tile-provider-changed` event

**Debouncing**: Not implemented (attribute changes are user-initiated and infrequent)

---

## Error Handling Contract

### Missing API Key (HERE)

**Scenario**: User sets `tile-provider="here"` without `api-key`

**Behavior**:

1. Emit `tile-provider-error` event with `code: "missing_api_key"`
2. Log error: `"HERE Maps requires an API key. Falling back to OpenStreetMap."`
3. Set `tile-provider` to `"osm"` internally
4. Load OSM tiles

**Event Detail**:

```javascript
{
  code: "missing_api_key",
  message: "HERE Maps requires an API key",
  provider: "here",
  timestamp: Date.now()
}
```

---

### Invalid API Key (HERE)

**Scenario**: HERE API returns 401/403 (unauthorized)

**Behavior**:

1. Emit `tile-provider-error` event with `code: "invalid_api_key"`
2. Log error: `"HERE Maps API key is invalid or unauthorized. Falling back to OpenStreetMap."`
3. Set `tile-provider` to `"osm"` internally
4. Load OSM tiles

**Event Detail**:

```javascript
{
  code: "invalid_api_key",
  message: "HERE Maps API key is invalid or unauthorized",
  provider: "here",
  timestamp: Date.now()
}
```

**Detection**: Listen to Leaflet `tileerror` event, check HTTP status code

---

### Tile Load Failure

**Scenario**: Network error, server timeout, 404 Not Found

**Behavior**:

1. Emit `tile-provider-error` event with `code: "tile_load_failed"`
2. Log error: `"Failed to load tiles from {provider}. Falling back to OpenStreetMap."`
3. Set `tile-provider` to `"osm"` internally
4. Load OSM tiles

**Event Detail**:

```javascript
{
  code: "tile_load_failed",
  message: "Failed to load tiles from HERE",
  provider: "here",
  timestamp: Date.now()
}
```

---

## Type Definitions

```typescript
// Add to src/types/public.ts

export interface LeafletDrawMapElementAPI extends HTMLElement {
  // Existing properties...
  tileUrl: string;
  tileAttribution?: string;
  latitude: number;
  longitude: number;
  zoom: number;

  // New properties
  tileProvider?: "osm" | "here" | string;
  tileStyle?: string;
  apiKey?: string;
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
```

---

## Usage Examples

### Basic HERE Maps Usage

```html
<!DOCTYPE html>
<html>
  <head>
    <script type="module" src="leaflet-geokit.js"></script>
  </head>
  <body>
    <leaflet-geokit
      tile-provider="here"
      tile-style="lite.day"
      api-key="YOUR_HERE_API_KEY"
      latitude="37.7749"
      longitude="-122.4194"
      zoom="12"
      style="width: 800px; height: 600px;"
    >
    </leaflet-geokit>
  </body>
</html>
```

---

### Dynamic Provider Switching

```javascript
const map = document.querySelector("leaflet-geokit");

// Switch to HERE
map.tileProvider = "here";
map.tileStyle = "satellite.day";
map.apiKey = "YOUR_KEY";

// Switch back to OSM
map.tileProvider = "osm";

// Use custom tile server (fallback to tile-url)
map.removeAttribute("tile-provider");
map.tileUrl = "https://custom-tiles.example.com/{z}/{x}/{y}.png";
```

---

### Error Handling

```javascript
const map = document.querySelector("leaflet-geokit");

map.addEventListener("tile-provider-error", (event) => {
  const { code, message, provider } = event.detail;

  switch (code) {
    case "missing_api_key":
      alert(`Please provide an API key for ${provider}`);
      break;
    case "invalid_api_key":
      alert(`API key for ${provider} is invalid`);
      break;
    case "tile_load_failed":
      console.error(`Failed to load tiles from ${provider}`);
      break;
  }
});

map.addEventListener("tile-provider-changed", (event) => {
  console.log(`Switched to ${event.detail.provider}`);
});
```

---

## Migration Guide

### For Existing Users

**Before (using tile-url)**:

```html
<leaflet-geokit
  tile-url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
></leaflet-geokit>
```

**After (same behavior, backward compatible)**:

```html
<!-- Still works! -->
<leaflet-geokit
  tile-url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
></leaflet-geokit>

<!-- Or use new provider attribute -->
<leaflet-geokit tile-provider="osm"></leaflet-geokit>
```

**No breaking changes**. Existing code continues to work.

---

### For New Users (HERE Maps)

```html
<leaflet-geokit
  tile-provider="here"
  tile-style="lite.day"
  api-key="YOUR_API_KEY"
>
</leaflet-geokit>
```

---

## Summary

**New Attributes**: `tile-provider`, `tile-style`, `api-key`
**New Events**: `tile-provider-error`, `tile-provider-changed`
**Backward Compatible**: Yes (tile-url still works when tile-provider not set)
**Framework Agnostic**: Yes (standard web component API)
