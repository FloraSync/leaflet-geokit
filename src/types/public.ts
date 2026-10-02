import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LogLevel } from "@src/utils/logger";
import type { StatusEventDetail } from "@src/types/events";
import type {
  GeoJSONExportAdapter,
  GeoJSONExportOptions,
  GeoJSONImportBehavior,
  GeoJSONImportOptions,
} from "@src/utils/geojson";
import type * as Leaflet from "leaflet";
import type { MapLayer, LayerStyle, LayerCakeSession, LayerCakeSessionUpdate } from "@src/types/layers";
export * from "@src/types/layers";
import type { BasemapAdapter, ProviderDiagnostics } from "@src/lib/providers";

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

export type SnapMode = "vertex" | "edge" | "grid" | "guide";

/** Opt-in drawing/editing snapping. All distances are screen-space pixels. */
export interface SnappingOptions {
  enabled?: boolean;
  modes?: SnapMode[];
  /** Maximum screen-space distance for a candidate to win. Defaults to 12px. */
  tolerancePx?: number;
  /**
   * Physical WGS84 grid spacing in meters. Required when grid mode is enabled.
   * Nodes are stable relative to gridOrigin and use the ellipsoidal meridian
   * scale for latitude and the local parallel scale for longitude.
   */
  gridSizeMeters?: number;
  /**
   * Fixed grid anchor as [longitude, latitude]. Defaults to [0, 0].
   * Grid snapping is supported for WGS84 latitudes inside ±89.9°; it is a
   * local editing aid, not antimeridian/polar survey or CRS transformation.
   */
  gridOrigin?: [number, number];
}

/** Controls the lightweight live draw/edit measurement overlay. */
export interface MeasurementOverlayOptions {
  enabled?: boolean;
  showLength?: boolean;
  showPerimeter?: boolean;
  showArea?: boolean;
  maximumFractionDigits?: number;
  autoScale?: boolean;
}

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
  | "layerStyle"
  | "save";

export type ToolCapabilityState = "enabled" | "disabled" | "unavailable";
export type ToolRequirementReason =
  | "not_ready" | "read_only" | "missing_attribute" | "unavailable_plugin"
  | "empty_selection" | "no_editable_layers" | "missing_provider"
  | "missing_api_key" | "runtime_error" | "configured_disabled";

export interface ToolCapabilityReason {
  code: ToolRequirementReason;
  message: string;
  requirement?: string;
}

export interface ToolCapability {
  tool: ToolButtonName;
  state: ToolCapabilityState;
  reason: ToolCapabilityReason | null;
  active: boolean;
  /** Configured toolbar groups containing this tool, not caller-supplied command groups. */
  groupIds: string[];
  /** Actual built-in activation shortcut; null means no shortcut is registered. */
  hotkey: string | null;
  commands: { activate: boolean; deactivate: boolean };
  /** UI-only disabled config does not block imperative activation. Runtime failures may be retried. */
  commandEnabled: boolean;
  behavior: "draw" | "mode" | "action" | "deactivate";
}

export interface ToolProviderCapability {
  requested: string;
  active: string;
  state: ToolCapabilityState;
  reason: ToolCapabilityReason | null;
}

/** Detached snapshot; also the detail of tool-capabilities-changed. No credentials. */
export interface ToolCapabilities {
  tools: Record<ToolButtonName, ToolCapability>;
  provider: ToolProviderCapability;
  selectedFeatureIds: string[];
}

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
  /** Disable managed toolbar buttons, not the imperative tool API. */
  disabled?: boolean;
  /** Optional host prerequisites; built-in local tools need neither provider nor selection. */
  requirements?: { selection?: boolean; provider?: boolean };
  /** Decorative badge text; include meaningful counts in ariaLabel too. */
  badge?: string;
  /** Visible hover/focus tooltip; defaults to the accessible label. */
  tooltip?: string;
}

export type ToolButtonConfig = Partial<
  Record<ToolButtonName, ToolButtonStyleConfig>
>;

export type ToolToolbarPosition =
  "topleft" | "topright" | "bottomleft" | "bottomright" | ToolToolbarZone;

export type ToolToolbarZone =
  "top-start" | "top-end" | "bottom-start" | "bottom-end" | "center-end";

export interface ToolToolbarPlacement {
  position?: ToolToolbarPosition;
  orientation?: "vertical" | "horizontal";
  order?: number;
  overflow?: "wrap" | "scroll";
  offset?: MarkerIconPoint;
}

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
  /** Defaults to vertical. CSS may override the visual direction. */
  orientation?: "vertical" | "horizontal";
  /** Nonnegative button gap in pixels. Defaults to 6; CSS may override it. */
  gap?: number;
  /** Opt in to bounded zones; responsive uses a bottom sheet below 600px map width. */
  preset?: "zones" | "responsive";
  /** Numeric stacking order inside a zone; CSS --geokit-toolbar-order wins. */
  order?: number;
  /** Wrap tools or keep a scrollable single row/column. Defaults to wrap. */
  overflow?: "wrap" | "scroll";
  /** Map-width breakpoint and narrow placement overrides (also enables zones). */
  responsive?: ToolToolbarPlacement & { breakpoint?: number };
  /**
   * Hide the built-in Leaflet.draw/ruler toolbars while this custom group is present.
   * Defaults to true so custom buttons are the only visible map tool chrome.
   */
  hideDefaultToolbar?: boolean;
}

