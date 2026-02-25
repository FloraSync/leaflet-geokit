import type { Feature, FeatureCollection } from "geojson";
import type {
  LeafletDrawMapElementAPI,
  MapConfig,
  DrawControlsConfig,
  MeasurementSystem,
  TileProviderErrorDetail,
} from "@src/types/public";
import { createLogger, type Logger, type LogLevel } from "@src/utils/logger";
import { applyLeafletStylingIfNeeded } from "@src/lib/leaflet-assets";
import { MapController } from "@src/lib/MapController";
import {
  buildTileURL,
  type TileProviderConfig,
  type TileURLTemplate,
  validateProviderConfig,
} from "@src/lib/TileProviderFactory";
import type * as LeafletNS from "leaflet";

export class LeafletDrawMapElement
  extends HTMLElement
  implements LeafletDrawMapElementAPI
{
  // Shadow DOM and container references
  private _root: ShadowRoot;
  private _container: HTMLDivElement;

  // Logging
  private _logger: Logger = createLogger("component:leaflet-geokit", "debug");

  // Internal state mirrors for attributes/properties
  private _latitude = 0;
  private _longitude = 0;
  private _zoom = 2;
  private _minZoom?: number;
  private _maxZoom?: number;
  private _tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  private _tileAttribution?: string;
  private _tileProvider?: string;
  private _tileStyle?: string;
  private _apiKey?: string;
  private _activeTileProvider = "tile-url";
  private _readOnly = false;
  private _logLevel: LogLevel = "debug";
  private _devOverlay = false;
  private _polygonAllowIntersection = false;
  private _preferCanvas = true; // Default to Canvas for performance

  // Theming
  private _themeUrl?: string;
  private _themeCss = "";
  private _themeLinkEl: HTMLLinkElement | null = null;
  private _themeStyleEl: HTMLStyleElement | null = null;

  // Controller
  private _controller: MapController | null = null;

  // External Leaflet configuration
  private _useExternalLeaflet = false;
  private _skipLeafletStyles = false;
  private _leafletInstance: typeof LeafletNS | undefined;

  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });

    // Basic internal styles and map container; real CSS injection will be added in controller milestone
    this._root.innerHTML = `
      <style>
        :host {
          display: block;
          contain: content;
        }
        .map-container {
          width: 100%;
          height: 100%;
          position: relative;
        }
      </style>
      <div class="map-container" part="map"></div>
    `;

    const container = this._root.querySelector(".map-container");
    if (!(container instanceof HTMLDivElement)) {
      throw new Error("Failed to initialize map container");
    }
    this._container = container;

    // Initialize logger level from attribute if present
    const ll = this.getAttribute("log-level") as LogLevel | null;
    if (ll) {
      this._logLevel = ll;
      this._logger.setLevel(ll);
    }
  }

  // Build DrawControlsConfig from boolean attributes
  private _controlsFromAttributes(): DrawControlsConfig {
    return {
      polygon: this.hasAttribute("draw-polygon"),
      polyline: this.hasAttribute("draw-polyline"),
      rectangle: this.hasAttribute("draw-rectangle"),
      circle: this.hasAttribute("draw-circle"),
      cake: this.hasAttribute("draw-layer-cake"),
      marker: this.hasAttribute("draw-marker"),
      move: this.hasAttribute("draw-move"),
      edit: this.hasAttribute("edit-features"),
      delete: this.hasAttribute("delete-features"),
      ruler: this.hasAttribute("draw-ruler"),
    };
  }

  private _mapConfig(): MapConfig {
    return {
      latitude: this._latitude,
      longitude: this._longitude,
      zoom: this._zoom,
      minZoom: this._minZoom,
      maxZoom: this._maxZoom,
      tileUrl: this._tileUrl,
      tileAttribution: this._tileAttribution,
      readOnly: this._readOnly,
      fitToDataOnLoad: false,
      logLevel: this._logLevel,
      devOverlay: this._devOverlay,
      polygonAllowIntersection: this._polygonAllowIntersection,
      preferCanvas: this._preferCanvas,
      useExternalLeaflet: this._useExternalLeaflet,
      skipLeafletStyles: this._skipLeafletStyles,
    };
  }

  // Lifecycle
  async connectedCallback(): Promise<void> {
    this._logger.debug("connectedCallback", this._currentConfig());
    // Inject Leaflet CSS/icons unless skipped
    applyLeafletStylingIfNeeded({
      root: this._root,
      skipStyles: this._skipLeafletStyles,
    });

    this._applyThemeStyles();

    // Initialize controller
    this._controller = new MapController({
      container: this._container,
      map: this._mapConfig(),
      controls: this._controlsFromAttributes(),
      readOnly: this._readOnly,
      logger: this._logger.child("controller"),
      callbacks: {
        onReady: (detail) => {
          this.dispatchEvent(new CustomEvent("leaflet-draw:ready", { detail }));
        },
        onCreated: (detail) => {
          this.dispatchEvent(
            new CustomEvent("leaflet-draw:created", { detail }),
          );
        },
        onEdited: (detail) => {
          this.dispatchEvent(
            new CustomEvent("leaflet-draw:edited", { detail }),
          );
        },
        onDeleted: (detail) => {
          this.dispatchEvent(
            new CustomEvent("leaflet-draw:deleted", { detail }),
          );
        },
        onError: (detail) => {
          this.dispatchEvent(new CustomEvent("leaflet-draw:error", { detail }));
        },
      },
      leaflet: this._leafletInstance ?? undefined,
      useExternalLeaflet: this._useExternalLeaflet,
    });

    await this._controller.init();

    if (this._tileProvider) {
      this._updateTileLayer();
    }
  }

  async disconnectedCallback(): Promise<void> {
    this._logger.debug("disconnectedCallback");
    if (this._controller) {
      await this._controller.destroy();
      this._controller = null;
    }
  }
  // Observed attributes and reflection
  static get observedAttributes(): string[] {
    return [
      "latitude",
      "longitude",
      "zoom",
      "min-zoom",
      "max-zoom",
      "tile-url",
      "tile-attribution",
      "tile-provider",
      "tile-style",
      "api-key",
      "here-api-key",
      "read-only",
      "log-level",
      "dev-overlay",
      "prefer-canvas",
      "use-external-leaflet",
      "skip-leaflet-styles",
      "theme-url",
      // draw controls
      "draw-polygon",
      "draw-polyline",
      "draw-rectangle",
      "draw-circle",
      "draw-layer-cake",
      "draw-marker",
      "draw-move",
      "draw-ruler",
      "edit-features",
      "delete-features",
      "polygon-allow-intersection",
    ];
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    value: string | null,
  ): void {
    this._logger.debug("attributeChanged", { name, value });

    switch (name) {
      case "latitude":
        this._latitude = this._coerceNumber(value, 0);
        break;
      case "longitude":
        this._longitude = this._coerceNumber(value, 0);
        break;
      case "zoom":
        this._zoom = this._coerceNumber(value, 2);
        break;
      case "min-zoom":
        this._minZoom = value != null ? this._coerceNumber(value) : undefined;
        break;
      case "max-zoom":
        this._maxZoom = value != null ? this._coerceNumber(value) : undefined;
        break;
      case "tile-url":
        this._tileUrl =
          value ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        if (this._controller) {
          this._updateTileLayer();
        }
        break;
      case "tile-attribution":
        this._tileAttribution = value ?? undefined;
        if (this._controller) {
          this._updateTileLayer();
        }
        break;
      case "tile-provider":
        this._tileProvider = this._normalizeText(value, {
          lowercase: true,
        });
        if (this._controller) {
          this._updateTileLayer();
        }
        break;
      case "tile-style":
        this._tileStyle = this._normalizeText(value);
        if (this._controller) {
          this._updateTileLayer();
        }
        break;
      case "api-key":
      case "here-api-key":
        this._syncApiKeyFromAttributes();
        if (this._controller) {
          this._updateTileLayer();
        }
        break;
      case "theme-url":
        this._themeUrl = value ?? undefined;
        if (this.isConnected) {
          this._applyThemeStyles();
        }
        break;
      case "read-only":
        this._readOnly = value !== null;
        break;
      case "log-level":
        this._logLevel = (value as LogLevel) ?? this._logLevel;
        this._logger.setLevel(this._logLevel);
        break;
      case "dev-overlay":
        this._devOverlay = value !== null;
        break;
      case "polygon-allow-intersection":
        this._polygonAllowIntersection = value !== null;
        break;
      case "prefer-canvas":
        this._preferCanvas = value !== null;
        break;
      case "use-external-leaflet":
        this._useExternalLeaflet = value !== null;
        break;
      case "skip-leaflet-styles":
        this._skipLeafletStyles = value !== null;
        break;
      default:
        break;
    }

    // If controller exists, propagate relevant changes
    if (this._controller) {
      if (name === "latitude" || name === "longitude" || name === "zoom") {
        // Update view without full re-init
        void this._controller.setView(
          this._latitude,
          this._longitude,
          this._zoom,
        );
      } else if (
        name === "min-zoom" ||
        name === "max-zoom" ||
        name === "read-only" ||
        name === "dev-overlay" ||
        name === "log-level" ||
        name === "prefer-canvas" ||
        name === "use-external-leaflet" ||
        name === "skip-leaflet-styles" ||
        name.startsWith("draw-") ||
        name === "edit-features" ||
        name === "delete-features"
      ) {
        // For now, re-init controller to apply structural changes
        void this._controller.destroy().then(() => this._controller!.init());
      }
    }
  }

  private _updateTileLayer(): void {
    if (!this._controller) {
      return;
    }

    const maybeController = this._controller as MapController & {
      setTileLayer?: (
        config: TileURLTemplate,
        callbacks?: { onTileError?: (error: unknown) => void },
      ) => void;
    };

    if (typeof maybeController.setTileLayer !== "function") {
      this._logger.warn("setTileLayer is not available on MapController yet");
      return;
    }

    try {
      if (this._tileProvider) {
        const provider = this._tileProvider;
        const config: TileProviderConfig = {
          provider,
          style: this._tileStyle,
          apiKey: this._apiKey,
          attribution: this._tileAttribution,
        };

        const validation = validateProviderConfig(config);
        if (!validation.valid) {
          const code: TileProviderErrorDetail["code"] = validation.error
            ?.toLowerCase()
            .includes("api key")
            ? "missing_api_key"
            : "tile_load_failed";
          this._handleTileProviderError(
            code,
            validation.error ?? "Invalid tile provider configuration",
            provider,
          );
          return;
        }

        const tileConfig = buildTileURL(config);
        const previousProvider = this._activeTileProvider;

        maybeController.setTileLayer(tileConfig, {
          onTileError: (error: unknown) => {
            if (this._tileProvider !== provider) return;
            const message = this._describeTileLayerError(error, provider);
            const code: TileProviderErrorDetail["code"] =
              provider === "here"
                ? this._resolveHereTileLayerErrorCode(message)
                : "tile_load_failed";
            this._handleTileProviderError(code, message, provider);
          },
        });

        this._activeTileProvider = provider;
        this._emitTileProviderChanged(
          provider,
          this._tileStyle,
          previousProvider,
        );
        return;
      }

      maybeController.setTileLayer({
        urlTemplate: this._tileUrl,
        attribution: this._tileAttribution ?? "",
        maxZoom: this._maxZoom,
        subdomains: ["a", "b", "c"],
      });
      this._activeTileProvider = "tile-url";
    } catch (error) {
      const code = this._resolveTileProviderErrorCode(error);
      this._logger.error("Failed to update tile layer", { error, code });
      this._handleTileProviderError(
        code,
        error instanceof Error ? error.message : "Unknown tile layer error",
        this._tileProvider ?? "unknown",
      );
    }
  }

  private _handleTileProviderError(
    code: TileProviderErrorDetail["code"],
    message: string,
    provider: string,
  ): void {
    this._logger.error(`Tile provider error (${code}): ${message}`);

    this.dispatchEvent(
      new CustomEvent("tile-provider-error", {
        bubbles: true,
        detail: {
          code,
          message,
          provider,
          timestamp: Date.now(),
        },
      }),
    );

    const maybeController = this._controller as MapController & {
      setTileLayer?: (
        config: TileURLTemplate,
        callbacks?: { onTileError?: (error: unknown) => void },
      ) => void;
    };

    if (typeof maybeController.setTileLayer === "function") {
      maybeController.setTileLayer({
        urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        subdomains: ["a", "b", "c"],
      });
      this._activeTileProvider = "osm";
    }
  }

  private _emitTileProviderChanged(
    provider: string,
    style: string | undefined,
    previousProvider: string,
  ): void {
    this.dispatchEvent(
      new CustomEvent("tile-provider-changed", {
        bubbles: true,
        detail: {
          provider,
          style,
          previousProvider,
          timestamp: Date.now(),
        },
      }),
    );
  }

  // Properties (reflect attributes)
  get latitude(): number {
    return this._latitude;
  }
  set latitude(v: number) {
    this._latitude = Number(v);
    this._reflect("latitude", String(this._latitude));
  }

  get longitude(): number {
    return this._longitude;
  }
  set longitude(v: number) {
    this._longitude = Number(v);
    this._reflect("longitude", String(this._longitude));
  }

  get zoom(): number {
    return this._zoom;
  }
  set zoom(v: number) {
    this._zoom = Number(v);
    this._reflect("zoom", String(this._zoom));
  }

  get minZoom(): number | undefined {
    return this._minZoom;
  }
  set minZoom(v: number | undefined) {
    this._minZoom = v;
    this._reflect("min-zoom", v != null ? String(v) : null);
  }

  get maxZoom(): number | undefined {
    return this._maxZoom;
  }
  set maxZoom(v: number | undefined) {
    this._maxZoom = v;
    this._reflect("max-zoom", v != null ? String(v) : null);
  }

  get tileUrl(): string {
    return this._tileUrl;
  }
  set tileUrl(v: string) {
    this._tileUrl = v;
    this._reflect("tile-url", v);
    if (this._controller) {
      this._updateTileLayer();
    }
  }

  get tileProvider(): string | undefined {
    return this._tileProvider;
  }
  set tileProvider(v: string | undefined) {
    this._tileProvider = this._normalizeText(v ?? null, {
      lowercase: true,
    });
    this._reflect("tile-provider", this._tileProvider ?? null);
    if (this._controller) {
      this._updateTileLayer();
    }
  }

  get tileStyle(): string | undefined {
    return this._tileStyle;
  }
  set tileStyle(v: string | undefined) {
    this._tileStyle = this._normalizeText(v ?? null);
    this._reflect("tile-style", this._tileStyle ?? null);
    if (this._controller) {
      this._updateTileLayer();
    }
  }

  get apiKey(): string | undefined {
    return this._apiKey;
  }
  set apiKey(v: string | undefined) {
    this._apiKey = this._normalizeText(v ?? null);
    this._reflect("api-key", this._apiKey ?? null);
    if (this.hasAttribute("here-api-key")) {
      this.removeAttribute("here-api-key");
    }
    if (this._controller) {
      this._updateTileLayer();
    }
  }

  get tileAttribution(): string | undefined {
    return this._tileAttribution;
  }
  set tileAttribution(v: string | undefined) {
    this._tileAttribution = v;
    this._reflect("tile-attribution", v ?? null);
    if (this._controller) {
      this._updateTileLayer();
    }
  }

  get readOnly(): boolean {
    return this._readOnly;
  }
  set readOnly(v: boolean) {
    this._readOnly = Boolean(v);
    this._booleanReflect("read-only", this._readOnly);
  }

  get logLevel(): LogLevel {
    return this._logLevel;
  }
  set logLevel(v: LogLevel) {
    this._logLevel = v;
    this._logger.setLevel(v);
    this._reflect("log-level", v);
  }

  get devOverlay(): boolean {
    return this._devOverlay;
  }
  set devOverlay(v: boolean) {
    this._devOverlay = Boolean(v);
    this._booleanReflect("dev-overlay", this._devOverlay);
  }

  get preferCanvas(): boolean {
    return this._preferCanvas;
  }
  set preferCanvas(v: boolean) {
    this._preferCanvas = Boolean(v);
    this._booleanReflect("prefer-canvas", this._preferCanvas);
  }

  get useExternalLeaflet(): boolean {
    return this._useExternalLeaflet;
  }
  set useExternalLeaflet(v: boolean) {
    this._useExternalLeaflet = Boolean(v);
    this._booleanReflect("use-external-leaflet", this._useExternalLeaflet);
  }

  get skipLeafletStyles(): boolean {
    return this._skipLeafletStyles;
  }
  set skipLeafletStyles(v: boolean) {
    this._skipLeafletStyles = Boolean(v);
    this._booleanReflect("skip-leaflet-styles", this._skipLeafletStyles);
  }

  get leafletInstance(): typeof LeafletNS | undefined {
    return this._leafletInstance;
  }
  set leafletInstance(v: typeof LeafletNS | undefined) {
    this._leafletInstance = v;
  }

  get themeCss(): string {
    return this._themeCss;
  }
  set themeCss(v: string) {
    this._themeCss = typeof v === "string" ? v : "";
    if (this.isConnected) {
      this._applyThemeStyles();
    }
  }

  // Public API methods (delegating to controller)
  async getGeoJSON(): Promise<FeatureCollection> {
    this._logger.debug("getGeoJSON");
    if (!this._controller) return { type: "FeatureCollection", features: [] };
    return this._controller.getGeoJSON();
  }

  async loadGeoJSON(fc: FeatureCollection): Promise<void> {
    this._logger.debug("loadGeoJSON", { features: fc?.features?.length ?? 0 });
    if (!this._controller) return;
    const detail = { fc, mode: "load" as const };
    this.dispatchEvent(new CustomEvent("leaflet-draw:ingest", { detail }));
    const finalFc =
      detail.fc && detail.fc.type === "FeatureCollection" ? detail.fc : fc;
    await this._controller.loadGeoJSON(finalFc, false);
  }

  async clearLayers(): Promise<void> {
    this._logger.debug("clearLayers");
    if (!this._controller) return;
    await this._controller.clearLayers();
  }

  async addFeatures(fc: FeatureCollection): Promise<string[]> {
    this._logger.debug("addFeatures", { count: fc?.features?.length ?? 0 });
    if (!this._controller) return [];
    const detail = { fc, mode: "add" as const };
    this.dispatchEvent(new CustomEvent("leaflet-draw:ingest", { detail }));
    const finalFc =
      detail.fc && detail.fc.type === "FeatureCollection" ? detail.fc : fc;
    return this._controller.addFeatures(finalFc);
  }

  async updateFeature(id: string, feature: Feature): Promise<void> {
    this._logger.debug("updateFeature", { id });
    if (!this._controller) return;
    await this._controller.updateFeature(id, feature);
  }

  async removeFeature(id: string): Promise<void> {
    this._logger.debug("removeFeature", { id });
    if (!this._controller) return;
    await this._controller.removeFeature(id);
  }

  async fitBoundsToData(padding?: number): Promise<void> {
    this._logger.debug("fitBoundsToData", { padding });
    if (!this._controller) return;
    await this._controller.fitBoundsToData(
      typeof padding === "number" ? padding : 0.05,
    );
  }

  async fitBounds(
    bounds: [[number, number], [number, number]],
    padding?: number,
  ): Promise<void> {
    this._logger.debug("fitBounds", { bounds, padding });
    if (!this._controller) return;
    await this._controller.fitBounds(
      bounds,
      typeof padding === "number" ? padding : 0.05,
    );
  }

  async setView(lat: number, lng: number, zoom?: number): Promise<void> {
    this._logger.debug("setView", { lat, lng, zoom });
    // Reflect properties to maintain consistency
    this.latitude = lat;
    this.longitude = lng;
    if (typeof zoom === "number") this.zoom = zoom;
    if (this._controller) {
      await this._controller.setView(lat, lng, zoom);
    }
  }

  async exportGeoJSON(): Promise<FeatureCollection> {
    this._logger.debug("exportGeoJSON");
    if (!this._controller) return { type: "FeatureCollection", features: [] };
    const fc = await this._controller.getGeoJSON();
    const detail = { geoJSON: fc, featureCount: fc.features.length };
    this.dispatchEvent(new CustomEvent("leaflet-draw:export", { detail }));
    return fc;
  }

  /**
   * Merge all visible polygon layers into a single polygon.
   * This removes the original polygon features and adds a new merged feature.
   *
   * @param options Optional configuration for the merge operation
   * @returns Promise resolving to the ID of the newly created merged feature, or null if no polygons to merge
   */
  async mergePolygons(options?: {
    properties?: Record<string, any>;
  }): Promise<string | null> {
    this._logger.debug("mergePolygons");
    if (!this._controller) return null;

    // Get current state before merge for event detail
    const preState = await this._controller.getGeoJSON();
    const preCount = preState.features.length;

    // Perform the merge operation
    const newFeatureId = await this._controller.mergeVisiblePolygons(options);

    if (newFeatureId) {
      // Get state after merge to provide in the event
      const postState = await this._controller.getGeoJSON();
      const detail = {
        id: newFeatureId,
        mergedFeatureCount: preCount - postState.features.length + 1,
        geoJSON: postState,
      };

      // Dispatch event to notify listeners
      this.dispatchEvent(new CustomEvent("leaflet-draw:merged", { detail }));
    }

    return newFeatureId;
  }

  async setMeasurementUnits(system: MeasurementSystem): Promise<void> {
    this._logger.debug("setMeasurementUnits", { system });
    if (!this._controller) return;
    this._controller.setRulerUnits(system);
  }

  async loadGeoJSONFromUrl(url: string): Promise<void> {
    this._logger.debug("loadGeoJSONFromUrl", { url });
    if (!this._controller) return;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const err = new Error(
        `Failed to fetch GeoJSON from ${url}: ${res.status} ${res.statusText}`,
      );
      this.dispatchEvent(
        new CustomEvent("leaflet-draw:error", {
          detail: { message: err.message, cause: err },
        }),
      );
      throw err;
    }
    const data = await res.json();
    const detail = { fc: data, mode: "load" as const };
    this.dispatchEvent(new CustomEvent("leaflet-draw:ingest", { detail }));
    const finalFc =
      detail.fc && detail.fc.type === "FeatureCollection" ? detail.fc : data;
    await this._controller.loadGeoJSON(finalFc, true);
  }

  async loadGeoJSONFromText(text: string): Promise<void> {
    this._logger.debug("loadGeoJSONFromText", { length: text?.length ?? 0 });
    if (!this._controller) return;
    let data: FeatureCollection;
    try {
      data = JSON.parse(text);
    } catch (cause) {
      const err = new Error("Failed to parse GeoJSON text");
      this.dispatchEvent(
        new CustomEvent("leaflet-draw:error", {
          detail: { message: err.message, cause },
        }),
      );
      throw err;
    }
    const detail = { fc: data, mode: "load" as const };
    this.dispatchEvent(new CustomEvent("leaflet-draw:ingest", { detail }));
    const finalFc =
      detail.fc && detail.fc.type === "FeatureCollection" ? detail.fc : data;
    await this._controller.loadGeoJSON(finalFc, true);
  }
  // Helpers
  private _currentConfig(): MapConfig {
    return {
      latitude: this._latitude,
      longitude: this._longitude,
      zoom: this._zoom,
      minZoom: this._minZoom,
      maxZoom: this._maxZoom,
      tileUrl: this._tileUrl,
      tileAttribution: this._tileAttribution,
      readOnly: this._readOnly,
      fitToDataOnLoad: false,
      logLevel: this._logLevel,
      devOverlay: this._devOverlay,
      polygonAllowIntersection: this._polygonAllowIntersection,
      preferCanvas: this._preferCanvas,
      useExternalLeaflet: this._useExternalLeaflet,
      skipLeafletStyles: this._skipLeafletStyles,
    };
  }

  private _applyThemeStyles(): void {
    const themeUrl = this._themeUrl?.trim();
    if (themeUrl) {
      if (!this._themeLinkEl) {
        const link = document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("data-geokit-theme-url", "true");
        this._root.appendChild(link);
        this._themeLinkEl = link;
      }
      if (this._themeLinkEl.getAttribute("href") !== themeUrl) {
        this._themeLinkEl.setAttribute("href", themeUrl);
      }
    } else if (this._themeLinkEl) {
      this._themeLinkEl.remove();
      this._themeLinkEl = null;
    }

    const themeCss = this._themeCss;
    if (themeCss.trim().length > 0) {
      if (!this._themeStyleEl) {
        const style = document.createElement("style");
        style.setAttribute("data-geokit-theme-css", "true");
        this._root.appendChild(style);
        this._themeStyleEl = style;
      }
      if (this._themeStyleEl.textContent !== themeCss) {
        this._themeStyleEl.textContent = themeCss;
      }
    } else if (this._themeStyleEl) {
      this._themeStyleEl.remove();
      this._themeStyleEl = null;
    }
  }

  private _syncApiKeyFromAttributes(): void {
    const canonical = this._normalizeText(this.getAttribute("api-key"));
    const legacy = this._normalizeText(this.getAttribute("here-api-key"));
    this._apiKey = canonical ?? legacy;
  }

  private _normalizeText(
    value: string | null,
    options?: { lowercase?: boolean },
  ): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return options?.lowercase ? trimmed.toLowerCase() : trimmed;
  }

  private _resolveTileProviderErrorCode(
    error: unknown,
  ): TileProviderErrorDetail["code"] {
    if (!(error instanceof Error)) {
      return "tile_load_failed";
    }

    if (error.message.toLowerCase().includes("unknown tile provider")) {
      return "unknown_provider";
    }

    return "tile_load_failed";
  }

  private _resolveHereTileLayerErrorCode(
    message: string,
  ): TileProviderErrorDetail["code"] {
    const normalized = message.toLowerCase();
    if (
      normalized.includes("permission") ||
      normalized.includes("forbidden") ||
      normalized.includes("403") ||
      normalized.includes("unauthorized") ||
      normalized.includes("not authorized") ||
      normalized.includes("not authorised") ||
      normalized.includes("access denied")
    ) {
      return "permission_denied";
    }

    return "invalid_api_key";
  }

  private _describeTileLayerError(error: unknown, provider: string): string {
    if (
      error &&
      typeof error === "object" &&
      "error" in error &&
      (error as { error?: unknown }).error instanceof Error
    ) {
      return (error as { error: Error }).error.message;
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      const message = (error as { message: string }).message.trim();
      if (message.length > 0) {
        return message;
      }
    }

    if (provider === "here") {
      const styleHint =
        this._tileStyle === "satellite.day"
          ? " If satellite.day fails, try lite.day."
          : "";
      return `Failed to load HERE tiles; verify API key, project permissions, and allowed localhost origin/referrer.${styleHint}`;
    }

    return "Failed to load tile layer";
  }

  private _reflect(name: string, value: string | null): void {
    if (value === null) {
      this.removeAttribute(name);
    } else {
      if (this.getAttribute(name) !== value) {
        this.setAttribute(name, value);
      }
    }
  }

  private _booleanReflect(name: string, present: boolean): void {
    if (present) {
      if (!this.hasAttribute(name)) this.setAttribute(name, "");
    } else {
      if (this.hasAttribute(name)) this.removeAttribute(name);
    }
  }

  private _coerceNumber(v: string | null, fallback?: number): number {
    if (v == null) return fallback ?? NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? NaN);
  }
}
