import { LeafletDrawMapElement } from "@src/components/LeafletDrawMapElement";

const CANONICAL_TAG_NAME = "leaflet-geokit";
if (!customElements.get(CANONICAL_TAG_NAME)) {
  customElements.define(CANONICAL_TAG_NAME, LeafletDrawMapElement);
}

const LEGACY_TAG_NAME = "leaflet-draw-map";
if (!customElements.get(LEGACY_TAG_NAME)) {
  class LeafletDrawMapElementLegacy extends LeafletDrawMapElement {}
  customElements.define(LEGACY_TAG_NAME, LeafletDrawMapElementLegacy);
}

export { LeafletDrawMapElement };
export * from "@src/types/public";
export * from "@src/types/events";
export * from "@src/utils/geojson-pipeline";
export * from "@src/lib/providers";

export {
  GROWER_PRESETS,
  boundingBoxGeoJSON,
  bufferGeoJSON,
  centroidGeoJSON,
  createBedWidthGuides,
  createIrrigationZones,
  createRowSpacingGuides,
  formatMeasurements,
  measureGeoJSON,
  mergeGeoJSON,
  simplifyGeoJSON,
  splitGeoJSON,
} from "@src/utils/grower-geometry";
export type {
  AreaUnit,
  BufferedGeoJSON,
  DistanceUnit,
  FormattedGeoJSONMeasurements,
  FormattedQuantity,
  GeoJSONMeasurements,
  GrowerGeometryError,
  GrowerGeometryErrorCode,
  GrowerGeometryResult,
  IrrigationZoneOptions,
  MeasurementFormatOptions,
  RowSpacingGuideOptions,
  SimplifyGeoJSONOptions,
  SplitterGeometry,
  SupportedGeoJSON,
} from "@src/utils/grower-geometry";
export { findSnap } from "@src/lib/snapping";
export type { SnapLatLng, SnapResult, SnapScreenPoint, SnapTarget } from "@src/lib/snapping";
