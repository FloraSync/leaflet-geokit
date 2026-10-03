import type { Feature, FeatureCollection } from "geojson";
import type {
  MapLayer,
  LayerStyle,
  LayerCakeSessionUpdate,
} from "@src/types/layers";
import type {
  GeoJSONImportBehavior,
  GeoJSONImportOptions,
  GeoJSONExportOptions,
  LeafletDrawMapElementAPI,
  MapConfig,
  DrawControlsConfig,
  IntegratedToolEventEmitter,
  IntegratedToolHooks,
  MarkerIconConfig,
  MeasurementSystem,
  SnappingOptions,
  MeasurementOverlayOptions,
  TileProviderErrorDetail,
  ToolButtonConfig,
  ToolButtonName,
  ToolCapabilities,
  ToolProviderCapability,
  ToolCommandAction,
  ToolCommandEventDetail,
  ToolEventDetail,
  ToolLifecycleEventName,
  ToolToolbarGroupConfig,
  ToolTriggerEventDetail,
  ToolTriggerOptions,
} from "@src/types/public";
import {
  DrawEvent,
  GeoKitEvent,
  type DiagnosticEventDetail,
  type ErrorEventDetail,
  type GeoKitDiagnosticSummary,
  type GeoKitStatusState,
  type StatusEventDetail,
} from "@src/types/events";
import { createLogger, type Logger, type LogLevel } from "@src/utils/logger";
import { applyLeafletStylingIfNeeded } from "@src/lib/leaflet-assets";
import { MapController } from "@src/lib/MapController";
import { createRasterProvider } from "@src/lib/providers";
import type { BasemapAdapter, ProviderDiagnostics } from "@src/lib/providers";
import { buildToolCapabilities } from "@src/lib/tool-capabilities";
import {
  normalizeMarkerIconAttributes,
  normalizeMarkerIconConfig,
  type NormalizedMarkerIconConfig,
} from "@src/lib/marker-icons";
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
  private _toolHooks: IntegratedToolHooks | undefined;
  private _toolEventEmitter: IntegratedToolEventEmitter | undefined;
  private _markerIconConfig: MarkerIconConfig | null | undefined;
  private _toolButtonConfig: ToolButtonConfig | null | undefined;
  private _toolbarGroups: ToolToolbarGroupConfig[] | null | undefined;
  private _snapping: SnappingOptions | null | undefined;
  private _measurementOverlay: MeasurementOverlayOptions | null | undefined;
  private _internalToolEvents = new WeakSet<Event>();
  private _toolCommandSequence = 0;
  private _activeTool: ToolButtonName | null = null;
  private _providerCapabilityError: ToolProviderCapability["reason"] = null;
  private _lastCapabilities = "";
  private _configurationUpdate: Promise<void> = Promise.resolve();
  private _status: StatusEventDetail = {
    state: "uninitialized",
    ready: false,
    busy: false,
    featureCount: 0,
    timestamp: Date.now(),
  };

  private _externalToolTriggerListener = (event: Event): void => {
    const detail = (event as CustomEvent).detail as
      | ({
          action?: "activate" | "deactivate";
          active?: boolean;
          tool?: ToolButtonName;
        } & ToolTriggerOptions)
      | undefined;
    if (detail?.action === "deactivate" || detail?.active === false) {
      void this.deactivateTool({
        source: detail.source ?? "event",
        groupId: detail.groupId,
        commandId: detail.commandId,
      });
      return;
    }

    if (!detail?.tool) return;

    void this.activateTool(detail.tool, {
      source: detail.source ?? "event",
      groupId: detail.groupId,
      commandId: detail.commandId,
    });
  };

  private _externalToolDeactivateListener = (event: Event): void => {
    const detail = (event as CustomEvent).detail as
      | ToolTriggerOptions
      | undefined;

    void this.deactivateTool({
      source: detail?.source ?? "event",
      groupId: detail?.groupId,
      commandId: detail?.commandId,
    });
  };

  private _externalToolCommandListener = (event: Event): void => {
    if (this._internalToolEvents.has(event)) return;
    const detail = (event as CustomEvent).detail as
      | ToolCommandEventDetail
      | undefined;
    if (!detail?.tool) return;

    const source = detail.source ?? "event";
    const commandId = detail.commandId?.trim() || this._nextToolCommandId();
    const action: ToolCommandAction =
      detail.action === "deactivate" || detail.tool === "select"
        ? "deactivate"
        : "activate";
    detail.tool = action === "deactivate" ? "select" : detail.tool;
    Object.assign(detail, {
      tool: detail.tool,
      action,
      source,
      groupId: detail.groupId,
      commandId,
      previousTool: this._activeTool,
      activeTool: this._activeTool,
      featureIds: [],
      timestamp: Date.now(),
    } satisfies ToolEventDetail);
    queueMicrotask(() => {
      this._emitToolTriggerRequested(
        action === "deactivate" ? "select" : detail.tool,
        { source, groupId: detail.groupId, commandId },
      );

      const controller = this._controller as
        | (MapController & {
            handleToolCommand?: (command: ToolCommandEventDetail) => boolean;
          })
        | null;
      if (typeof controller?.handleToolCommand === "function") {
        controller.handleToolCommand(detail);
        return;
      }

      const tool = action === "deactivate" ? "select" : detail.tool;
      this._emitStandaloneToolFailure(
        tool,
        action,
        { source, groupId: detail.groupId, commandId },
        "Map controller is not initialized",
        false,
      );
    });
  };

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
      <div class="map-container" part="host map"></div>
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
    this._setStatus({
      state: "initializing",
      ready: false,
      busy: true,
      featureCount: 0,
      lastEvent: "connected",
      lastError: null,
    });

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
        onToolCapabilitiesChanged: () => this._emitToolCapabilities(),
        onReady: (detail) => {
          this.dispatchEvent(new CustomEvent(DrawEvent.Ready, { detail }));
          void this._syncStatusFromController({
            state: "ready",
            ready: true,
            busy: false,
            lastEvent: DrawEvent.Ready,
            clearLastError: true,
          });
        },
        onCreated: (detail) => {
          this.dispatchEvent(new CustomEvent(DrawEvent.Created, { detail }));
          this._setStatus({
            state: "ready",
            ready: true,
            busy: false,
            featureCount: this._status.featureCount + 1,
            lastEvent: DrawEvent.Created,
            lastError: null,
          });
        },
        onEdited: (detail) => {
          this.dispatchEvent(new CustomEvent(DrawEvent.Edited, { detail }));
          this._setStatus({
            state: "ready",
            ready: true,
            busy: false,
            featureCount: detail.geoJSON.features.length,
            lastEvent: DrawEvent.Edited,
            lastError: null,
          });
        },
        onDeleted: (detail) => {
          this.dispatchEvent(new CustomEvent(DrawEvent.Deleted, { detail }));
          this._setStatus({
            state: "ready",
            ready: true,
            busy: false,
            featureCount: detail.geoJSON.features.length,
            lastEvent: DrawEvent.Deleted,
            lastError: null,
          });
        },
        onError: (detail) => {
          this._emitError(detail, {
            state: detail.recoverable
              ? this._status.ready
                ? "ready"
                : this._status.state
              : "error",
            lastEvent: DrawEvent.Error,
          });
        },
        onTileError: (error) => {
          if (this._tileProvider) {
            return;
          }

          const message = this._describeTileLayerError(error, "tile-url");
          this._handleTileProviderError(
            "tile_load_failed",
            message,
            "tile-url",
          );
        },
        onToolTrigger: (detail) => {
          this._emitToolTriggerResult(detail);
        },
        onToolEvent: (eventName, detail) => {
          this._emitToolLifecycleEvent(eventName, detail);
        },
        onLayerEvent: (eventName, detail) => {
          this.dispatchEvent(
            new CustomEvent(eventName, {
              detail,
              bubbles: true,
              composed: true,
            }),
          );
        },
        onLayerStyleRequested: (detail) => {
          return !this.dispatchEvent(
            new CustomEvent("leaflet-geokit:layer-style-request", {
              detail,
              cancelable: true,
              bubbles: true,
              composed: true,
            }),
          );
        },
        onSaved: (detail) => {
          this.dispatchEvent(
            new CustomEvent(DrawEvent.Export, {
              detail: {
                geoJSON: detail.geoJSON,
                featureCount: detail.featureCount,
                adapter: "editing",
              },
            }),
          );
          this._setStatus({
            state: "ready",
            ready: true,
            busy: false,
            featureCount: detail.featureCount,
            lastEvent: DrawEvent.Export,
            lastError: null,
          });
        },
      },
      leaflet: this._leafletInstance ?? undefined,
      useExternalLeaflet: this._useExternalLeaflet,
      toolHooks: this._toolHooks,
      toolEventEmitter: this._toolEventEmitter,
      markerIconConfig: this._effectiveMarkerIconConfig(),
      toolButtonConfig: this._effectiveToolButtonConfig(),
      toolbarGroups: this._effectiveToolbarGroups(),
      snapping: this._snapping ?? null,
      measurementOverlay: this._measurementOverlay ?? null,
    });

    this.addEventListener(
      GeoKitEvent.ToolCommand,
      this._externalToolCommandListener,
    );
    this.addEventListener(
      "leaflet-geokit:trigger-tool",
      this._externalToolTriggerListener,
    );
    this.addEventListener(
      "leaflet-geokit:activate-tool",
      this._externalToolTriggerListener,
    );
    this.addEventListener(
      "leaflet-geokit:deactivate-tool",
      this._externalToolDeactivateListener,
    );

    await this._controller.init();

    if (this._status.state === "error") {
      return;
    }

    if (this._tileProvider) {
      this._updateTileLayer();
    }
  }

  async disconnectedCallback(): Promise<void> {
    this._logger.debug("disconnectedCallback");
    this._activeTileProvider = "tile-url";
    this._providerCapabilityError = null;
    if (this._controller) {
      await this._controller.destroy();
      this._controller = null;
    }
    this._activeTool = null;
    this.removeEventListener(
      GeoKitEvent.ToolCommand,
      this._externalToolCommandListener,
    );
    this.removeEventListener(
      "leaflet-geokit:trigger-tool",
      this._externalToolTriggerListener,
    );
    this.removeEventListener(
      "leaflet-geokit:activate-tool",
      this._externalToolTriggerListener,
    );
    this.removeEventListener(
      "leaflet-geokit:deactivate-tool",
      this._externalToolDeactivateListener,
    );
    this._setStatus({
      state: "uninitialized",
      ready: false,
      busy: false,
      featureCount: 0,
      lastEvent: "disconnected",
      lastError: null,
    });
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
      "marker-icon-url",
      "marker-icon-retina-url",
      "marker-shadow-url",
      "marker-icon-size",
      "marker-icon-anchor",
      "marker-popup-anchor",
      "tool-button-config",
      "toolbar-groups",
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
      } else if (this._isMarkerIconAttribute(name)) {
        this._syncMarkerIconConfig();
      } else if (name === "tool-button-config") {
        this._syncToolButtonConfig();
      } else if (name === "toolbar-groups") {
        this._syncToolbarGroups();
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
        const controller = this._controller;
        controller.configure?.(
          this._mapConfig(),
          this._controlsFromAttributes(),
        );
        // Serialize rebuilds so rapid attribute toggles cannot create overlapping maps.
        this._configurationUpdate = this._configurationUpdate.then(async () => {
          if (this._controller !== controller || !this.isConnected) return;
          controller.configure?.(
            this._mapConfig(),
            this._controlsFromAttributes(),
          );
          await controller.init();
          if (this._tileProvider) this._updateTileLayer();
        });
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

    this._providerCapabilityError = null;
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

      maybeController.setTileLayer(
        {
          urlTemplate: this._tileUrl,
          attribution: this._tileAttribution ?? "",
          maxZoom: this._maxZoom,
          subdomains: ["a", "b", "c"],
        },
        {
          onTileError: (error: unknown) => {
            const message = this._describeTileLayerError(error, "tile-url");
            this._handleTileProviderError(
              "tile_load_failed",
              message,
              "tile-url",
            );
          },
        },
      );
      this._activeTileProvider = "tile-url";
    } catch (error) {
      const code = this._resolveTileProviderErrorCode(error);
      this._logger.error("Failed to update tile layer", { error, code });
      this._handleTileProviderError(
        code,
        error instanceof Error ? error.message : "Unknown tile layer error",
        this._tileProvider ?? "unknown",
      );
    } finally {
      this._controller?.setToolProvider?.(this._toolProviderCapability());
      this._emitToolCapabilities();
    }
  }

  private _handleTileProviderError(
    code: TileProviderErrorDetail["code"],
    message: string,
    provider: string,
  ): void {
    this._logger.error(`Tile provider error (${code}): ${message}`);
    const timestamp = Date.now();

    // Capability diagnostics never include provider URLs, keys, or arbitrary error payloads.
    this._providerCapabilityError = {
      code:
        code === "missing_api_key"
          ? "missing_api_key"
          : code === "unknown_provider"
            ? "missing_provider"
            : "runtime_error",
      message:
        code === "missing_api_key"
          ? "Requested provider requires an API key"
          : code === "unknown_provider"
            ? "Requested provider is unavailable"
            : "Requested provider failed; using fallback tiles",
    };

    this.dispatchEvent(
      new CustomEvent("tile-provider-error", {
        bubbles: true,
        detail: {
          code,
          message,
          provider,
          timestamp,
        },
      }),
    );

    this._emitDiagnostic(
      {
        code,
        message,
        recoverable: true,
        severity: "warn",
        timestamp,
      },
      {
        state: this._status.ready ? "ready" : this._status.state,
        lastEvent: "tile-provider-error",
      },
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
    this._controller?.setToolProvider?.(this._toolProviderCapability());
    this._emitToolCapabilities();
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

  private _toolProviderCapability(): ToolProviderCapability {
    const requested =
      this._activeTileProvider === "adapter"
        ? "adapter"
        : (this._tileProvider ?? "tile-url");
    let reason = this._providerCapabilityError;
    if (
      requested !== "adapter" &&
      requested !== "tile-url" &&
      requested !== "osm" &&
      requested !== "here"
    ) {
      reason = {
        code: "missing_provider",
        message: "Requested provider is unavailable",
      };
    } else if (requested === "here" && !this._apiKey?.trim()) {
      reason = {
        code: "missing_api_key",
        message: "Requested provider requires an API key",
      };
    }
    return {
      requested,
      active: this._activeTileProvider,
      state: reason ? "unavailable" : "enabled",
      reason: reason ? { ...reason } : null,
    };
  }

  /** Call after ready; reconnect restores attribute-configured raster tiles. */
  setBasemapAdapter(adapter: BasemapAdapter | null): void {
    if (!this._status.ready || !this._controller)
      throw new Error("Map is not ready");
    if (!adapter) {
      this._updateTileLayer();
      return;
    }
    this._controller.setBasemapAdapter(adapter);
    const previous = this._activeTileProvider;
    this._activeTileProvider = "adapter";
    this._providerCapabilityError = null;
    this._emitTileProviderChanged("adapter", undefined, previous);
    this._controller.setToolProvider?.(this._toolProviderCapability());
    this._emitToolCapabilities();
  }

  getProviderDiagnostics(): ProviderDiagnostics | null {
    const diagnostics = this._controller?.getProviderDiagnostics?.() ?? null;
    if (!diagnostics || this._activeTileProvider === "adapter")
      return diagnostics;
    const active =
      this._activeTileProvider === "tile-url" &&
      this._tileUrl === buildTileURL({ provider: "osm" }).urlTemplate
        ? "osm"
        : this._activeTileProvider;
    if (active === "osm" || active === "here") {
      const provider = createRasterProvider({ provider: active });
      return { ...diagnostics, ...provider.capabilities };
    }
    return diagnostics;
  }

  getToolCapabilities(): ToolCapabilities {
    const snapshot =
      this._controller?.getToolCapabilities?.() ??
      buildToolCapabilities({
        ready: false,
        readOnly: this._readOnly,
        controls: this._controlsFromAttributes(),
        available: {},
        layerCount: 0,
        selectedFeatureIds: [],
        activeTool: null,
        config: this._effectiveToolButtonConfig(),
        groups: this._effectiveToolbarGroups(),
        provider: this._toolProviderCapability(),
      });
    return { ...snapshot, provider: this._toolProviderCapability() };
  }

  setToolSelection(featureIds: readonly string[]): void {
    this._controller?.setToolSelection(featureIds);
  }

  private _emitToolCapabilities(): void {
    const detail = this.getToolCapabilities();
    const serialized = JSON.stringify(detail);
    if (serialized === this._lastCapabilities) return;
    this._lastCapabilities = serialized;
    this.dispatchEvent(
      new CustomEvent(GeoKitEvent.ToolCapabilitiesChanged, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _isMarkerIconAttribute(name: string): boolean {
    return (
      name === "marker-icon-url" ||
      name === "marker-icon-retina-url" ||
      name === "marker-shadow-url" ||
      name === "marker-icon-size" ||
      name === "marker-icon-anchor" ||
      name === "marker-popup-anchor"
    );
  }

  private _effectiveMarkerIconConfig(): NormalizedMarkerIconConfig | null {
    const reportError = (message: string, cause?: unknown) => {
      this._emitError(
        {
          code: "invalid_marker_icon_config",
          message,
          recoverable: true,
          cause,
        },
        {
          state: this._status.ready ? "ready" : this._status.state,
        },
      );
    };

    if (this._markerIconConfig === null) {
      return null;
    }

    if (this._markerIconConfig !== undefined) {
      return normalizeMarkerIconConfig(this._markerIconConfig, { reportError });
    }

    const markerIconUrl = this.getAttribute("marker-icon-url");
    if (markerIconUrl == null) {
      return null;
    }

    return normalizeMarkerIconAttributes(
      {
        iconUrl: markerIconUrl,
        iconRetinaUrl: this.getAttribute("marker-icon-retina-url"),
        shadowUrl: this.getAttribute("marker-shadow-url"),
        iconSize: this.getAttribute("marker-icon-size"),
        iconAnchor: this.getAttribute("marker-icon-anchor"),
        popupAnchor: this.getAttribute("marker-popup-anchor"),
      },
      { reportError },
    );
  }

  private _syncMarkerIconConfig(): void {
    const maybeController = this._controller as
      | (MapController & {
          setMarkerIconConfig?: (
            config: NormalizedMarkerIconConfig | null,
          ) => void;
        })
      | null;
    if (typeof maybeController?.setMarkerIconConfig !== "function") {
      return;
    }

    maybeController.setMarkerIconConfig(this._effectiveMarkerIconConfig());
  }

  private _effectiveToolButtonConfig(): ToolButtonConfig | null {
    if (this._toolButtonConfig !== undefined) {
      return this._toolButtonConfig;
    }

    const raw = this.getAttribute("tool-button-config");
    if (raw == null || raw.trim() === "") {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("tool-button-config must be a JSON object");
      }
      return parsed as ToolButtonConfig;
    } catch (cause) {
      this._emitError(
        {
          code: "invalid_tool_button_config",
          message: "Failed to parse tool-button-config",
          recoverable: true,
          cause,
        },
        {
          state: this._status.ready ? "ready" : this._status.state,
        },
      );
      return null;
    }
  }

  private _syncToolButtonConfig(): void {
    const maybeController = this._controller as
      | (MapController & {
          setToolButtonConfig?: (
            config: ToolButtonConfig | null | undefined,
          ) => void;
        })
      | null;
    if (typeof maybeController?.setToolButtonConfig !== "function") {
      return;
    }

    maybeController.setToolButtonConfig(this._effectiveToolButtonConfig());
  }

  private _effectiveToolbarGroups(): ToolToolbarGroupConfig[] | null {
    if (this._toolbarGroups !== undefined) {
      return this._toolbarGroups;
    }

    const raw = this.getAttribute("toolbar-groups");
    if (raw == null || raw.trim() === "") {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("toolbar-groups must be a JSON array");
      }
      return parsed as ToolToolbarGroupConfig[];
    } catch (cause) {
      this._emitError(
        {
          code: "invalid_toolbar_groups",
          message: "Failed to parse toolbar-groups",
          recoverable: true,
          cause,
        },
        {
          state: this._status.ready ? "ready" : this._status.state,
        },
      );
      return null;
    }
  }

  private _syncToolbarGroups(): void {
    const maybeController = this._controller as
      | (MapController & {
          setToolbarGroups?: (
            groups: ToolToolbarGroupConfig[] | null | undefined,
          ) => void;
        })
      | null;
    if (typeof maybeController?.setToolbarGroups !== "function") {
      return;
    }

    maybeController.setToolbarGroups(this._effectiveToolbarGroups());
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

  get status(): StatusEventDetail {
    return this._cloneStatus(this._status);
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

  get markerIconConfig(): MarkerIconConfig | null | undefined {
    return this._markerIconConfig;
  }
  set markerIconConfig(v: MarkerIconConfig | null | undefined) {
    this._markerIconConfig = v;
    this._syncMarkerIconConfig();
  }

  get toolButtonConfig(): ToolButtonConfig | null | undefined {
    return this._toolButtonConfig;
  }
  set toolButtonConfig(v: ToolButtonConfig | null | undefined) {
    this._toolButtonConfig = v;
    this._syncToolButtonConfig();
  }

  get toolbarGroups(): ToolToolbarGroupConfig[] | null | undefined {
    return this._toolbarGroups;
  }
  set toolbarGroups(v: ToolToolbarGroupConfig[] | null | undefined) {
    this._toolbarGroups = v;
    this._syncToolbarGroups();
  }

  get snapping(): SnappingOptions | null | undefined {
    return this._snapping;
  }
  set snapping(value: SnappingOptions | null | undefined) {
    const previous = this._snapping;
    this._snapping = value;
    try {
      this._controller?.setSnappingOptions(value);
    } catch (error) {
      this._snapping = previous;
      throw error;
    }
  }

  get measurementOverlay(): MeasurementOverlayOptions | null | undefined {
    return this._measurementOverlay;
  }
  set measurementOverlay(value: MeasurementOverlayOptions | null | undefined) {
    const previous = this._measurementOverlay;
    this._measurementOverlay = value;
    try {
      this._controller?.setMeasurementOverlayOptions(value);
    } catch (error) {
      this._measurementOverlay = previous;
      throw error;
    }
  }

  get leafletInstance(): typeof LeafletNS | undefined {
    return this._leafletInstance;
  }
  set leafletInstance(v: typeof LeafletNS | undefined) {
    this._leafletInstance = v;
  }

  get toolHooks(): IntegratedToolHooks | undefined {
    return this._toolHooks;
  }
  set toolHooks(v: IntegratedToolHooks | undefined) {
    this._toolHooks = v;
    const maybeController = this._controller as
      | (MapController & {
          setToolObservers?: (options: {
            toolHooks?: IntegratedToolHooks;
            toolEventEmitter?: IntegratedToolEventEmitter;
          }) => void;
        })
      | null;
    if (typeof maybeController?.setToolObservers === "function") {
      maybeController.setToolObservers({
        toolHooks: this._toolHooks,
        toolEventEmitter: this._toolEventEmitter,
      });
    }
  }

  get toolEventEmitter(): IntegratedToolEventEmitter | undefined {
    return this._toolEventEmitter;
  }
  set toolEventEmitter(v: IntegratedToolEventEmitter | undefined) {
    this._toolEventEmitter = v;
    const maybeController = this._controller as
      | (MapController & {
          setToolObservers?: (options: {
            toolHooks?: IntegratedToolHooks;
            toolEventEmitter?: IntegratedToolEventEmitter;
          }) => void;
        })
      | null;
    if (typeof maybeController?.setToolObservers === "function") {
      maybeController.setToolObservers({
        toolHooks: this._toolHooks,
        toolEventEmitter: this._toolEventEmitter,
      });
    }
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

  async importGeoJSON(
    fc: FeatureCollection,
    options: GeoJSONImportOptions = {},
  ): Promise<string[]> {
    const behavior = options.behavior ?? "replace";
    this._logger.debug("importGeoJSON", {
      behavior,
      fitToData: options.fitToData ?? false,
      features: fc?.features?.length ?? 0,
    });
    if (!this._controller) return [];

    const previousStatus = this.status;
    this._setImportLoadingStatus(previousStatus);
    return this._performImport(
      fc,
      options,
      previousStatus,
      behavior === "add"
        ? "Failed to add GeoJSON features to the map"
        : "Failed to load GeoJSON into the map",
    );
  }

  async loadGeoJSON(fc: FeatureCollection): Promise<void> {
    this._logger.debug("loadGeoJSON", { features: fc?.features?.length ?? 0 });
    await this.importGeoJSON(fc, { behavior: "replace" });
  }

  async clearLayers(): Promise<void> {
    this._logger.debug("clearLayers");
    if (!this._controller) return;
    await this._controller.clearLayers();
    this._setStatus({
      state: "ready",
      ready: true,
      busy: false,
      featureCount: 0,
      lastEvent: "clearLayers",
      lastError: null,
    });
  }

  async addFeatures(fc: FeatureCollection): Promise<string[]> {
    this._logger.debug("addFeatures", { count: fc?.features?.length ?? 0 });
    return this.importGeoJSON(fc, { behavior: "add" });
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
    await this._syncStatusFromController({
      state: "ready",
      ready: true,
      busy: false,
      lastEvent: "removeFeature",
      clearLastError: true,
    });
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

  async exportGeoJSON(
    options: GeoJSONExportOptions = {},
  ): Promise<FeatureCollection> {
    const adapter = options.adapter ?? "editing";
    this._logger.debug("exportGeoJSON", { adapter });
    if (!this._controller) return { type: "FeatureCollection", features: [] };
    const fc = await this._exportWithController(options);
    const detail = {
      geoJSON: fc,
      featureCount: fc.features.length,
      adapter,
    };
    this.dispatchEvent(new CustomEvent(DrawEvent.Export, { detail }));
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
      this._setStatus({
        state: "ready",
        ready: true,
        busy: false,
        featureCount: postState.features.length,
        lastEvent: "leaflet-draw:merged",
        lastError: null,
      });
    }

    return newFeatureId;
  }

  async setMeasurementUnits(system: MeasurementSystem): Promise<void> {
    this._logger.debug("setMeasurementUnits", { system });
    if (!this._controller) return;
    this._controller.setRulerUnits(system);
  }

  getSnappingOptions(): SnappingOptions | null {
    return (
      this._controller?.getSnappingOptions() ??
      (this._snapping ? { ...this._snapping } : null)
    );
  }

  getMeasurementOverlayOptions(): MeasurementOverlayOptions | null {
    return (
      this._controller?.getMeasurementOverlayOptions() ??
      (this._measurementOverlay ? { ...this._measurementOverlay } : null)
    );
  }

  private _nextToolCommandId(): string {
    this._toolCommandSequence += 1;
    return `tool-${Date.now().toString(36)}-element-${this._toolCommandSequence.toString(36)}`;
  }

  private _emitToolTriggerRequested(
    tool: ToolButtonName,
    options: Required<Pick<ToolTriggerOptions, "source" | "commandId">> &
      Pick<ToolTriggerOptions, "groupId">,
  ): void {
    this.dispatchEvent(
      new CustomEvent("leaflet-geokit:tool-trigger-requested", {
        bubbles: true,
        composed: true,
        detail: {
          tool,
          source: options.source,
          groupId: options.groupId,
          commandId: options.commandId,
          handled: false,
          timestamp: Date.now(),
        } satisfies ToolTriggerEventDetail,
      }),
    );
  }

  private _baseToolEventDetail(
    tool: ToolButtonName,
    action: ToolCommandAction,
    options: Required<Pick<ToolTriggerOptions, "source" | "commandId">> &
      Pick<ToolTriggerOptions, "groupId">,
  ): ToolEventDetail {
    return {
      tool,
      action,
      source: options.source,
      groupId: options.groupId,
      commandId: options.commandId,
      previousTool: null,
      activeTool: null,
      featureIds: [],
      timestamp: Date.now(),
    };
  }

  private _emitStandaloneToolFailure(
    tool: ToolButtonName,
    action: ToolCommandAction,
    options: Required<Pick<ToolTriggerOptions, "source" | "commandId">> &
      Pick<ToolTriggerOptions, "groupId">,
    reason: string,
    emitCommand = true,
  ): void {
    const detail = this._baseToolEventDetail(tool, action, options);
    if (emitCommand) {
      this._emitToolLifecycleEvent(GeoKitEvent.ToolCommand, detail);
    }
    this._emitToolLifecycleEvent(GeoKitEvent.ToolFailed, {
      ...detail,
      reason,
      timestamp: Date.now(),
    });
    this._emitToolTriggerResult({
      tool,
      source: options.source,
      groupId: options.groupId,
      commandId: options.commandId,
      handled: false,
      timestamp: Date.now(),
      error: reason,
    });
  }

  async activateTool(
    tool: ToolButtonName,
    options: ToolTriggerOptions = {},
  ): Promise<boolean> {
    const source = options.source ?? "api";
    const commandId = options.commandId?.trim() || this._nextToolCommandId();
    const normalized = { source, groupId: options.groupId, commandId };
    this._emitToolTriggerRequested(tool, normalized);

    if (!this._controller) {
      this._emitStandaloneToolFailure(
        tool,
        tool === "select" ? "deactivate" : "activate",
        normalized,
        "Map controller is not initialized",
      );
      return false;
    }

    const maybeController = this._controller as MapController & {
      activateTool?: (
        tool: ToolButtonName,
        options?: ToolTriggerOptions,
      ) => boolean;
      triggerTool?: (
        tool: ToolButtonName,
        options?: ToolTriggerOptions,
      ) => boolean;
    };
    const activate =
      typeof maybeController.activateTool === "function"
        ? maybeController.activateTool.bind(maybeController)
        : maybeController.triggerTool?.bind(maybeController);

    if (!activate) {
      this._emitStandaloneToolFailure(
        tool,
        tool === "select" ? "deactivate" : "activate",
        normalized,
        "Map controller cannot activate tools",
      );
      return false;
    }

    return activate(tool, normalized);
  }

  async triggerTool(
    tool: ToolButtonName,
    options: ToolTriggerOptions = {},
  ): Promise<boolean> {
    return this.activateTool(tool, options);
  }

  async deactivateTool(options: ToolTriggerOptions = {}): Promise<boolean> {
    const source = options.source ?? "api";
    const commandId = options.commandId?.trim() || this._nextToolCommandId();
    const normalized = { source, groupId: options.groupId, commandId };
    this._emitToolTriggerRequested("select", normalized);

    if (!this._controller) {
      this._emitStandaloneToolFailure(
        "select",
        "deactivate",
        normalized,
        "Map controller is not initialized",
      );
      return false;
    }

    const maybeController = this._controller as MapController & {
      deactivateTool?: (options?: ToolTriggerOptions) => boolean;
      activateTool?: (
        tool: ToolButtonName,
        options?: ToolTriggerOptions,
      ) => boolean;
      triggerTool?: (
        tool: ToolButtonName,
        options?: ToolTriggerOptions,
      ) => boolean;
    };

    if (typeof maybeController.deactivateTool === "function") {
      return maybeController.deactivateTool(normalized);
    }

    const activate =
      typeof maybeController.activateTool === "function"
        ? maybeController.activateTool.bind(maybeController)
        : maybeController.triggerTool?.bind(maybeController);

    if (!activate) {
      this._emitStandaloneToolFailure(
        "select",
        "deactivate",
        normalized,
        "Map controller cannot deactivate tools",
      );
      return false;
    }

    return activate("select", normalized);
  }

  async loadGeoJSONFromUrl(
    url: string,
    options: GeoJSONImportOptions = {},
  ): Promise<void> {
    const behavior = options.behavior ?? "replace";
    this._logger.debug("loadGeoJSONFromUrl", {
      url,
      behavior,
      fitToData: options.fitToData ?? true,
    });
    if (!this._controller) return;

    const previousStatus = this.status;
    this._setImportLoadingStatus(previousStatus);

    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (cause) {
      const err = new Error(`Failed to fetch GeoJSON from ${url}`);
      this._emitError(
        {
          code: "data_fetch_failed",
          message: err.message,
          recoverable: true,
          cause,
        },
        {
          state: previousStatus.ready ? "ready" : previousStatus.state,
          featureCount: previousStatus.featureCount,
        },
      );
      throw err;
    }

    if (!res.ok) {
      const err = new Error(
        `Failed to fetch GeoJSON from ${url}: ${res.status} ${res.statusText}`,
      );
      this._emitError(
        {
          code: "data_fetch_failed",
          message: err.message,
          recoverable: true,
          cause: err,
        },
        {
          state: previousStatus.ready ? "ready" : previousStatus.state,
          featureCount: previousStatus.featureCount,
        },
      );
      throw err;
    }

    let data: FeatureCollection;
    try {
      data = await res.json();
    } catch (cause) {
      const err = new Error(`Failed to parse GeoJSON from ${url}`);
      this._emitError(
        {
          code: "data_parse_failed",
          message: err.message,
          recoverable: true,
          cause,
        },
        {
          state: previousStatus.ready ? "ready" : previousStatus.state,
          featureCount: previousStatus.featureCount,
        },
      );
      throw err;
    }

    await this._performImport(
      data,
      {
        behavior,
        fitToData: options.fitToData ?? true,
      },
      previousStatus,
      behavior === "add"
        ? `Failed to add GeoJSON from ${url}`
        : `Failed to load GeoJSON from ${url}`,
    );
  }

  async loadGeoJSONFromText(
    text: string,
    options: GeoJSONImportOptions = {},
  ): Promise<void> {
    const behavior = options.behavior ?? "replace";
    this._logger.debug("loadGeoJSONFromText", {
      behavior,
      fitToData: options.fitToData ?? true,
      length: text?.length ?? 0,
    });
    if (!this._controller) return;

    const previousStatus = this.status;
    this._setImportLoadingStatus(previousStatus);

    let data: FeatureCollection;
    try {
      data = JSON.parse(text);
    } catch (cause) {
      const err = new Error("Failed to parse GeoJSON text");
      this._emitError(
        {
          code: "data_parse_failed",
          message: err.message,
          recoverable: true,
          cause,
        },
        {
          state: previousStatus.ready ? "ready" : previousStatus.state,
          featureCount: previousStatus.featureCount,
        },
      );
      throw err;
    }

    await this._performImport(
      data,
      {
        behavior,
        fitToData: options.fitToData ?? true,
      },
      previousStatus,
      behavior === "add"
        ? "Failed to add parsed GeoJSON into the map"
        : "Failed to load parsed GeoJSON into the map",
    );
  }

  private _setImportLoadingStatus(previousStatus: StatusEventDetail): void {
    this._setStatus({
      state: "loading",
      ready: previousStatus.ready,
      busy: true,
      featureCount: previousStatus.featureCount,
      lastEvent: DrawEvent.Ingest,
      lastError: null,
    });
  }

  private async _performImport(
    fc: FeatureCollection,
    options: GeoJSONImportOptions,
    previousStatus: StatusEventDetail,
    failureMessage: string,
  ): Promise<string[]> {
    const behavior = options.behavior ?? "replace";
    const detail = {
      fc,
      mode: (behavior === "add" ? "add" : "load") as "load" | "add",
    };
    this.dispatchEvent(new CustomEvent(DrawEvent.Ingest, { detail }));
    const finalFc =
      detail.fc && detail.fc.type === "FeatureCollection" ? detail.fc : fc;

    try {
      const ids = await this._importWithController(finalFc, {
        ...options,
        behavior,
        fitToData: options.fitToData ?? false,
      });
      await this._syncStatusFromController({
        state: "ready",
        ready: true,
        busy: false,
        lastEvent: DrawEvent.Ingest,
        clearLastError: true,
      });
      return ids;
    } catch (cause) {
      this._emitError(
        {
          code: behavior === "add" ? "data_add_failed" : "data_load_failed",
          message: failureMessage,
          recoverable: true,
          cause,
        },
        {
          state: previousStatus.ready ? "ready" : previousStatus.state,
          featureCount: previousStatus.featureCount,
        },
      );
      throw cause;
    }
  }

  getLayers(): MapLayer[] {
    return this._controller?.getLayers() ?? [];
  }
  async setLayerVisibility(id: string, visible: boolean): Promise<void> {
    this._controller?.setLayerVisibility(id, visible);
  }
  async setLayerStyle(id: string, style: LayerStyle): Promise<void> {
    this._controller?.setLayerStyle(id, style);
  }
  async reorderLayers(ids: readonly string[]): Promise<void> {
    this._controller?.reorderLayers(ids);
  }
  async focusLayer(id: string): Promise<void> {
    await this._controller?.focusLayer(id);
  }
  async removeLayer(id: string): Promise<void> {
    await this._controller?.removeLayer(id);
  }
  getLayerCakeSession() {
    return this._controller?.getLayerCakeSession() ?? null;
  }
  async updateLayerCakeSession(update: LayerCakeSessionUpdate): Promise<void> {
    this._controller?.updateLayerCakeSession(update);
  }
  async saveLayerCakeSession(): Promise<void> {
    this._controller?.saveLayerCakeSession();
  }
  async cancelLayerCakeSession(): Promise<void> {
    this._controller?.cancelLayerCakeSession();
  }

  private async _importWithController(
    fc: FeatureCollection,
    options: GeoJSONImportOptions,
  ): Promise<string[]> {
    if (!this._controller) return [];

    const behavior = options.behavior ?? "replace";
    const fitToData = options.fitToData ?? false;
    const maybeController = this._controller as MapController & {
      importGeoJSON?: (
        fc: FeatureCollection,
        options?: GeoJSONImportOptions,
      ) => Promise<string[]>;
    };

    if (typeof maybeController.importGeoJSON === "function") {
      return maybeController.importGeoJSON(fc, {
        ...options,
        behavior,
        fitToData,
      });
    }

    if (behavior === "add") {
      return maybeController.addFeatures(fc);
    }

    await maybeController.loadGeoJSON(fc, fitToData);
    return [];
  }

  private async _exportWithController(
    options: GeoJSONExportOptions,
  ): Promise<FeatureCollection> {
    if (!this._controller) {
      return { type: "FeatureCollection", features: [] };
    }

    const maybeController = this._controller as MapController & {
      exportGeoJSON?: (
        options?: GeoJSONExportOptions,
      ) => Promise<FeatureCollection>;
    };

    if (typeof maybeController.exportGeoJSON === "function") {
      return maybeController.exportGeoJSON(options);
    }

    return maybeController.getGeoJSON();
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

  private _emitToolLifecycleEvent(
    eventName: ToolLifecycleEventName,
    detail: ToolEventDetail,
  ): void {
    if (eventName === GeoKitEvent.ToolStateChanged) {
      this._activeTool = detail.activeTool;
    }
    const event = new CustomEvent(eventName, {
      bubbles: true,
      composed: true,
      detail,
    });
    this._internalToolEvents.add(event);
    this.dispatchEvent(event);
  }

  private _emitToolTriggerResult(detail: ToolTriggerEventDetail): void {
    this.dispatchEvent(
      new CustomEvent(
        detail.handled
          ? "leaflet-geokit:tool-triggered"
          : "leaflet-geokit:tool-trigger-failed",
        {
          bubbles: true,
          composed: true,
          detail,
        },
      ),
    );
  }

  private _syncStatusFromController(options: {
    state: GeoKitStatusState;
    ready: boolean;
    busy: boolean;
    lastEvent?: string;
    clearLastError?: boolean;
  }): Promise<void> {
    const controller = this._controller as
      | (MapController & {
          getGeoJSON?: () => Promise<FeatureCollection>;
        })
      | null;
    if (!controller || typeof controller.getGeoJSON !== "function") {
      this._setStatus({
        state: options.state,
        ready: options.ready,
        busy: options.busy,
        featureCount: this._status.featureCount,
        lastEvent: options.lastEvent,
        lastError: options.clearLastError ? null : undefined,
      });
      return Promise.resolve();
    }

    return controller
      .getGeoJSON()
      .then((fc) => {
        this._setStatus({
          state: options.state,
          ready: options.ready,
          busy: options.busy,
          featureCount: fc.features.length,
          lastEvent: options.lastEvent,
          lastError: options.clearLastError ? null : undefined,
        });
      })
      .catch(() => {
        this._setStatus({
          state: options.state,
          ready: options.ready,
          busy: options.busy,
          lastEvent: options.lastEvent,
          lastError: options.clearLastError ? null : undefined,
        });
      });
  }

  private _emitError(
    detail: Omit<ErrorEventDetail, "timestamp">,
    options: {
      state: GeoKitStatusState;
      featureCount?: number;
      lastEvent?: string;
    },
  ): ErrorEventDetail {
    const errorDetail: ErrorEventDetail = {
      ...detail,
      timestamp: Date.now(),
    };

    this.dispatchEvent(
      new CustomEvent(DrawEvent.Error, { detail: errorDetail }),
    );
    this._emitDiagnostic(
      {
        code: errorDetail.code,
        message: errorDetail.message,
        recoverable: errorDetail.recoverable,
        severity: errorDetail.recoverable ? "warn" : "error",
        cause: errorDetail.cause,
        timestamp: errorDetail.timestamp,
      },
      {
        state: options.state,
        featureCount: options.featureCount,
        lastEvent: options.lastEvent ?? DrawEvent.Error,
      },
    );

    return errorDetail;
  }

  private _emitDiagnostic(
    detail: Omit<DiagnosticEventDetail, "state">,
    options: {
      state: GeoKitStatusState;
      featureCount?: number;
      lastEvent?: string;
    },
  ): DiagnosticEventDetail {
    const diagnostic: DiagnosticEventDetail = {
      ...detail,
      state: options.state,
    };

    this.dispatchEvent(
      new CustomEvent(GeoKitEvent.Diagnostic, { detail: diagnostic }),
    );
    this._setStatus({
      state: options.state,
      ready: options.state === "ready",
      busy: options.state === "initializing" || options.state === "loading",
      featureCount: options.featureCount ?? this._status.featureCount,
      lastEvent: options.lastEvent ?? GeoKitEvent.Diagnostic,
      lastError: {
        code: diagnostic.code,
        message: diagnostic.message,
        recoverable: diagnostic.recoverable,
        timestamp: diagnostic.timestamp,
      },
    });

    return diagnostic;
  }

  private _setStatus(
    update: Partial<Omit<StatusEventDetail, "timestamp" | "lastError">> & {
      lastError?: GeoKitDiagnosticSummary | null;
    },
  ): void {
    const next: StatusEventDetail = {
      ...this._status,
      ...update,
      lastError:
        update.lastError === null
          ? undefined
          : update.lastError !== undefined
            ? { ...update.lastError }
            : this._status.lastError
              ? { ...this._status.lastError }
              : undefined,
      timestamp: Date.now(),
    };

    this._status = next;
    this.dispatchEvent(
      new CustomEvent(GeoKitEvent.Status, {
        detail: this._cloneStatus(next),
      }),
    );
  }

  private _cloneStatus(status: StatusEventDetail): StatusEventDetail {
    return {
      ...status,
      lastError: status.lastError ? { ...status.lastError } : undefined,
    };
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