export interface ToolTriggerOptions {
  /** Source label included in public trigger events. */
  source?: "api" | "event" | "toolbar" | "leaflet-toolbar" | string;
  /** Toolbar group id when triggered from a configured toolbar group. */
  groupId?: string;
  /** Optional caller-supplied correlation id. GeoKit generates one when omitted. */
  commandId?: string;
}

export type ToolCommandAction = "activate" | "deactivate";

/**
 * Detail accepted by the public `leaflet-geokit:tool-command` event.
 * `action` defaults to `activate`; `deactivate` returns the map to select mode.
 */
export interface ToolCommandEventDetail extends ToolTriggerOptions {
  tool: ToolButtonName;
  action?: ToolCommandAction;
}

export type ToolLifecycleEventName =
  | "leaflet-geokit:tool-command"
  | "leaflet-geokit:tool-commanded"
  | "leaflet-geokit:tool-started"
  | "leaflet-geokit:tool-completed"
  | "leaflet-geokit:tool-cancelled"
  | "leaflet-geokit:tool-failed"
  | "leaflet-geokit:tool-state-changed";

/**
 * Correlated payload shared by every public tool lifecycle event.
 * Empty featureIds and omitted geometry/reason mean those fields are not
 * relevant to that lifecycle transition.
 */
export interface ToolEventDetail {
  tool: ToolButtonName;
  action: ToolCommandAction;
  source: string;
  groupId?: string;
  commandId: string;
  previousTool: ToolButtonName | null;
  activeTool: ToolButtonName | null;
  featureIds: string[];
  geometry?: Feature | FeatureCollection;
  reason?: string;
  timestamp: number;
}

export interface ToolTriggerEventDetail extends ToolTriggerOptions {
  tool: ToolButtonName;
  handled: boolean;
  timestamp: number;
  error?: string;
}

export type IntegratedToolEventName =
  | ToolLifecycleEventName
  | "tool:polygon:created"
  | "tool:polyline:created"
  | "tool:rectangle:created"
  | "tool:circle:created"
  | "tool:marker:created"
  | "tool:layer-cake:session-started"
  | "tool:layer-cake:saved"
  | "tool:layer-cake:session-changed"
  | "tool:layer-cake:cancelled"
  | "tool:move:pending"
  | "tool:move:confirmed"
  | "tool:move:cancelled"
  | "tool:edit:applied"
  | "tool:delete:applied"
  | "tool:ruler:units-changed"
  | "tool:save";

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
  /** Opt-in screen-space snapping for drawing and vertex editing. */
  snapping?: SnappingOptions | null;
  /** Opt-in live length/area/perimeter feedback while drawing or editing. */
  measurementOverlay?: MeasurementOverlayOptions | null;

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

  /** Durable readiness/loading/error snapshot mirrored by `leaflet-geokit:status`. */
  readonly status: StatusEventDetail;

  // Methods
  /** Optional basemap bridge, applied after ready. Null restores attribute-configured tiles. */
  setBasemapAdapter(adapter: BasemapAdapter | null): void;
  getProviderDiagnostics(): ProviderDiagnostics | null;
  getLayers(): MapLayer[];
  setLayerVisibility(id: string, visible: boolean): Promise<void>;
  setLayerStyle(id: string, style: LayerStyle): Promise<void>;
  reorderLayers(ids: readonly string[]): Promise<void>;
  focusLayer(id: string): Promise<void>;
  removeLayer(id: string): Promise<void>;
  getLayerCakeSession(): LayerCakeSession | null;
  updateLayerCakeSession(update: LayerCakeSessionUpdate): Promise<void>;
  saveLayerCakeSession(): Promise<void>;
  cancelLayerCakeSession(): Promise<void>;
  getToolCapabilities(): ToolCapabilities;
  /** Supply host selection; unknown/deleted ids are excluded from capability snapshots. */
  setToolSelection(featureIds: readonly string[]): void;
  getGeoJSON(): Promise<FeatureCollection>;
  importGeoJSON(
    fc: FeatureCollection,
    options?: GeoJSONImportOptions,
  ): Promise<string[]>;
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
  loadGeoJSONFromUrl(
    url: string,
    options?: GeoJSONImportOptions,
  ): Promise<void>;
  loadGeoJSONFromText(
    text: string,
    options?: GeoJSONImportOptions,
  ): Promise<void>;
  /**
   * Emits 'leaflet-draw:export' with the current FeatureCollection.
   * Returns the exported FeatureCollection for convenience.
   */
  exportGeoJSON(options?: GeoJSONExportOptions): Promise<FeatureCollection>;

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
  /** Return the current screen-space snap configuration. */
  getSnappingOptions(): SnappingOptions | null;
  /** Return the current live measurement overlay configuration. */
  getMeasurementOverlayOptions(): MeasurementOverlayOptions | null;
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
export type {
  GeoJSONExportAdapter,
  GeoJSONExportOptions,
  GeoJSONImportBehavior,
  GeoJSONImportOptions,
};
