# Google Maps optional adapter spike

Status: design spike only. No Google SDK, browser key, billing account, paid tile
endpoint or runtime network request has been added to GeoKit. Core stays Leaflet
+ OSM. See [provider boundary and security guidance](providers.md).

## Package boundary

A future, separately installed package (proposed name, **not published**:
`@florasync/geokit-google-adapter`) owns SDK loading, credentials policy, vendor
terms, attribution, quota/billing controls and Google-specific cleanup. It must
not be imported by core or automatically selected as fallback. Review vendor
terms for the chosen product and map-compositing approach before implementation.
Do not fabricate a Google raster URL or treat Google imagery as a generic XYZ
endpoint.

Two possible strategies, deliberately not conflated:

1. A vendor-permitted Leaflet-compatible basemap bridge returns a fresh Leaflet
   layer through `VectorBasemapProvider.createLayer` (or raster resolution only
   when the licensed product genuinely supplies that contract). It uses existing
   `setBasemapAdapter` and Leaflet.draw/irrigation features without touching the
   public component API. The bridge must prove visual synchronization, attribution,
   map-pane ordering, pointer routing and cleanup. Google SDK capability alone is
   not evidence that such a bridge is permitted or drawing-compatible.
2. A native Google map needs an implementation of the separate
   `DrawEngineAdapter<Context, Document, Command>` design port plus translation to
   GeoKit GeoJSON, stable IDs, public lifecycle events, edit/delete/move and
   irrigation semantics. That is a larger optional package, not part of this
   basemap shim. Do not advertise native Google drawing until parity is proven.

## Authentication and spend decision

Browser Maps SDK credentials are observable. Moving them from an HTML attribute
into a JavaScript property, an environment variable bundled at build time, or a
proxy-delivered bootstrap response does not make them secret.

- Prefer approved server-side APIs behind a narrow authenticated gateway where
  supported. Keep private credentials server-side, constrain requests, enforce
  quotas and redact logs. A gateway cannot hide a browser SDK key while that SDK
  still requires it in the browser, nor can it bypass usage/display terms.
- A browser SDK deployment is an explicitly approved exception: separate
  application/environment keys, website-origin and API restrictions, usage
  monitoring, quota controls, billing alerts, documented ownership and revocation.
  Budget alerts alone are not a hard spending cap. Never use server/signing keys
  in the client and never provision a paid account as part of a default install.
- State key requirements as `required`, offline support conservatively as
  `unsupported` unless the exact licensed product allows and implements it.
  Attribution cannot be hidden by GeoKit theme configuration.
- Keep user geometry independent of vendor objects and IDs. Round-trip fixtures
  through the existing GeoJSON import/export pipeline. Switching back to OSM or
  custom tiles must not lose user features or depend on a paid account.

## Executable promotion checklist

The implementation owner can start in the optional package without changing the
new core basemap method:

1. Select exact Google product and supported SDK/version; review licensing,
   attribution/display and storage restrictions. Decide bridge versus native
   renderer; record why existing drawing is supported or not.
2. Obtain explicit provisioning and billing approval before live calls. Until then,
   use contract fixtures with no credentials and no vendor requests.
3. Implement fresh layer creation and cleanup for the bridge path. Mark native
   rendering/drawing unavailable unless the separate draw port passes parity.
4. Run GeoKit's provider unit/Chromium tests plus adapter-owned browser tests for
   repeated mount/remove, auth denial, quota exhaustion, network loss, restoration
   to OSM, attribution, resize/pan/zoom and read-only operation.
5. Verify exports preserve user GeoJSON/IDs; exported files and diagnostics contain
   no keys, session tokens, SDK objects or paid-vendor-only identifiers.
6. Approve cost and security controls independently of technical feasibility. Ship
   optional documentation and separate dependency entrypoint; no core dependency,
   default switch or auto paid fallback.

Source: [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices).
This spike is not a vendor-term approval or a claim of live Google validation.
