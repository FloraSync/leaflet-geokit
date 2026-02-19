import * as BundledL from "leaflet";
import "leaflet-draw";
import "leaflet-ruler";
import type { Feature, FeatureCollection } from "geojson";
import type {
  DrawControlsConfig,
  MapConfig,
  MeasurementSystem,
} from "@src/types/public";
import { createLogger, type Logger } from "@src/utils/logger";
import { FeatureStore } from "@src/lib/FeatureStore";
import { registerLayerCakeTool } from "@src/lib/draw/toolbar-patch";
import { DrawCake, ensureDrawCakeRegistered } from "@src/lib/draw/L.Draw.Cake";
import { ensureDrawMoveRegistered } from "@src/lib/draw/L.Draw.Move";
import type { DrawMove } from "@src/lib/draw/L.Draw.Move";
import { LayerCakeManager } from "@src/lib/layer-cake/LayerCakeManager";
import layerCakeIconSvg from "@src/assets/layer-cake.svg?raw";
import moveToolIconSvg from "@src/assets/move-tool.svg?raw";
import {
  expandMultiGeometries,
  mergePolygons,
  isPolygon,
  isMultiPolygon,
} from "@src/utils/geojson";
import { computePreciseDistance, magicRound } from "@src/utils/geodesic";
import {
  getRulerOptions,
  measurementSystemDescriptions,
} from "@src/utils/ruler";
import { assertDrawPresent } from "@src/utils/leaflet-guards";

let rulerPrecisionPatched = false;

export interface MapControllerCallbacks {
  onReady?: (detail: { bounds?: [[number, number], [number, number]] }) => void;
  onCreated?: (detail: {
    id: string;
    layerType: "polygon" | "polyline" | "rectangle" | "circle" | "marker";
    geoJSON: Feature;
  }) => void;
  onEdited?: (detail: { ids: string[]; geoJSON: FeatureCollection }) => void;
  onDeleted?: (detail: { ids: string[]; geoJSON: FeatureCollection }) => void;
  onError?: (detail: { message: string; cause?: unknown }) => void;
}

export interface MapControllerOptions {
  container: HTMLElement;
  map: MapConfig;
  controls: DrawControlsConfig;
  readOnly?: boolean;
  logger?: Logger;
  callbacks?: MapControllerCallbacks;
  /** Optional injected Leaflet namespace to use instead of bundled import. */
  leaflet?: typeof BundledL;
  /** Prefer external Leaflet if available (falls back to bundled if missing/invalid). */
  useExternalLeaflet?: boolean;
}

/**
 * MapController: initializes Leaflet map + Draw, bridges events, and manages data via FeatureStore.
 */
export class MapController {
  private container: HTMLElement;
  private logger: Logger;
  private options: MapControllerOptions;

  // Active Leaflet namespace (injected or bundled fallback)
  private L: typeof BundledL;

  // Data store (id-centric)
  private store: FeatureStore;

  // Leaflet entities
  private map: BundledL.Map | null = null;
  private drawnItems: BundledL.FeatureGroup | null = null;
  // Keep 'any' here to avoid type friction across different @types/leaflet-draw versions
  private drawControl: any | null = null;
  private rulerControl: BundledL.Control.Ruler | null = null;
  private measurementControl: BundledL.Control | null = null;
  private measurementSystem: MeasurementSystem = "metric";
  private measurementModalOverlay: HTMLDivElement | null = null;
  private measurementModalDialog: HTMLDivElement | null = null;
  private measurementModalRadios: Partial<
    Record<MeasurementSystem, HTMLInputElement>
  > = {};
  private measurementModalKeydownHandler: ((e: KeyboardEvent) => void) | null =
    null;

  // Detacher for our polygon close-on-first-vertex patch
  private detachPolygonFinishPatch: (() => void) | null = null;

  // Context menu for vertex deletion
  private vertexMenuEl: HTMLDivElement | null = null;
  private vertexMenuCleanup: (() => void) | null = null;
  private activeCakeSession: LayerCakeManager | null = null;

  // Move tool UI elements
  private moveConfirmationUI: HTMLDivElement | null = null;
  private activeMoveHandler: DrawMove | null = null;

  constructor(opts: MapControllerOptions) {
    this.options = opts;
    this.container = opts.container;
    this.logger = (opts.logger ?? createLogger("controller", "debug")).child(
      "map",
    );
    this.L = this.resolveLeaflet(opts);
    this.store = new FeatureStore(this.logger.child("store"));
    this.logger.debug("ctor", {
      config: opts.map,
      controls: opts.controls,
      readOnly: opts.readOnly,
      useExternalLeaflet: opts.useExternalLeaflet,
    });

    ensureDrawCakeRegistered(this.L);
    ensureDrawMoveRegistered(this.L);
    registerLayerCakeTool(this.L);
  }

  private resolveLeaflet(opts: MapControllerOptions): typeof BundledL {
    const preferExternal = opts.useExternalLeaflet;
    if (!preferExternal) {
      return BundledL;
    }

    if (opts.leaflet && assertDrawPresent(opts.leaflet)) {
      this.logger.debug("leaflet-runtime:external-injected");
      return opts.leaflet;
    }

    const globalL = (globalThis as any).L as typeof BundledL | undefined;
    if (globalL && assertDrawPresent(globalL)) {
      this.logger.debug("leaflet-runtime:external-global");
      return globalL;
    }

    this.logger.warn("leaflet-runtime:external-fallback-bundled", {
      message:
        "External Leaflet requested but Draw APIs were missing; falling back to bundled Leaflet/Draw",
    });
    return BundledL;
  }

  // ---------------- Lifecycle ----------------

