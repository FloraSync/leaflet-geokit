# Data Model: HERE Maps Tile Provider Support

**Feature**: 001-here-maps-tile-provider-support
**Date**: 2026-02-20

## Overview

This document defines the data structures and state transitions for tile provider configuration in leaflet-geokit. The model supports multiple tile providers (OSM, HERE) with provider-specific styling and authentication.

---

## Core Entities

### 1. TileProviderConfig

**Purpose**: Configuration object for tile provider selection, styling, and authentication.

**TypeScript Definition**:

```typescript
interface TileProviderConfig {
  /**
   * Tile provider identifier
   * - "osm": OpenStreetMap (default, no API key required)
   * - "here": HERE Maps (requires API key)
   */
  provider: "osm" | "here" | string;

  /**
   * Provider-specific style identifier
   * - OSM: ignored (no style options)
   * - HERE: "lite.day" | "normal.day" | "satellite.day"
   */
  style?: string;

  /**
   * API key for authenticated providers
   * - OSM: ignored (public tiles)
   * - HERE: required
   */
  apiKey?: string;

  /**
   * Optional override for tile attribution text
   * If not provided, uses provider default
   */
  attribution?: string;
}
```

**Validation Rules**:

1. `provider` is required (non-empty string)
2. If `provider === "here"`, `apiKey` must be provided and non-empty
3. If `provider === "here"` and `style` is undefined, default to `"lite.day"`
4. If `provider === "osm"`, `style` and `apiKey` are ignored

**Default Values**:

```typescript
const DEFAULT_CONFIG: TileProviderConfig = {
  provider: "osm",
  style: undefined,
  apiKey: undefined,
  attribution: undefined,
};
```

**Examples**:

```typescript
// OSM (default)
{ provider: "osm" }

// HERE with default style
{ provider: "here", apiKey: "YOUR_API_KEY" }

// HERE with specific style
{ provider: "here", style: "satellite.day", apiKey: "YOUR_API_KEY" }

// Custom attribution override
{ provider: "osm", attribution: "Custom © Attribution" }
```

---

### 2. TileURLTemplate

**Purpose**: Provider-specific tile layer configuration generated from `TileProviderConfig`. This is the output of the TileProviderFactory.

**TypeScript Definition**:

```typescript
interface TileURLTemplate {
  /**
   * Leaflet tile URL template with placeholders
   * Examples:
   * - OSM: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
   * - HERE: "https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style={style}&apiKey={apiKey}"
   */
  urlTemplate: string;

  /**
   * Attribution text displayed on map
   */
  attribution: string;

  /**
   * Maximum zoom level supported by this provider
   */
  maxZoom?: number;

  /**
   * Tile subdomains for load balancing
   * Example: ["a", "b", "c"] for OSM
   */
  subdomains?: string[];

  /**
   * Additional Leaflet TileLayer options
   */
  options?: Record<string, any>;
}
```

**Examples**:

```typescript
// OSM tile template
{
  urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  subdomains: ["a", "b", "c"]
}

// HERE tile template
{
  urlTemplate: "https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=lite.day&apiKey=YOUR_KEY",
  attribution: 'Map Tiles &copy; <a href="https://www.here.com">HERE</a>',
  maxZoom: 20,
  subdomains: undefined
}
```

---

### 3. TileProviderState (Internal Web Component State)

**Purpose**: Internal state tracking for the web component's tile provider configuration.

**TypeScript Definition**:

```typescript
interface TileProviderState {
  /**
   * Current active provider
   */
  currentProvider: "osm" | "here" | string;

  /**
   * Current active style (if applicable)
   */
  currentStyle?: string;

  /**
   * Current API key (if applicable)
   */
  currentApiKey?: string;

  /**
   * Whether tile layer has been initialized
   */
  isInitialized: boolean;

  /**
   * Last known error (if any)
   */
  lastError?: {
    code: "missing_api_key" | "invalid_api_key" | "tile_load_failed";
    message: string;
    timestamp: number;
  };
}
```

**Initial State**:

```typescript
const INITIAL_STATE: TileProviderState = {
  currentProvider: "osm",
  currentStyle: undefined,
  currentApiKey: undefined,
  isInitialized: false,
  lastError: undefined,
};
```

---

## State Transitions

