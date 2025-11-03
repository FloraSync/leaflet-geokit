import type { Feature, FeatureCollection } from "geojson";
import type {
  LeafletDrawMapElementAPI,
  MapConfig,
  DrawControlsConfig,
} from "@src/types/public";
import { createLogger, type Logger, type LogLevel } from "@src/utils/logger";
import {
  injectLeafletStyles,
  configureLeafletDefaultIcons,
} from "@src/lib/leaflet-assets";
import { MapController } from "@src/lib/MapController";

export class LeafletDrawMapElement
  extends HTMLElement
  implements LeafletDrawMapElementAPI
{
  // Shadow DOM and container references
  private _root: ShadowRoot;
  private _container: HTMLDivElement;

  // Logging
  private _logger: Logger = createLogger("component:leaflet-draw", "debug");

  // Internal state mirrors for attributes/properties
  private _latitude = 0;
  private _longitude = 0;
  private _zoom = 2;
  private _minZoom?: number;
  private _maxZoom?: number;
  private _tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  private _tileAttribution?: string;
  private _readOnly = false;
  private _logLevel: LogLevel = "debug";
  private _devOverlay = false;
  private _polygonAllowIntersection = false;

  // Controller
  private _controller: MapController | null = null;

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
      marker: this.hasAttribute("draw-marker"),
      edit: this.hasAttribute("edit-features"),
      delete: this.hasAttribute("delete-features"),
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
    };
  }

  // Lifecycle
  async connectedCallback(): Promise<void> {
    this._logger.debug("connectedCallback", this._currentConfig());
    // Inject Leaflet core and Draw CSS into Shadow DOM, and set default marker URLs
    try {
      injectLeafletStyles(this._root);
      configureLeafletDefaultIcons();
    } catch (err) {
      this._logger.warn("leaflet-style-inject-failed", err as any);
    }

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
    });

    await this._controller.init();
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
      "read-only",
      "log-level",
      "dev-overlay",
      // draw controls
      "draw-polygon",
      "draw-polyline",
      "draw-rectangle",
      "draw-circle",
      "draw-marker",
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
        this._tileUrl = value ?? this._tileUrl;
        break;
      case "tile-attribution":
        this._tileAttribution = value ?? undefined;
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
        name === "tile-url" ||
        name === "tile-attribution" ||
        name === "min-zoom" ||
        name === "max-zoom" ||
        name === "read-only" ||
        name === "dev-overlay" ||
        name === "log-level" ||
        name.startsWith("draw-") ||
        name === "edit-features" ||
        name === "delete-features"
      ) {
        // For now, re-init controller to apply structural changes
        void this._controller.destroy().then(() => this._controller!.init());
      }
    }
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
  }

  get tileAttribution(): string | undefined {
    return this._tileAttribution;
  }
  set tileAttribution(v: string | undefined) {
    this._tileAttribution = v;
    this._reflect("tile-attribution", v ?? null);
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
    };
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