  async init(): Promise<void> {
    const t0 = performance.now?.() ?? Date.now();
    try {
      // Remove any previous instance
      await this.destroy();

      // Create the map
      const {
        latitude,
        longitude,
        zoom,
        minZoom,
        maxZoom,
        tileUrl,
        tileAttribution,
        preferCanvas = true, // Default to Canvas rendering for better performance
        useExternalLeaflet,
      } = this.options.map;
      const center: [number, number] = [latitude, longitude];
      const Lns = this.L;

      if (useExternalLeaflet) {
        assertDrawPresent(Lns, {
          onError: (message: string) =>
            this.logger.warn("external-leaflet-missing-draw", { message }),
        });
      }
      this.map = Lns.map(this.container, {
        zoomControl: true,
        preferCanvas,
      }).setView(center, zoom);

      // Add tile layer
      Lns.tileLayer(tileUrl, {
        attribution: tileAttribution,
        minZoom,
        maxZoom,
      }).addTo(this.map);

      // FeatureGroup for all drawn layers
      this.drawnItems = Lns.featureGroup().addTo(this.map);

      // Draw control
      const drawOptions = this.buildDrawOptions(
        this.options.controls,
        !!this.options.readOnly,
      );
      const DrawCtor = (Lns.Control as any).Draw; // tolerate type friction
      this.drawControl = new DrawCtor(drawOptions);
      this.map.addControl(this.drawControl);
      this.applyLayerCakeToolbarIcon();
      this.applyMoveToolbarIcon();

      if (this.options.controls.ruler) {
        this.logger.debug("init:ruler", {
          available: typeof Lns.control.ruler === "function",
        });
        if (typeof Lns.control.ruler === "function") {
          this.addRulerControl();
          this.installMeasurementSettingsControl();
        } else {
          this.logger.warn("init:ruler:missing", {
            msg: "L.control.ruler is not defined",
          });
        }
      }

      // Patch known Leaflet.draw bugs (e.g., readableArea strict-mode variable)
      this.patchLeafletDrawBugs();

      // Patch: reliably allow closing polygons by clicking the first vertex (Shadow DOM safe)
      this.installPolygonFinishPatch();

      // Ensure Leaflet measures the container after layout
      this.map.invalidateSize();
      setTimeout(() => {
        try {
          this.map?.invalidateSize();
        } catch {
          // Ignore invalidateSize errors - this is just a UI refresh
        }
      }, 0);

      // Bind draw events
      this.bindDrawEvents();

      const elapsed = (performance.now?.() ?? Date.now()) - t0;
      this.logger.debug("init:ready", { elapsedMs: Math.round(elapsed) });

      // Announce ready with current bounds (if any)
      const b = this.store.bounds();
      this.options.callbacks?.onReady?.(b ? { bounds: b } : {});
    } catch (err) {
      this._error("Failed to initialize Leaflet map", err);
    }
  }

  async destroy(): Promise<void> {
    try {
      if (this.map) {
        this.map.off();
        this.map.remove();
      }
    } catch (err) {
      this._error("Failed to remove Leaflet map", err);
    }

    // Detach polygon finish patch (if installed)
    try {
      this.detachPolygonFinishPatch?.();
    } catch {
      // Ignore errors when detaching polygon finish patch during cleanup
    }
    this.detachPolygonFinishPatch = null;

    // Cleanup vertex menu if present
    try {
      this.vertexMenuCleanup?.();
    } catch {
      // Ignore errors when cleaning up vertex menu during destruction
    }
    this.vertexMenuEl = null;
    this.vertexMenuCleanup = null;

    // Cleanup move confirmation UI if present
    try {
      this.hideMoveConfirmationUI();
    } catch {
      // Ignore errors when cleaning up move confirmation UI during destruction
    }

    this.drawControl = null;
    this.rulerControl = null;
    this.measurementControl = null;
    this.removeMeasurementModal();
    this.drawnItems = null;

    try {
      this.activeCakeSession?.destroy();
    } catch {
      // Ignore errors when cleaning up an in-progress cake session
    }
    this.activeCakeSession = null;

    this.map = null;
  }

  // ---------------- Public API (data) ----------------

  async getGeoJSON(): Promise<FeatureCollection> {
    return this.store.toFeatureCollection();
  }

  async loadGeoJSON(
    fc: FeatureCollection,
    fitToData: boolean = false,
  ): Promise<void> {
    if (!this.map || !this.drawnItems) return;
    // Clear existing
    await this.clearLayers();

    // Add new features into store + map layers
    const normalized = expandMultiGeometries(fc);
    const ids = this.store.add(normalized);
    const layers = this.L.geoJSON(normalized);
    let i = 0;
    layers.eachLayer((layer: any) => {
      (layer as any)._fid = ids[i] ?? ids[ids.length - 1];
      this.drawnItems!.addLayer(layer);
      this.installVertexContextMenu(layer);
      i++;
    });

    this.logger.debug("loadGeoJSON", {
      count: normalized.features.length,
      ids,
    });

    if (fitToData) {
      await this.fitBoundsToData();
    }
  }

  async clearLayers(): Promise<void> {
    if (this.drawnItems) {
      this.drawnItems.clearLayers();
    }
    this.store.clear();
  }

  async addFeatures(fc: FeatureCollection): Promise<string[]> {
    if (!this.map || !this.drawnItems) return [];
    const normalized = expandMultiGeometries(fc);
    const ids = this.store.add(normalized);
    const layers = this.L.geoJSON(normalized);
    let i = 0;
    layers.eachLayer((layer: any) => {
      (layer as any)._fid = ids[i] ?? ids[ids.length - 1];
      this.drawnItems!.addLayer(layer);
      this.installVertexContextMenu(layer);
      i++;
    });
    return ids;
  }

  async updateFeature(id: string, feature: Feature): Promise<void> {
    this.store.update(id, feature);
    // Replace layer visually if present: naive approach is to re-add a new layer, but for now we only update store;
    // a later pass will sync layer geometries precisely.
  }

  async removeFeature(id: string): Promise<void> {
    // Remove matching layer(s)
    if (this.drawnItems) {
      this.drawnItems.eachLayer((layer: any) => {
        if ((layer as any)._fid === id) {
          this.drawnItems!.removeLayer(layer);
        }
      });
    }
    this.store.remove(id);
  }

