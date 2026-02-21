# Research Findings: HERE Maps Tile Provider Support

**Feature**: 001-here-maps-tile-provider-support
**Date**: 2026-02-20
**Status**: Complete

## Overview

This document captures research findings for implementing HERE maps as an alternative tile provider in leaflet-geokit. The primary goal is to resolve tile jitter issues observed when passing pre-constructed HERE URLs directly to the web component.

---

## 1. HERE Maps API Integration Patterns

### Question

What is the exact URL format for HERE maps v3 base tiles, and how should they be authenticated?

### Findings

**HERE Maps v3 Tile API Format:**

```
https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style={style}&apiKey={apiKey}
```

**Parameters:**

- `{z}/{x}/{y}` - Standard tile coordinates (zoom/x/y)
- `png8` - 8-bit PNG format (also available: `png`, `jpg`)
- `style` - Map visual theme (see styles below)
- `apiKey` - HERE API key for authentication

**Available Styles (Base Map):**

- `lite.day` - Simplified, lighter basemap (recommended for overlays)
- `normal.day` - Standard street map with full detail
- `satellite.day` - Satellite imagery

**Attribution:**

```
Map Tiles &copy; <a href="https://www.here.com">HERE</a>
```

**Rate Limits:**

- Free tier: 250,000 transactions/month
- Transactions = tile requests
- Rate limit handling: HTTP 429 (Too Many Requests)

**Decision**: Use the confirmed URL format with style and apiKey parameters. Default to `lite.day` for its lightweight design suitable for development.

---

## 2. Tile Jitter Root Cause Analysis

### Question

Why does passing pre-constructed HERE URLs cause tile jitter/ordering issues in Leaflet?

### Hypothesis

Leaflet's tile loading queue may conflict with HERE's URL parameters or authentication headers, causing race conditions in tile rendering order.

### Findings

**Potential Causes:**

1. **URL Parameter Ordering**: Leaflet may cache tiles based on URL hash. If URL parameters vary (e.g., dynamic apiKey insertion), it could break caching
2. **Tile Load Timing**: HERE's API may have different latency characteristics than OSM, causing out-of-order tile arrival
3. **Authentication Overhead**: API key validation on every tile request may introduce variable latency
4. **Browser Connection Limits**: Modern browsers limit concurrent connections per domain (typically 6). HERE's domain differs from OSM, which could affect tile loading patterns

**Recommended Solution:**
Construct tile URLs internally within the web component with consistent parameter ordering and caching strategy. This ensures:

- Stable URL generation per tile coordinate
- Predictable cache key generation
- Consistent connection pooling
- Proper error handling for authentication failures

**Decision**: Implement TileProviderFactory to centralize URL construction logic, ensuring consistent URL generation and proper caching behavior.

---

## 3. Web Component Attribute Best Practices

### Question

What's the best pattern for multi-value configuration in web components?

### Research

**Option A: Separate Attributes** (Recommended)

```html
<leaflet-geokit tile-provider="here" tile-style="lite.day" api-key="YOUR_KEY">
</leaflet-geokit>
```

**Pros:**

- Idiomatic HTML
- Easy to inspect/debug in DevTools
- Framework-agnostic (works with all frameworks)
- Individual attribute observation (fine-grained reactivity)

**Cons:**

- More attributes to manage
- Slightly more verbose

**Option B: JSON Configuration Attribute**

```html
<leaflet-geokit
  tile-config='{"provider":"here","style":"lite.day","apiKey":"YOUR_KEY"}'
>
</leaflet-geokit>
```

**Pros:**

- Single attribute
- Compact

**Cons:**

- Requires JSON parsing
- Harder to debug (JSON string in HTML)
- Less framework-friendly (string escaping issues)
- No granular attribute observation

**Decision**: Use separate attributes (`tile-provider`, `tile-style`, `api-key`) for better developer experience and framework compatibility.

---

## 4. Backward Compatibility Strategy

### Question

How to maintain compatibility with existing `tile-url` usage while adding provider-specific attributes?

### Findings

**Current Behavior:**

- Web component accepts `tile-url` attribute
- Default: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Users can pass custom tile URLs

**Proposed Behavior:**