### Provider Switching Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Initial State (OSM)                      │
│  currentProvider: "osm"                                     │
│  isInitialized: true                                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ User selects HERE + provides API key
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               Validate Configuration                        │
│  - Check if API key is provided for HERE                    │
│  - Check if style is valid                                  │
└─────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
          Valid │                   │ Invalid
                ▼                   ▼
    ┌──────────────────┐   ┌──────────────────┐
    │  Apply New       │   │  Emit Error      │
    │  Configuration   │   │  Fallback to OSM │
    │                  │   │  Disable HERE    │
    └──────────────────┘   └──────────────────┘
                │
                ▼
    ┌──────────────────────────────────────┐
    │  Remove Existing Tile Layer          │
    └──────────────────────────────────────┘
                │
                ▼
    ┌──────────────────────────────────────┐
    │  Build New Tile URL Template         │
    │  (via TileProviderFactory)           │
    └──────────────────────────────────────┘
                │
                ▼
    ┌──────────────────────────────────────┐
    │  Create New Leaflet TileLayer        │
    │  Add to Map                          │
    └──────────────────────────────────────┘
                │
                ▼
    ┌──────────────────────────────────────┐
    │  Update State                        │
    │  currentProvider: "here"             │
    │  currentStyle: "lite.day"            │
    │  currentApiKey: "..."                │
    └──────────────────────────────────────┘
```

### Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Tile Provider Error Detected                   │
│  (API key missing, invalid, or tile load failed)            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Log Error to Console                           │
│              Store error in state.lastError                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          Emit Custom Event: "tile-provider-error"           │
│          Detail: { code, message, provider }                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Fallback to OSM Provider                       │
│              Remove failed tile layer                       │
│              Apply default OSM configuration                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│      Disable Failed Provider in Dev Harness                 │
│      (Dev harness listens to error event)                   │
└─────────────────────────────────────────────────────────────┘
```

### Attribute Change Reaction

**Trigger**: Any of these attributes change:

- `tile-provider`
- `tile-style`
- `api-key`

**Response**:

1. Re-validate configuration
2. If valid and different from current state:
   - Clear existing tile layer
   - Generate new TileURLTemplate
   - Create new Leaflet TileLayer
   - Update internal state
3. If invalid:
   - Emit error event
   - Maintain current tile layer (no change)
   - Log validation error

**Debouncing**: Not required for attribute changes (user-initiated, low frequency)

---

## Persistence Model (Dev Harness Only)

### localStorage Schema

**Keys**:

```typescript
const STORAGE_KEYS = {
  TILE_PROVIDER: "leaflet-geokit:tile-provider",
  TILE_STYLE: "leaflet-geokit:tile-style",
  HERE_API_KEY: "leaflet-geokit:here-api-key",
} as const;
```

**Stored Values**:

```typescript
// Example localStorage state
{
  "leaflet-geokit:tile-provider": "here",
  "leaflet-geokit:tile-style": "satellite.day",
  "leaflet-geokit:here-api-key": "YOUR_API_KEY"
}
```

**Lifecycle**:

1. **Page Load**: Read from localStorage → Apply to web component attributes
2. **User Change**: Update web component → Save to localStorage
3. **Clear**: Provide UI button to clear preferences (reset to OSM)

**Expiration**: No expiration (persists indefinitely until user clears)

---

## Provider Configuration Constants

### OSM Configuration

```typescript
const OSM_CONFIG: TileURLTemplate = {
  urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  subdomains: ["a", "b", "c"],
};
```

### HERE Configuration

```typescript
const HERE_STYLES = {
  "lite.day": "lite.day",
  "normal.day": "normal.day",
  "satellite.day": "satellite.day",
} as const;

function buildHEREConfig(style: string, apiKey: string): TileURLTemplate {
  return {
    urlTemplate: `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=${style}&apiKey=${apiKey}`,
    attribution: 'Map Tiles &copy; <a href="https://www.here.com">HERE</a>',
    maxZoom: 20,
    subdomains: undefined,
  };
}
```

---

## Summary

**Key Relationships**:

- `TileProviderConfig` (user input) → `TileProviderFactory.buildTileURL()` → `TileURLTemplate` (Leaflet config)
- `TileProviderState` (internal) tracks current configuration and errors
- Dev harness uses `localStorage` to persist user preferences

**Validation Points**:

1. HERE provider requires API key
2. Style validation (HERE only)
3. URL template construction (no malformed URLs)

**Error States**:

- Missing API key for HERE
- Invalid API key (401/403)
- Tile load failures (network, 404, etc.)