  // ---------------- Public API (map) ----------------

  async fitBoundsToData(paddingRatio: number = 0.05): Promise<void> {
    if (!this.map) return;
    const b = this.store.bounds();
    if (!b) return;
    const boundsLiteral = b as unknown as BundledL.LatLngBoundsLiteral;
    const bounds = this.L.latLngBounds(boundsLiteral);
    // Compute padded bounds by interpolating
    if (paddingRatio > 0) {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const latPad = (ne.lat - sw.lat) * paddingRatio;
      const lngPad = (ne.lng - sw.lng) * paddingRatio;
      const padded = this.L.latLngBounds(
        this.L.latLng(sw.lat - latPad, sw.lng - lngPad),
        this.L.latLng(ne.lat + latPad, ne.lng + lngPad),
      );
      this.map.fitBounds(padded);
    } else {
      this.map.fitBounds(bounds);
    }
  }

  async fitBounds(
    boundsTuple: [[number, number], [number, number]],
    paddingRatio: number = 0.05,
  ): Promise<void> {
    if (!this.map) return;
    const bounds = (this.L as any).latLngBounds(boundsTuple as any);
    if (paddingRatio > 0) {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const latPad = (ne.lat - sw.lat) * paddingRatio;
      const lngPad = (ne.lng - sw.lng) * paddingRatio;
      const padded = (this.L as any).latLngBounds(
        (this.L as any).latLng(sw.lat - latPad, sw.lng - lngPad),
        (this.L as any).latLng(ne.lat + latPad, ne.lng + lngPad),
      );
      this.map.fitBounds(padded);
    } else {
      this.map.fitBounds(bounds);
    }
  }

