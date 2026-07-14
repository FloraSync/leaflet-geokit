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

export type MarkerIconPoint = [number, number];

export interface MarkerIconConfig {
  /** Required to activate a custom marker icon. Absolute, relative, data:, or blob: URL. */
  iconUrl: string;
  /** Optional high-DPI image URL. Falls back to iconUrl when omitted or invalid. */
  iconRetinaUrl?: string;
  /** Optional marker shadow image URL. Shadow is dropped when omitted or invalid. */
  shadowUrl?: string;
  /** Icon image size in CSS pixels: [width, height]. Defaults to [25, 41]. */
  iconSize?: MarkerIconPoint;
  /** Pixel coordinate in the icon image anchored to the map point: [x, y]. Defaults to [12, 41]. */
  iconAnchor?: MarkerIconPoint;
  /** Popup anchor relative to iconAnchor: [x, y]. Defaults to [1, -34]. */
  popupAnchor?: MarkerIconPoint;
}

export type ToolButtonName =
  | "polygon"
  | "polyline"
  | "rectangle"
  | "circle"
  | "marker"
  | "layerCake"
  | "move"
  | "select"
  | "edit"
  | "delete"
  | "ruler"
  | "measurementSettings"
  | "layerStyle";

export interface ToolButtonRenderContext {
  tool: ToolButtonName;
  groupId?: string;
  button: HTMLElement;
}

export type ToolIconRenderer = (
  context: ToolButtonRenderContext,
) => HTMLElement | SVGElement | string | null | undefined;

export interface ToolPopoverRenderContext extends ToolButtonRenderContext {
  popover: HTMLElement;
}

export interface ToolPopoverConfig {
  /** Heading text rendered at the top of the popover. */
  title?: string;
  /** Plain body copy for point-of-action guidance. */
  body?: string;
  /** Trusted host-supplied HTML content. Use only with sanitized/static content. */
  html?: string;
  /** Accessible label for the popover dialog. Falls back to title. */
  ariaLabel?: string;
  /** Custom renderer for framework-owned popover content. */
  render?: (
    context: ToolPopoverRenderContext,
  ) => HTMLElement | DocumentFragment | string | null | undefined;
  /** Called after the popover is attached. */
  onOpen?: (context: ToolPopoverRenderContext) => void;
  /** Called after the popover is closed. */
  onClose?: (context: ToolPopoverRenderContext) => void;
}

export interface ToolButtonStyleConfig {
  /** URL for the icon rendered inside the Leaflet control button. */
  iconUrl?: string;
  /** Trusted inline SVG/HTML icon markup rendered inside the button. */
  iconHtml?: string;
  /** Programmatic icon renderer for framework-owned controls. */
  renderIcon?: ToolIconRenderer;
  /** Icon box size in CSS pixels. Defaults to [18, 18]. */
  iconSize?: MarkerIconPoint;
  /** Tooltip/title text for the button. */
  title?: string;
  /** Accessible label. Falls back to title when omitted. */
  ariaLabel?: string;
  /** Extra class name(s) added to the button for host theme CSS. */
  className?: string;
  /** Optional point-of-action guidance shown when the button is used. */
  popover?: ToolPopoverConfig;
}

export type ToolButtonConfig = Partial<
  Record<ToolButtonName, ToolButtonStyleConfig>
>;

export type ToolToolbarPosition =
  | "topleft"
  | "topright"
  | "bottomleft"
  | "bottomright";

export interface ToolToolbarGroupConfig {
  /** Stable group id used in events and DOM data attributes. */
  id: string;
  /** Tools rendered in this group, in order. */
  tools: ToolButtonName[];
  /** Leaflet-like map corner placement. Defaults to "topright". */
  position?: ToolToolbarPosition;
  /** Accessible toolbar label. */
  ariaLabel?: string;
  /** Extra class name(s) added to the toolbar group container. */
  className?: string;
  /** Pixel offset from the chosen map corner. Defaults to [10, 10]. */
  offset?: MarkerIconPoint;
}

export interface ToolTriggerOptions {
  /** Source label included in public trigger events. */
  source?: "api" | "event" | "toolbar" | "leaflet-toolbar" | string;
  /** Toolbar group id when triggered from a configured toolbar group. */
  groupId?: string;
}

export interface ToolTriggerEventDetail extends ToolTriggerOptions {
  tool: ToolButtonName;
  handled: boolean;
  timestamp: number;
  error?: string;
}

export type IntegratedToolEventName =
  | "tool:polygon:created"
  | "tool:polyline:created"
  | "tool:rectangle:created"
  | "tool:circle:created"
  | "tool:marker:created"
  | "tool:layer-cake:session-started"
  | "tool:layer-cake:saved"
  | "tool:move:pending"
  | "tool:move:confirmed"
  | "tool:move:cancelled"
  | "tool:edit:applied"
  | "tool:delete:applied"
  | "tool:ruler:units-changed";

export type IntegratedToolHooks = Partial<
  Record<IntegratedToolEventName, (detail: unknown) => void>
>;

export interface IntegratedToolEventEmitter {
  emit?: (eventName: IntegratedToolEventName, detail: unknown) => void;
  dispatchEvent?: (event: Event) => boolean;
}

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
    | "permission_denied"
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
  /**
   * Programmatic marker icon override.
   * `undefined` falls back to marker icon attributes, `null` forces default markers.
   */
  markerIconConfig?: MarkerIconConfig | null;
  /**
   * Per-tool button customization for Leaflet.draw/ruler controls.
   * `undefined` falls back to the `tool-button-config` attribute, `null` clears custom button config.
   */
  toolButtonConfig?: ToolButtonConfig | null;
  /**
   * Additional toolbar groups rendered over the map.
   * `undefined` falls back to the `toolbar-groups` attribute, `null` clears custom groups.
   */
  toolbarGroups?: ToolToolbarGroupConfig[] | null;

  /** Optional injection of a pre-existing Leaflet namespace to use instead of bundled import. */
  leafletInstance?: typeof Leaflet;
  /** Optional per-tool hooks keyed by integrated tool event name. */
  toolHooks?: IntegratedToolHooks;
  /** Optional emitter for integrated tool events. */
  toolEventEmitter?: IntegratedToolEventEmitter;

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
  /**
   * Programmatically activate a map tool through the public web component API.
   */
  activateTool(
    tool: ToolButtonName,
    options?: ToolTriggerOptions,
  ): Promise<boolean>;

  /**
   * Back-compat alias for activateTool.
   */
  triggerTool(
    tool: ToolButtonName,
    options?: ToolTriggerOptions,
  ): Promise<boolean>;

  /**
   * Deactivate the active draw/edit tool and return the map to select mode.
   */
  deactivateTool(options?: ToolTriggerOptions): Promise<boolean>;
}

// Re-exports for consumers
export type { Feature, FeatureCollection, Geometry };
