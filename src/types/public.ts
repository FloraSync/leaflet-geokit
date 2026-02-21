import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LogLevel } from "@src/utils/logger";
import type * as Leaflet from "leaflet";

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
  /** Use Canvas rendering instead of SVG for better performance with large datasets. Default: true */
  preferCanvas?: boolean;
  /**
   * If true, attempt to use an externally provided Leaflet/Leaflet.draw instead of bundled imports.
   * When enabled, MapController will validate the presence of window.L and Draw APIs; if absent, it may fall back to bundled.
   */
  useExternalLeaflet?: boolean;
  /**
   * If true, skip injecting Leaflet/Draw CSS and default icon wiring (host is responsible).
   * Ignored when useExternalLeaflet is false (bundled path still injects by default).
   */
  skipLeafletStyles?: boolean;
}

export type MeasurementSystem = "metric" | "imperial";

/**
 * Draw controls toggles (presence = true on the element).
 */
export interface DrawControlsConfig {
  polygon?: boolean;
  polyline?: boolean;
  rectangle?: boolean;
  circle?: boolean;
  /** Draw a Layer Cake base circle + manager to create concentric donut polygons. */
  cake?: boolean;
  marker?: boolean;
  /** Move/translate existing features. */
  move?: boolean;
  edit?: boolean;
  delete?: boolean;
  ruler?: boolean;
}

/**
 * Configuration for tile provider selection and styling
 */
export interface TileProviderConfig {
  /** Tile provider identifier (e.g., "osm", "here") */
  provider: "osm" | "here" | string;

  /** Provider-specific style (e.g., "lite.day" for HERE) */
  style?: string;

  /** API key for authenticated providers */
  apiKey?: string;

  /** Optional override for tile attribution text */
  attribution?: string;
}

/**
 * Tile layer configuration with URL template and provider settings
 */
export interface TileURLTemplate {
  /** Leaflet tile URL template (e.g., "https://{s}.domain.com/{z}/{x}/{y}.png") */
  urlTemplate: string;

  /** Attribution text displayed on the map */
  attribution: string;

  /** Maximum zoom level supported */
  maxZoom?: number;

  /** Tile subdomains for load balancing */
  subdomains?: string[];
}

/**
 * Event detail for tile provider errors
 */
export interface TileProviderErrorDetail {
  /** Error code identifying the failure type */
  code:
    | "missing_api_key"
    | "invalid_api_key"
    | "tile_load_failed"
    | "unknown_provider";

  /** Human-readable error message */
  message: string;

  /** Provider identifier where the error occurred */
  provider: string;

  /** Unix timestamp when error occurred */
  timestamp: number;
}

/**
 * Event detail for successful tile provider changes
 */
export interface TileProviderChangedDetail {
  /** New active provider */
  provider: string;

  /** New active style (if applicable) */
  style?: string;

  /** Previously active provider */
  previousProvider: string;

  /** Unix timestamp when change occurred */
  timestamp: number;
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
  themeCss: string;
  /** Prefer external Leaflet/Draw if available (falls back to bundled if missing). */
  useExternalLeaflet?: boolean;
  /** Disable our CSS/icon injection when host supplies styles. */
  skipLeafletStyles?: boolean;

  /** Optional injection of a pre-existing Leaflet namespace to use instead of bundled import. */
  leafletInstance?: typeof Leaflet;

  /** Tile provider identifier (e.g., "osm", "here") */
  tileProvider?: "osm" | "here" | string;

  /** Provider-specific style (e.g., "lite.day" for HERE) */
  tileStyle?: string;

  /** API key for authenticated providers */
  apiKey?: string;

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

  /**
   * Merge all visible polygon layers into a single polygon.
   * This removes the original polygon features and adds a new merged feature.
   * @param options Optional configuration for the merge operation
   * @returns Promise resolving to the ID of the newly created merged feature, or null if no polygons to merge
   */
  mergePolygons(options?: {
    /** Properties to apply to the merged feature (defaults to properties from first polygon) */
    properties?: Record<string, any>;
  }): Promise<string | null>;

  /**
   * Change the measurement system for the Leaflet ruler tool.
   */
  setMeasurementUnits(system: MeasurementSystem): Promise<void>;
}

// Re-exports for consumers
export type { Feature, FeatureCollection, Geometry };