  async setView(lat: number, lng: number, zoom?: number): Promise<void> {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom ?? this.map.getZoom());
  }

  /**
   * Merge all visible polygon features into a single polygon feature.
   * This removes the original features and adds a new feature with the merged geometry.
   *
   * @param options Optional configuration for the merge operation
   * @returns The ID of the newly created merged feature, or null if no polygons to merge
   */
  async mergeVisiblePolygons(options?: {
    /** Properties to apply to the merged feature (defaults to properties from first polygon) */
    properties?: Record<string, any>;
  }): Promise<string | null> {
    if (!this.map || !this.drawnItems) return null;

    // Get all current features
    const fc = await this.getGeoJSON();

    // Filter for polygon features only
    const polygonFeatures = fc.features.filter((feature) => {
      const geom = feature.geometry;
      return geom && (isPolygon(geom) || isMultiPolygon(geom));
    });

    if (polygonFeatures.length <= 1) {
      // No polygons or just one polygon - nothing to merge
      if (polygonFeatures.length === 1) {
        const existingId = (polygonFeatures[0] as any).id;
        return existingId ? String(existingId) : null;
      }
      return null;
    }

    // Merge the polygons
    const mergedFeature = mergePolygons(polygonFeatures, options?.properties);
    if (!mergedFeature) return null;

    // Get IDs of original polygons to remove - extract from feature.id
    const idsToRemove: string[] = [];
    for (const feature of polygonFeatures) {
      const id = (feature as any).id;
      if (id) idsToRemove.push(String(id));
    }

    // Remove original polygons
    for (const id of idsToRemove) {
      await this.removeFeature(id);
    }

    // Add the merged polygon as a new feature
    const [newFeatureId] = await this.addFeatures({
      type: "FeatureCollection",
      features: [mergedFeature],
    });

    return newFeatureId || null;
  }

  setRulerUnits(system: MeasurementSystem): void {
    if (this.measurementSystem === system) return;
    this.measurementSystem = system;
    this.logger.debug("ruler:units", { system });
    this.syncMeasurementModalState();
    this.rebuildRulerControl();
  }

  // ---------------- Internals ----------------

  private buildDrawOptions(
    controls: DrawControlsConfig,
    readOnly: boolean,
  ): BundledL.Control.DrawOptions {
    // Define explicit options for each tool to ensure consistent behavior.
    const draw: Record<string, any> = {
      polygon: controls.polygon
        ? {
            allowIntersection:
              this.options.map.polygonAllowIntersection ?? false, // Disallow self-intersections by default
            showArea: true, // Display area tooltip while drawing
            shapeOptions: {
              color: "#3388ff", // Default shape color
            },
          }
        : false,
      polyline: controls.polyline
        ? {
            shapeOptions: {
              color: "#3388ff",
            },
          }
        : false,
      rectangle: controls.rectangle
        ? {
            shapeOptions: {
              color: "#3388ff",
            },
          }
        : false,
      circle: controls.circle
        ? {
            shapeOptions: {
              color: "#3388ff",
            },
          }
        : false,
      cake: controls.cake
        ? {
            shapeOptions: {
              color: "#8A2BE2", // Violet color for distinction
              fillOpacity: 0.2,
            },
          }
        : false,
      marker: controls.marker ? {} : false,
      move: controls.move
        ? {
            featureGroup: this.drawnItems as any,
          }
        : false,
    };

    // Edit toolbar
    let edit: any = {
      featureGroup: this.drawnItems as any,
    };
    if (!controls.edit) {
      edit = false;
    } else {
      if (controls.delete === false) {
        edit.remove = false;
      }
    }

    if (readOnly) {
      // Disable all drawing/editing/removing
      return {
        draw: false,
        edit: false,
      } as any;
    }

    return { draw, edit } as any;
  }

  private applyLayerCakeToolbarIcon(): void {
    if (!this.container) return;

    const applyIcon = () => {
      const button = this.container.querySelector(
        "a.leaflet-draw-draw-cake",
      ) as HTMLAnchorElement | null;
      if (!button) return;

      // Disable Leaflet.draw sprite sheet background for this button.
      button.style.setProperty("background-image", "none", "important");
      button.style.setProperty("background-color", "#fff", "important");

      // Render our custom icon as an explicit child element so it cannot fall back to sprites.
      button.style.setProperty("position", "relative", "important");
      let icon = button.querySelector(
        ".leaflet-geokit-cake-icon",
      ) as HTMLSpanElement | null;
      if (!icon) {
        icon = document.createElement("span");
        icon.className = "leaflet-geokit-cake-icon";
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);
      }

      icon.style.setProperty("position", "absolute", "important");
      icon.style.setProperty("display", "block", "important");
      icon.style.setProperty("left", "50%", "important");
      icon.style.setProperty("top", "50%", "important");
      icon.style.setProperty("width", "18px", "important");
      icon.style.setProperty("height", "18px", "important");
      icon.style.setProperty("transform", "translate(-50%, -50%)", "important");
      icon.style.setProperty("pointer-events", "none", "important");

      // Use inline SVG markup so rendering does not depend on URL asset resolution.
      if (!icon.firstElementChild) {
        icon.innerHTML = layerCakeIconSvg;
      }
      const svg = icon.firstElementChild as SVGElement | null;
      if (svg) {
        svg.style.setProperty("width", "100%", "important");
        svg.style.setProperty("height", "100%", "important");
        svg.style.setProperty("display", "block", "important");
      }
    };

    applyIcon();
    setTimeout(applyIcon, 0);
  }

  private applyMoveToolbarIcon(): void {
    if (!this.container) return;

    const applyIcon = () => {
      const button = this.container.querySelector(
        "a.leaflet-draw-draw-move",
      ) as HTMLAnchorElement | null;
      if (!button) return;

      // Disable Leaflet.draw sprite sheet background for this button.
      button.style.setProperty("background-image", "none", "important");
      button.style.setProperty("background-color", "#fff", "important");

      // Render our custom icon as an explicit child element so it cannot fall back to sprites.
      button.style.setProperty("position", "relative", "important");
      let icon = button.querySelector(
        ".leaflet-geokit-move-icon",
      ) as HTMLSpanElement | null;
      if (!icon) {
        icon = document.createElement("span");
        icon.className = "leaflet-geokit-move-icon";
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);
      }

      icon.style.setProperty("position", "absolute", "important");
      icon.style.setProperty("display", "block", "important");
      icon.style.setProperty("left", "50%", "important");
      icon.style.setProperty("top", "50%", "important");
      icon.style.setProperty("width", "18px", "important");
      icon.style.setProperty("height", "18px", "important");
      icon.style.setProperty("transform", "translate(-50%, -50%)", "important");
      icon.style.setProperty("pointer-events", "none", "important");

      // Use inline SVG markup so rendering does not depend on URL asset resolution.
      if (!icon.firstElementChild) {
        icon.innerHTML = moveToolIconSvg;
      }
      const svg = icon.firstElementChild as SVGElement | null;
      if (svg) {
        svg.style.setProperty("width", "100%", "important");
        svg.style.setProperty("height", "100%", "important");
        svg.style.setProperty("display", "block", "important");
      }
    };

    applyIcon();
    setTimeout(applyIcon, 0);
  }

  /* c8 ignore start */
  private addRulerControl(): void {
    if (!this.map) return;
    this.installRulerPrecisionPatch();
    const options = getRulerOptions(this.measurementSystem);
    this.rulerControl = this.L.control.ruler(options);
    this.map.addControl(this.rulerControl);
  }

  private installRulerPrecisionPatch(): void {
    if (rulerPrecisionPatched) return;
    const RulerCtor = (this.L.Control as any).Ruler;
    if (!RulerCtor || typeof RulerCtor !== "function") return;
    const proto = RulerCtor.prototype;
    const original = proto._calculateBearingAndDistance;
    if (typeof original !== "function") return;

    const logger = this.logger;

    proto._calculateBearingAndDistance = function patchedPrecision() {
      original.call(this);
      try {
        const start = this._clickedLatLong;
        const end = this._movingLatLong ?? this._clickedLatLong;
        if (!start || !end) return;

        const { meters, bearingDegrees } = computePreciseDistance(
          start.lat,
          start.lng,
          end.lat,
          end.lng,
        );
        const kilometers = meters / 1000;
        const conversion =
          typeof this.options?.lengthUnit?.factor === "number"
            ? this.options.lengthUnit.factor
            : 1;
        const distance = magicRound(kilometers * conversion);

        this._result = this._result || {};
        this._result.Distance = distance;
        this._result.Bearing = bearingDegrees;
        this._result.meters = meters;
      } catch (err) {
        logger?.warn("ruler:precision-patch", err as any);
      }
    };

    rulerPrecisionPatched = true;
  }

  private rebuildRulerControl(): void {
    if (!this.map || !this.options.controls.ruler) return;
    if (this.rulerControl) {
      try {
        this.map.removeControl(this.rulerControl);
      } catch (err) {
        this.logger.warn("ruler:remove-failed", err as any);
      }
      this.rulerControl = null;
    }
    this.addRulerControl();
  }

  /* c8 ignore next */
  private installMeasurementSettingsControl(): void {
    if (!this.map || this.measurementControl) return;
    const controller = this;
    const SettingsControl = (this.L.Control as any).extend({
      options: { position: "topleft" },
      onAdd() {
        const container = controller.L.DomUtil.create(
          "div",
          "leaflet-bar leaflet-ruler-settings-control",
        );
        const button = controller.L.DomUtil.create(
          "button",
          "leaflet-ruler-settings-button",
          container,
        );
        button.type = "button";
        button.title = "Measurement settings";
        button.setAttribute("aria-label", "Measurement settings");
        button.addEventListener("click", (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          controller.toggleMeasurementModal(true);
        });
        controller.L.DomEvent.disableClickPropagation(container);
        controller.L.DomEvent.disableScrollPropagation(container);
        return container;
      },
    }) as typeof BundledL.Control;
    this.measurementControl = new SettingsControl();
    this.map.addControl(this.measurementControl);
  }

  /* c8 ignore next */
  private ensureMeasurementModal(): HTMLDivElement {
    if (this.measurementModalOverlay) return this.measurementModalOverlay;
    if (typeof document === "undefined") {
      throw new Error("Measurement modal requires a browser environment");
    }
    const overlay = document.createElement("div");
    overlay.className = "leaflet-ruler-modal-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const dialog = document.createElement("div");
    dialog.className = "leaflet-ruler-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.tabIndex = -1;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.toggleMeasurementModal(false);
      }
    });

    const title = document.createElement("h2");
    title.className = "leaflet-ruler-modal-title";
    title.textContent = "Measurement Units";
    dialog.appendChild(title);

    const description = document.createElement("p");
    description.className = "leaflet-ruler-modal-description";
    description.textContent =
      "Choose how the measurement tool reports distances.";
    dialog.appendChild(description);

    const optionsList = document.createElement("div");
    optionsList.className = "leaflet-ruler-modal-options";
    dialog.appendChild(optionsList);

    (["metric", "imperial"] as MeasurementSystem[]).forEach((system) => {
      const label = document.createElement("label");
      label.className = "leaflet-ruler-modal-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "leaflet-ruler-units";
      input.value = system;
      input.addEventListener("change", () => {
        if (input.checked) {
          this.setRulerUnits(system);
        }
      });

      const span = document.createElement("span");
      span.textContent = measurementSystemDescriptions[system];

      label.appendChild(input);
      label.appendChild(span);
      optionsList.appendChild(label);
      this.measurementModalRadios[system] = input;
    });

    const actions = document.createElement("div");
    actions.className = "leaflet-ruler-modal-actions";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "leaflet-ruler-modal-close";
    close.textContent = "Close";
    close.addEventListener("click", () => this.toggleMeasurementModal(false));
    actions.appendChild(close);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    this.container.appendChild(overlay);
    this.measurementModalOverlay = overlay;
    this.measurementModalDialog = dialog;
    this.syncMeasurementModalState();
    return overlay;
  }

  /* c8 ignore next */
  private toggleMeasurementModal(show: boolean): void {
    if (!show) {
      if (this.measurementModalOverlay) {
        this.measurementModalOverlay.classList.remove("is-open");
        this.measurementModalOverlay.setAttribute("aria-hidden", "true");
      }
      this.detachMeasurementModalKeydown();
      return;
    }

    const overlay = this.ensureMeasurementModal();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    this.syncMeasurementModalState();
    this.attachMeasurementModalKeydown();
    this.measurementModalDialog?.focus();
  }

  private syncMeasurementModalState(): void {
    for (const [system, input] of Object.entries(this.measurementModalRadios)) {
      if (input) {
        input.checked = system === this.measurementSystem;
      }
    }
  }

  /* c8 ignore next */
  private removeMeasurementModal(): void {
    if (this.measurementModalOverlay) {
      this.measurementModalOverlay.remove();
    }
    this.measurementModalOverlay = null;
    this.measurementModalDialog = null;
    this.measurementModalRadios = {};
    this.detachMeasurementModalKeydown();
  }

  /* c8 ignore next */
  private attachMeasurementModalKeydown(): void {
    if (
      this.measurementModalKeydownHandler ||
      typeof document === "undefined"
    ) {
      return;
    }
    this.measurementModalKeydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.toggleMeasurementModal(false);
      }
    };
    document.addEventListener("keydown", this.measurementModalKeydownHandler);
  }

  /* c8 ignore next */
  private detachMeasurementModalKeydown(): void {
    if (
      !this.measurementModalKeydownHandler ||
      typeof document === "undefined"
    ) {
      return;
    }
    document.removeEventListener(
      "keydown",
      this.measurementModalKeydownHandler,
    );
    this.measurementModalKeydownHandler = null;
  }
  /* c8 ignore end */

  /**
   * Workaround: In some environments (notably within Shadow DOM), clicking the first vertex
   * to close a polygon can be unreliable due to event retargeting/hit testing.
   * This patch listens for map clicks while the polygon draw handler is enabled and,
   * if the click is within a small pixel radius of the first vertex, it triggers finishShape().
   */
  private installPolygonFinishPatch(): void {
    if (!this.map || !this.drawControl) return;

    // Remove any existing patch first
    try {
      this.detachPolygonFinishPatch?.();
    } catch {
      // Ignore errors when detaching existing polygon patch
    }
    this.detachPolygonFinishPatch = null;

    const map: any = this.map as any;
    const drawTb: any = (this.drawControl as any)?._toolbars?.draw;
    if (!drawTb) return;

    // Guard if polygon mode isn't available
    const hasPolygon = !!drawTb._modes?.polygon?.handler;
    if (!hasPolygon) return;

    const CLICK_HIT_PX = 10; // be conservative to avoid accidental closes

    const onClick = (e: any) => {
      try {
        const handler: any = drawTb._modes?.polygon?.handler;
        if (!handler || !handler._enabled) return;

        const markers: any[] = handler._markers;
        // Only activate after 4+ vertices to avoid premature closures on early points
        if (!Array.isArray(markers) || markers.length < 4) return;

        const firstLL = markers[0]?.getLatLng?.();
        if (!firstLL) return;

        const pFirst = map.latLngToContainerPoint(firstLL);
        const pClick = map.latLngToContainerPoint(e.latlng);
        const dist = Math.hypot(pFirst.x - pClick.x, pFirst.y - pClick.y);

        if (
          dist <= CLICK_HIT_PX &&
          typeof handler._finishShape === "function"
        ) {
          // Prevent Draw from adding an extra vertex; finish the polygon instead
          e.originalEvent?.preventDefault?.();
          e.originalEvent?.stopPropagation?.();
          handler._finishShape();
        }
      } catch (err) {
        this._error("polygon-finish-patch", err);
      }
    };

    map.on("click", onClick);
    this.detachPolygonFinishPatch = () => {
      try {
        map.off("click", onClick);
      } catch {
        // Ignore errors when removing map click event listener
      }
    };
  }

  private patchLeafletDrawBugs(): void {
    try {
      const anyL: any = this.L as any;
      const GU = anyL.GeometryUtil;
      if (!GU) return;
      // Replace readableArea with a strict-mode safe implementation
      const defaults = {
        km: 2,
        ha: 2,
        m: 0,
        mi: 2,
        ac: 2,
        yd: 0,
        ft: 0,
        nm: 2,
      };
      const fmt =
        GU.formattedNumber?.bind(GU) ??
        ((num: number, p: number) => Number(num).toFixed(p));
      GU.readableArea = (
        area: number,
        metric?: boolean | string | string[],
        precision?: any,
      ): string => {
        const opts = anyL.Util?.extend
          ? anyL.Util.extend({}, defaults, precision || {})
          : { ...defaults, ...(precision || {}) };
        let out: string;
        if (metric) {
          let units: string[] = ["ha", "m"];
          const t = typeof metric;
          if (t === "string") units = [metric as string];
          else if (t !== "boolean")
            units = Array.isArray(metric) ? (metric as string[]) : units;
          if (area >= 1e6 && units.indexOf("km") !== -1)
            out = `${fmt(1e-6 * area, opts.km)} km²`;
          else if (area >= 1e4 && units.indexOf("ha") !== -1)
            out = `${fmt(1e-4 * area, opts.ha)} ha`;
          else out = `${fmt(area, opts.m)} m²`;
        } else {
          area = area / 0.836127; // square yards
          if (area >= 3097600) out = `${fmt(area / 3097600, opts.mi)} mi²`;
          else if (area >= 4840) out = `${fmt(area / 4840, opts.ac)} acres`;
          else out = `${fmt(area, opts.yd)} yd²`;
        }
        return out;
      };
    } catch (err) {
      this.logger.warn("leaflet-draw-patch:readableArea", err as any);
    }

    // Patch Leaflet.draw circle editing strict-mode bug:
    // L.Edit.Circle.prototype._resize assigns to an undeclared `radius` variable.
    try {
      const anyL: any = this.L as any;
      const EditCircle = anyL.Edit?.Circle;
      const DrawEvent = anyL.Draw?.Event;
      const GU = anyL.GeometryUtil;
      if (!EditCircle?.prototype?._resize || !DrawEvent || !GU) return;

      EditCircle.prototype._resize = function patchedCircleResize(latlng: any) {
        const center = this._moveMarker.getLatLng();
        const radius = GU.isVersion07x()
          ? center.distanceTo(latlng)
          : this._map.distance(center, latlng);

        this._shape.setRadius(radius);

        try {
          if (
            this._map?.editTooltip &&
            this._map?._editTooltip?.updateContent
          ) {
            this._map._editTooltip.updateContent({
              text:
                anyL.drawLocal.edit.handlers.edit.tooltip.subtext +
                "<br />" +
                anyL.drawLocal.edit.handlers.edit.tooltip.text,
              subtext:
                anyL.drawLocal.draw.handlers.circle.radius +
                ": " +
                GU.readableDistance(
                  radius,
                  true,
                  this.options.feet,
                  this.options.nautic,
                ),
            });
          }
        } catch {
          // Ignore tooltip update errors in patched circle resize
        }

        this._map.fire(DrawEvent.EDITRESIZE, { layer: this._shape });
      };
    } catch (err) {
      this.logger.warn("leaflet-draw-patch:circle-resize", err as any);
    }
  }

  private bindDrawEvents(): void {
    if (!this.map || !this.drawnItems) return;

    // CREATED: single layer with layerType
    this.map.on((this.L as any).Draw.Event.CREATED, (e: any) => {
      try {
        const { layer, layerType } = e;

        if (layerType === DrawCake.TYPE) {
          try {
            this.activeCakeSession?.destroy();
          } catch {
            // Ignore previous session cleanup failures
          }

          this.activeCakeSession = new LayerCakeManager(
            this.map!,
            layer as BundledL.Circle,
            (featureCollection) => {
              if (!this.drawnItems) return;
              const ids = this.store.add(featureCollection);
              const layers = this.L.geoJSON(featureCollection);

              let i = 0;
              layers.eachLayer((createdLayer: any) => {
                const id = ids[i] ?? ids[ids.length - 1];
                (createdLayer as any)._fid = id;
                this.drawnItems!.addLayer(createdLayer);
                this.installVertexContextMenu(createdLayer);
                this.options.callbacks?.onCreated?.({
                  id,
                  layerType: "polygon",
                  geoJSON: createdLayer.toGeoJSON(),
                });
                i++;
              });

              this.activeCakeSession = null;
            },
            this.measurementSystem,
          );

          return;
        }

        this.drawnItems!.addLayer(layer);
        const feat = layer.toGeoJSON() as Feature;
        const ids = this.store.add({
          type: "FeatureCollection",
          features: [feat],
        });
        const id = ids[0];
        (layer as any)._fid = id;
        this.installVertexContextMenu(layer);

        this.options.callbacks?.onCreated?.({ id, layerType, geoJSON: feat });
      } catch (err) {
        this._error("onCreated handler failed", err);
      }
    });

    // EDITED: multiple layers in a LayerGroup
    this.map.on((this.L as any).Draw.Event.EDITED, (e: any) => {
      try {
        const ids: string[] = [];
        const layers: any = e.layers;
        layers.eachLayer((layer: any) => {
          const feat = layer.toGeoJSON() as Feature;
          const id = (layer as any)._fid as string | undefined;
          if (id) {
            this.store.update(id, feat);
            ids.push(id);
          } else {
            // unknown layer, add it
            const newId = this.store.add({
              type: "FeatureCollection",
              features: [feat],
            })[0];
            (layer as any)._fid = newId;
            ids.push(newId);
          }
        });

        this.options.callbacks?.onEdited?.({
          ids,
          geoJSON: this.store.toFeatureCollection(),
        });
      } catch (err) {
        this._error("onEdited handler failed", err);
      }
    });

    // DELETED: multiple layers in a LayerGroup
    this.map.on((this.L as any).Draw.Event.DELETED, (e: any) => {
      try {
        const ids: string[] = [];
        const layers: any = e.layers;
        layers.eachLayer((layer: any) => {
          const id = (layer as any)._fid as string | undefined;
          if (id) {
            ids.push(id);
            this.store.remove(id);
          }
        });

        this.options.callbacks?.onDeleted?.({
          ids,
          geoJSON: this.store.toFeatureCollection(),
        });
      } catch (err) {
        this._error("onDeleted handler failed", err);
      }
    });

    // MOVEEND: user has finished dragging a feature, show Save/Cancel UI
    this.map.on("draw:moveend", (e: any) => {
      try {
        this.showMoveConfirmationUI(e.layer, e.originalGeoJSON, e.newGeoJSON);
      } catch (err) {
        this._error("draw:moveend handler failed", err);
      }
    });

    // MOVECONFIRMED: user clicked Save, update the store and emit event
    this.map.on("draw:moveconfirmed", (e: any) => {
      try {
        const layer = e.layer;
        const id = (layer as any)._fid as string | undefined;
        if (id) {
          const feat = layer.toGeoJSON() as Feature;
          this.store.update(id, feat);

          // Emit custom event for move confirmed
          this.options.callbacks?.onEdited?.({
            ids: [id],
            geoJSON: this.store.toFeatureCollection(),
          });
        }

        this.hideMoveConfirmationUI();
      } catch (err) {
        this._error("draw:moveconfirmed handler failed", err);
      }
    });
  }

  private _error(message: string, cause: unknown): void {
    this.logger.error("error", { message, cause });
    this.options.callbacks?.onError?.({ message, cause });
  }

  // -------- Vertex deletion context menu --------

  private installVertexContextMenu(layer: any): void {
    if (!layer || typeof layer.on !== "function") return;
    const handleContext = (evt: any) => {
      try {
        evt?.originalEvent?.preventDefault?.();
        evt?.originalEvent?.stopPropagation?.();
      } catch {
        // Ignore errors when preventing default context menu behavior
      }
      this.openVertexMenu(layer, evt);
    };
    const handleClick = (evt: any) => {
      const oe = evt?.originalEvent;
      if (oe && (oe.ctrlKey || oe.metaKey)) {
        this.openVertexMenu(layer, evt);
      }
    };
    try {
      layer.on("contextmenu", handleContext);
      layer.on("click", handleClick);
    } catch {
      // Ignore errors when attaching event handlers to the layer
    }
  }

  private openVertexMenu(layer: any, evt: any): void {
    try {
      if (!this.map) return;
      // Only for Polygon/Polyline-like layers
      const isPoly =
        typeof layer.getLatLngs === "function" &&
        (layer instanceof (this.L as any).Polygon ||
          layer instanceof (this.L as any).Polyline);
      if (!isPoly) return;

      // Only when editing is enabled on the layer (avoid accidental deletes)
      const editing = (layer as any).editing;
      if (
        !editing ||
        typeof editing.enabled !== "function" ||
        !editing.enabled()
      )
        return;

      const latlng = evt?.latlng;
      const containerPt = this.map.latLngToContainerPoint(latlng);

      const nearest = this.findNearestVertex(layer, latlng, 12); // 12px tolerance
      if (!nearest) return;

      this.showVertexMenu(containerPt, async () => {
        await this.deleteVertex(layer, nearest.pathIndex, nearest.vertexIndex);
      });
    } catch (err) {
      this._error("openVertexMenu", err);
    }
  }

  private showVertexMenu(pt: any, onDelete: () => void): void {
    try {
      // Cleanup existing
      try {
        this.vertexMenuCleanup?.();
      } catch {
        // Ignore errors when cleaning up previous vertex menu
      }
      this.vertexMenuCleanup = null;
      if (!this.container) return;

      const menu = document.createElement("div");
      menu.style.position = "absolute";
      menu.style.top = `${pt.y}px`;
      menu.style.left = `${pt.x}px`;
      menu.style.transform = "translate(-50%, -100%)";
      menu.style.background = "#fff";
      menu.style.border = "1px solid rgba(0,0,0,0.15)";
      menu.style.borderRadius = "6px";
      menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      menu.style.padding = "6px";
      menu.style.zIndex = "10000";
      menu.style.fontSize = "12px";
      menu.style.userSelect = "none";

      const btn = document.createElement("button");
      btn.textContent = "Delete vertex";
      btn.style.padding = "6px 10px";
      btn.style.border = "none";
      btn.style.background = "#da1e28";
      btn.style.color = "#fff";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          onDelete();
        } finally {
          cleanup();
        }
      });
      menu.appendChild(btn);

      const cleanup = () => {
        try {
          window.removeEventListener("pointerdown", onDoc);
          this.container.removeEventListener("scroll", cleanup, true);
          menu.remove();
        } catch {
          // Ignore errors during menu cleanup operations
        }
        this.vertexMenuEl = null;
        this.vertexMenuCleanup = null;
      };

      const onDoc = (e: any) => {
        // Close if clicking elsewhere
        if (!menu.contains(e.target)) cleanup();
      };

      window.addEventListener("pointerdown", onDoc, { capture: true });
      this.container.addEventListener("scroll", cleanup, true);
      this.container.appendChild(menu);
      this.vertexMenuEl = menu;
      this.vertexMenuCleanup = cleanup;
    } catch (err) {
      this._error("showVertexMenu", err);
    }
  }

  private findNearestVertex(
    layer: any,
    latlng: BundledL.LatLng,
    tolerancePx: number,
  ): { pathIndex: number; vertexIndex: number } | null {
    if (!this.map) return null;
    const llToPoint = (ll: BundledL.LatLng) =>
      this.map!.latLngToContainerPoint(ll);
    const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    const targetPt = llToPoint(latlng);

    let bestD = Infinity;
    let bestPath = -1;
    let bestVertex = -1;
    const latlngs: any = layer.getLatLngs();
    // Normalize: Polyline -> LatLng[], Polygon -> LatLng[][] (rings)
    const paths: BundledL.LatLng[][] = Array.isArray(latlngs[0])
      ? (latlngs as BundledL.LatLng[][])
      : [latlngs as BundledL.LatLng[]];

    paths.forEach((path, pathIndex) => {
      path.forEach((v, vertexIndex) => {
        const p = llToPoint(v);
        const d = dist(p, targetPt);
        if (d < bestD) {
          bestD = d;
          bestPath = pathIndex;
          bestVertex = vertexIndex;
        }
      });
    });

    if (bestPath === -1 || bestD > tolerancePx) return null;
    return { pathIndex: bestPath, vertexIndex: bestVertex };
  }

  private async deleteVertex(
    layer: any,
    pathIndex: number,
    vertexIndex: number,
  ): Promise<void> {
    try {
      // Only for polygon/polyline
      const isPoly =
        typeof layer.getLatLngs === "function" &&
        (layer instanceof (this.L as any).Polygon ||
          layer instanceof (this.L as any).Polyline);
      if (!isPoly) return;

      const latlngs: any = layer.getLatLngs();
      const paths: BundledL.LatLng[][] = Array.isArray(latlngs[0])
        ? (latlngs as BundledL.LatLng[][])
        : [latlngs as BundledL.LatLng[]];
      const path = paths[pathIndex];
      if (!path) return;

      // Enforce minimal vertices: polygon needs >= 3, polyline >= 2
      const isPolygon = layer instanceof (this.L as any).Polygon;
      const minVerts = isPolygon ? 3 : 2;
      if (path.length <= minVerts) return;

      path.splice(vertexIndex, 1);
      // Apply back
      if (paths.length === 1) {
        layer.setLatLngs(path);
      } else {
        const newPaths = paths.map((p, i) => (i === pathIndex ? path : p));
        layer.setLatLngs(newPaths as any);
      }
      layer.redraw?.();

      // Update store + emit edited callback
      const fid = (layer as any)._fid as string | undefined;
      if (fid) {
        const feat = layer.toGeoJSON() as Feature;
        this.store.update(fid, feat);
        this.options.callbacks?.onEdited?.({
          ids: [fid],
          geoJSON: this.store.toFeatureCollection(),
        });
      }
    } catch (err) {
      this._error("deleteVertex", err);
    }
  }

  // -------- Move tool Save/Cancel UI --------

  private showMoveConfirmationUI(
    layer: any,
    originalGeoJSON: GeoJSON.Feature,
    newGeoJSON: GeoJSON.Feature,
  ): void {
    try {
      // Clean up any existing UI
      this.hideMoveConfirmationUI();

      if (!this.container || !this.map) return;

      // Get the move handler from the draw control
      const drawControl = this.drawControl;
      if (!drawControl) return;

      const drawToolbar = (drawControl as any)?._toolbars?.draw;
      if (!drawToolbar) return;

      // Find the move handler
      const handlers = drawToolbar._modes || {};
      let moveHandler: any = null;
      for (const key in handlers) {
        const mode = handlers[key];
        if (mode?.handler?.type === "move") {
          moveHandler = mode.handler;
          break;
        }
      }

      this.activeMoveHandler = moveHandler;

      // Create a floating UI with Save and Cancel buttons
      const ui = document.createElement("div");
      ui.style.position = "absolute";
      ui.style.bottom = "60px";
      ui.style.left = "50%";
      ui.style.transform = "translateX(-50%)";
      ui.style.display = "flex";
      ui.style.gap = "8px";
      ui.style.background = "#fff";
      ui.style.border = "2px solid #3388ff";
      ui.style.borderRadius = "8px";
      ui.style.padding = "12px 16px";
      ui.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
      ui.style.zIndex = "10000";
      ui.style.fontSize = "14px";
      ui.style.fontFamily = "system-ui, sans-serif";

      const saveBtn = document.createElement("button");
      saveBtn.textContent = "✓ Save";
      saveBtn.style.padding = "8px 16px";
      saveBtn.style.border = "none";
      saveBtn.style.background = "#28a745";
      saveBtn.style.color = "#fff";
      saveBtn.style.borderRadius = "4px";
      saveBtn.style.cursor = "pointer";
      saveBtn.style.fontWeight = "600";
      saveBtn.style.fontSize = "14px";
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (moveHandler?.confirmMove) {
          moveHandler.confirmMove();
        }
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "✕ Cancel";
      cancelBtn.style.padding = "8px 16px";
      cancelBtn.style.border = "1px solid #ccc";
      cancelBtn.style.background = "#fff";
      cancelBtn.style.color = "#333";
      cancelBtn.style.borderRadius = "4px";
      cancelBtn.style.cursor = "pointer";
      cancelBtn.style.fontWeight = "600";
      cancelBtn.style.fontSize = "14px";
      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (moveHandler?.cancelMove) {
          moveHandler.cancelMove();
        }
        this.hideMoveConfirmationUI();
      });

      ui.appendChild(saveBtn);
      ui.appendChild(cancelBtn);

      this.container.appendChild(ui);
      this.moveConfirmationUI = ui;

      this.logger.debug("showMoveConfirmationUI", {
        layerId: (layer as any)._fid,
      });
    } catch (err) {
      this._error("showMoveConfirmationUI", err);
    }
  }

  private hideMoveConfirmationUI(): void {
    try {
      if (this.moveConfirmationUI) {
        this.moveConfirmationUI.remove();
        this.moveConfirmationUI = null;
      }
      this.activeMoveHandler = null;
    } catch (err) {
      this._error("hideMoveConfirmationUI", err);
    }
  }
}