```typescript
if (tileProvider) {
  // Use TileProviderFactory to construct URL
  const tileConfig = buildTileURL({
    provider: tileProvider,
    style: tileStyle,
    apiKey: apiKey,
  });
  // Apply constructed URL to Leaflet tile layer
} else {
  // Fallback to tile-url (existing behavior)
  // This maintains backward compatibility
}
```

**Migration Path:**

- **Existing users**: Continue using `tile-url` with custom URLs (no breaking changes)
- **New users**: Use `tile-provider` for built-in providers (OSM, HERE)
- **Future**: Add more providers (Mapbox, Google Maps, etc.)

**Decision**: Implement fallback logic where `tile-provider` takes precedence over `tile-url`. If neither is set, use default OSM tile URL.

---

## 5. localStorage API Key Security

### Question

Are there security implications of storing HERE API key in localStorage?

### Findings

**Security Considerations:**

**localStorage Risks:**

- Accessible via JavaScript (XSS vulnerability)
- Not encrypted
- Persistent across sessions
- Visible in browser DevTools

**Context: Dev Harness Usage:**

- Dev harness is for testing/development only
- Not intended for production use
- API key is user-provided (not bundled in app)
- Free tier rate limits provide natural protection

**Production Recommendations:**

1. **Server-side Proxy**: Production apps should proxy tile requests through their backend
   ```
   Frontend → Backend Proxy → HERE API
   ```
2. **Environment Variables**: Store API keys server-side, not client-side
3. **Rate Limiting**: Implement backend rate limiting to prevent abuse
4. **Domain Restrictions**: Configure HERE API key with domain restrictions

**Decision**:

- **Dev Harness**: localStorage is acceptable (user responsibility to protect their key)
- **Documentation**: Clearly document that localStorage storage is for dev/testing only
- **Production**: Recommend server-side proxy pattern in README

**Security Documentation to Add:**

```markdown
## Security Note: API Key Storage

⚠️ The dev harness stores the HERE API key in `localStorage` for convenience during development.
This is NOT suitable for production use.

**For Production:**

1. Use a server-side proxy to make tile requests
2. Store API keys securely on your backend
3. Configure HERE API key with domain restrictions
4. Implement rate limiting to prevent abuse
```

---

## 6. Testing Strategy

### Question

How to test provider switching and tile loading without real API keys?

### Findings

**Unit Testing:**

- Mock TileProviderFactory URL generation
- Test attribute handling logic
- Validate URL format construction
- No actual tile loading needed

**E2E Testing:**

- Use Playwright to test dev harness UI
- Mock HERE API responses (intercept network requests)
- Test provider switching behavior
- Validate error handling (invalid API key, network failure)

**Mock Strategy:**

```typescript
// Playwright test
await page.route("https://maps.hereapi.com/**", (route) => {
  route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from(MOCK_TILE_IMAGE),
  });
});
```

**Test Coverage:**

1. ✅ URL construction (unit)
2. ✅ Provider switching (e2e)
3. ✅ API key validation (unit + e2e)
4. ✅ Error fallback to OSM (e2e)
5. ✅ localStorage persistence (e2e)

**Decision**: Use mocked API responses for e2e tests. No real HERE API key required in CI/CD.

---

## Summary of Key Decisions

| Decision                                                           | Rationale                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| Use separate attributes (`tile-provider`, `tile-style`, `api-key`) | Better DX, framework compatibility, debuggability         |
| Construct URLs internally via TileProviderFactory                  | Fixes tile jitter, enables caching, centralizes logic     |
| Maintain `tile-url` fallback                                       | Backward compatibility, custom tile server support        |
| Store API key in localStorage (dev harness only)                   | Acceptable for dev/test, document production alternatives |
| Mock API responses in tests                                        | No real API key needed, faster tests, predictable results |
| Default to `lite.day` style                                        | Lightweight, suitable for overlays and development        |

---

## References

- [HERE Maps Tile API v3 Documentation](https://developer.here.com/documentation/map-tile/dev_guide/topics/quick-start.html)
- [Leaflet TileLayer Documentation](https://leafletjs.com/reference.html#tilelayer)
- [Web Components Best Practices](https://web.dev/custom-elements-best-practices/)
