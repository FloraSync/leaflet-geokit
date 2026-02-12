# Preact shims

These shims provide lightweight Preact wrappers around the [`<leaflet-geokit>`](../../src/components/LeafletDrawMapElement.ts:17) custom element.

There are **two entrypoints**:

- External/additive wrapper (host already loads Leaflet/Draw): [`@florasync/leaflet-geokit/preact`](../../package.json:9)
- Bundled/self-provisioned wrapper (package provides Leaflet/Draw): [`@florasync/leaflet-geokit/preact-bundled`](../../package.json:9)

## Install

```bash
npm install @florasync/leaflet-geokit preact
```

`preact` is a consumer-provided peer dependency for these wrappers.

## Import

External/additive mode:

```ts
import { PreactLeafletGeoKit } from "@florasync/leaflet-geokit/preact";
```

Bundled/self-provisioned mode:

```ts
import { PreactLeafletGeoKit } from "@florasync/leaflet-geokit/preact-bundled";
```

## Quick start

```tsx
import { PreactLeafletGeoKit } from "@florasync/leaflet-geokit/preact";

export function MapEditor() {
  return (
    <PreactLeafletGeoKit
      style={{ width: "100%", height: "420px" }}
      attributes={{
        latitude: 39.7392,
        longitude: -104.9903,
        zoom: 11,
        "draw-polygon": true,
        "draw-rectangle": true,
        "edit-features": true,
      }}
      onChangeText={(text) => {
        console.log(text);
      }}
      onError={(error) => console.error(error)}
    />
  );
}
```

## Choosing an entrypoint

- Use [`@florasync/leaflet-geokit/preact`](../../package.json:9) when your app already owns Leaflet + Leaflet.draw runtime and CSS.
- Use [`@florasync/leaflet-geokit/preact-bundled`](../../package.json:9) when you want this package to provide Leaflet + Leaflet.draw.

## External Leaflet behavior (`/preact`)

By default, the wrapper mounts in external/additive mode:

- Sets `use-external-leaflet`
- Sets `skip-leaflet-styles`

So your app should load Leaflet + Leaflet.draw assets beforehand.

If needed, provide an explicit namespace via `leafletInstance`.

## Bundled behavior (`/preact-bundled`)

By default, the bundled wrapper does **not** set external/additive flags.

- Does not set `use-external-leaflet`
- Does not set `skip-leaflet-styles`

This is the simplest path for apps that do not preload Leaflet.

## Props (both wrappers)

- `attributes`: map of attributes forwarded to `<leaflet-geokit>`
- `externalLeaflet`: optional override of default wrapper mode (`/preact` defaults `true`, `/preact-bundled` defaults `false`)
- `leafletInstance`: explicit Leaflet namespace (`window.L` equivalent)
- `initialGeoJSONText`: loaded once after `leaflet-draw:ready`
- `onChangeText`: receives serialized GeoJSON after create/edit/delete/merge
- `onChangeGeoJSON`: receives parsed FeatureCollection object
- `onReady`: receives the underlying custom element
- `onError`: receives normalized `Error` objects

## Notes

- Ensure the element has a fixed height.
- For strict ownership by host styles, keep `externalLeaflet` enabled and provide CSS from your app.
- Preact wrapper entrypoints do not bundle Preact runtime code; your app provides the Preact runtime.
