# Snapping and live measurements

Snapping is opt-in and does not change existing maps. Set the web component
property before or after connection:

```ts
map.snapping = {
  enabled: true,
  modes: ["vertex", "edge", "grid", "guide"],
  tolerancePx: 12,
  gridSizeMeters: 1,
  gridOrigin: [0, 0], // [longitude, latitude]
};
map.measurementOverlay = { enabled: true, autoScale: true };
```

Candidates are compared in rendered screen pixels, which keeps the tolerance
consistent across zoom levels and desktop/touch input. `gridSizeMeters` is a
physical WGS84 spacing. Grid nodes are stable relative to the fixed
`gridOrigin` (`[longitude, latitude]`, default `[0, 0]`): latitude is
quantized by ellipsoidal meridian distance, while longitude uses the WGS84
parallel scale at the snapped latitude. This keeps adjacent nodes one meter
apart at realistic latitudes, including 45°, rather than treating longitude
degrees as latitude degrees.

Grid coordinates must remain in WGS84 longitude/latitude ranges, and grid
snapping is available inside ±89.9° latitude. The default origin is not moved
to the pointer, so repeated calls produce the same node. Antimeridian wrapping,
polar coordinates, CRS reprojection, and survey/machine-control accuracy are
outside this contract; use a local origin and a suitable cell size for
ordinary editing and planning.

Visible registered layers are the only guide sources. Hidden, measurement, and
currently edited features are excluded. A small marker and status label
identify the active snap. All listeners and feedback layers are removed on
cancellation, reconfiguration, and destroy.

The measurement overlay uses the same `measurementSystem` state as the ruler.
`setMeasurementUnits("metric" | "imperial")` refreshes an active overlay while
retaining the existing ruler behavior. Length, perimeter, and area are derived
with the exported grower measurement helpers and update while a shape is drawn
or a vertex is dragged.
