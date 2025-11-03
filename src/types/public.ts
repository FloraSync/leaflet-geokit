import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LogLevel } from "@src/utils/logger";

/**
 * Basic map configuration derived from element attributes.
 */
export interface MapConfig {
  latitude: number;
  longitude: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  tileUrl: string;
  tileAttribution?: string;
  readOnly?: boolean;
  fitToDataOnLoad?: boolean;
  logLevel?: LogLevel;
  devOverlay?: boolean;
  polygonAllowIntersection?: boolean;
}

/**
 * Draw controls toggles (presence = true on the element).
 */
export interface DrawControlsConfig {
  polygon?: boolean;
  polyline?: boolean;
  rectangle?: boolean;
  circle?: boolean;
  marker?: boolean;
  edit?: boolean;
  delete?: boolean;
}

/**
 * Public API that the custom element exposes (methods/properties).
 * This is provided for typing in TS consumers who may cast the element.
 */
export interface LeafletDrawMapElementAPI {
  // Properties (reflect attributes)
  latitude: number;
  longitude: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  tileUrl: string;
  tileAttribution?: string;
  readOnly: boolean;
  logLevel: LogLevel;
  devOverlay: boolean;

  // Methods
  getGeoJSON(): Promise<FeatureCollection>;
  loadGeoJSON(fc: FeatureCollection): Promise<void>;
  clearLayers(): Promise<void>;
  addFeatures(fc: FeatureCollection): Promise<string[]>;
  updateFeature(id: string, feature: Feature): Promise<void>;
  removeFeature(id: string): Promise<void>;
  fitBoundsToData(padding?: number): Promise<void>;
  /**
   * Fit the map view to an arbitrary bounds tuple [[south, west], [north, east]].
   * Optional padding is a ratio of the bounds size (e.g., 0.05 for 5%).
   */
  fitBounds(
    bounds: [[number, number], [number, number]],
    padding?: number,
  ): Promise<void>;
  setView(lat: number, lng: number, zoom?: number): Promise<void>;

  // Convenience methods
  loadGeoJSONFromUrl(url: string): Promise<void>;
  loadGeoJSONFromText(text: string): Promise<void>;
  /**
   * Emits 'leaflet-draw:export' with the current FeatureCollection.
   * Returns the exported FeatureCollection for convenience.
   */
  exportGeoJSON(): Promise<FeatureCollection>;
}

// Re-exports for consumers
export type { Feature, FeatureCollection, Geometry };
