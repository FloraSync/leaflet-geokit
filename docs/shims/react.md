# React shims

These shims provide React wrappers around the [`<leaflet-geokit>`](../../src/components/LeafletDrawMapElement.ts:17) custom element.

There are **two entrypoints**:

- External/additive wrapper (host already loads Leaflet/Draw): [`@florasync/leaflet-geokit/react`](../../package.json:9)
- Bundled/self-provisioned wrapper (package provides Leaflet/Draw): [`@florasync/leaflet-geokit/react-bundled`](../../package.json:9)

## Install

```bash
npm install @florasync/leaflet-geokit react react-dom
```

`react` and `react-dom` are consumer-provided peer dependencies for these wrappers.

## Import

External/additive mode:

```ts
import { ReactLeafletGeoKit } from "@florasync/leaflet-geokit/react";
```

Bundled/self-provisioned mode:

```ts
import { ReactLeafletGeoKit } from "@florasync/leaflet-geokit/react-bundled";
```

## Quick start

```tsx
import { ReactLeafletGeoKit } from "@florasync/leaflet-geokit/react";

export function MapEditor() {
  return (
    <ReactLeafletGeoKit
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

- Use [`@florasync/leaflet-geokit/react`](../../package.json:9) when your app already owns Leaflet + Leaflet.draw runtime and CSS.
- Use [`@florasync/leaflet-geokit/react-bundled`](../../package.json:9) when you want this package to provide Leaflet + Leaflet.draw.

## External Leaflet behavior (`/react`)

By default, the wrapper mounts in external/additive mode:

- Sets `use-external-leaflet`
- Sets `skip-leaflet-styles`

So your app should load Leaflet + Leaflet.draw assets beforehand.

If needed, provide an explicit namespace via `leafletInstance`.

## Bundled behavior (`/react-bundled`)

By default, the bundled wrapper does **not** set external/additive flags.

- Does not set `use-external-leaflet`
- Does not set `skip-leaflet-styles`

This is the simplest path for apps that do not preload Leaflet.

## Props (both wrappers)

- `attributes`: map of attributes forwarded to `<leaflet-geokit>`
- `externalLeaflet`: optional override of default wrapper mode (`/react` defaults `true`, `/react-bundled` defaults `false`)
- `leafletInstance`: explicit Leaflet namespace (`window.L` equivalent)
- `initialGeoJSONText`: loaded once after `leaflet-draw:ready`
- `onChangeText`: receives serialized GeoJSON after create/edit/delete/merge
- `onChangeGeoJSON`: receives parsed FeatureCollection object
- `onReady`: receives the underlying custom element
- `onError`: receives normalized `Error` objects

## Notes

- Ensure the element has a fixed height.
- For strict ownership by host styles, keep `externalLeaflet` enabled and provide CSS from your app.
- React wrapper entrypoints do not bundle React runtime code; your app provides the React runtime.
