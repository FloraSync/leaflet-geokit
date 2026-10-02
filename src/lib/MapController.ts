import * as BundledL from "leaflet";
import "leaflet-draw";
import "leaflet-ruler";
import type { Feature, FeatureCollection } from "geojson";
import type {
  DrawControlsConfig,
  GeoJSONExportOptions,
  GeoJSONImportOptions,
  MapConfig,
  MeasurementSystem,
  SnappingOptions,
  MeasurementOverlayOptions,
  IntegratedToolEventEmitter,
  IntegratedToolEventName,
  IntegratedToolHooks,
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
import type { ErrorEventDetail } from "@src/types/events";
import { createLogger, type Logger } from "@src/utils/logger";
import { FeatureStore } from "@src/lib/FeatureStore";
import { LayerRegistry } from "@src/lib/LayerRegistry";
import { openLayerStylePanel } from "@src/lib/layer-style-panel";
import { announceToolStatus } from "@src/lib/toolbar-accessibility";
import type { MapLayer, LayerStyle, LayerCakeSessionUpdate, LayerStyleRequestDetail } from "@src/types/layers";
import { type NormalizedMarkerIconConfig } from "@src/lib/marker-icons";
import {
  applyToolButtonConfig,
  setActiveToolbarTool,
  type ToolButtonTriggerContext,
} from "@src/lib/tool-buttons";
import { registerLayerCakeTool } from "@src/lib/draw/toolbar-patch";
import { DrawCake, ensureDrawCakeRegistered } from "@src/lib/draw/L.Draw.Cake";
import { ensureDrawMoveRegistered } from "@src/lib/draw/L.Draw.Move";
import type { DrawMove } from "@src/lib/draw/L.Draw.Move";
import { LayerCakeManager } from "@src/lib/layer-cake/LayerCakeManager";
import layerCakeIconSvg from "@src/assets/layer-cake.svg?raw";
import moveToolIconSvg from "@src/assets/move-tool.svg?raw";
import {
  adaptFeatureCollectionForExport,
  expandMultiGeometries,
  mergePolygons,
  isPolygon,
  isMultiPolygon,
  normalizeId,
} from "@src/utils/geojson";
import { computePreciseDistance, magicRound } from "@src/utils/geodesic";
import { normalizeGeoJSON } from "@src/utils/geojson-pipeline";
import {
  getRulerOptions,
  measurementSystemDescriptions,
} from "@src/utils/ruler";
import { assertDrawPresent } from "@src/utils/leaflet-guards";
import type { TileURLTemplate } from "@src/lib/TileProviderFactory";
import { createCustomRasterProvider, getProviderDiagnostics } from "@src/lib/providers";
import type { BasemapAdapter, ProviderDiagnostics } from "@src/lib/providers";
import { buildToolCapabilities, reflectToolCapabilities, TOOL_REGISTRY } from "./tool-capabilities";
import { findSnap, type SnapResult, type SnapTarget } from "@src/lib/snapping";
import { formatMeasurements, measureGeoJSON } from "@src/utils/grower-geometry";

let rulerPrecisionPatched = false;

export interface MapControllerCallbacks {
  onLayerEvent?: (name: string, detail: unknown) => void;
  onLayerStyleRequested?: (detail: LayerStyleRequestDetail) => boolean;
  onToolCapabilitiesChanged?: (detail: ToolCapabilities) => void;
  onReady?: (detail: { bounds?: [[number, number], [number, number]] }) => void;
  onCreated?: (detail: {
    id: string;
    layerType: "polygon" | "polyline" | "rectangle" | "circle" | "marker";
    geoJSON: Feature;
  }) => void;
  onEdited?: (detail: { ids: string[]; geoJSON: FeatureCollection }) => void;
  onDeleted?: (detail: { ids: string[]; geoJSON: FeatureCollection }) => void;
  onError?: (detail: ErrorEventDetail) => void;
  onTileError?: (error: unknown) => void;
  onToolTrigger?: (detail: ToolTriggerEventDetail) => void;
  onToolEvent?: (
    eventName: ToolLifecycleEventName,
    detail: ToolEventDetail,
  ) => void;
  onSaved?: (detail: {
    geoJSON: FeatureCollection;
    featureCount: number;
  }) => void;
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
  /** Optional hooks for integrated tool lifecycle/events. */
  toolHooks?: IntegratedToolHooks;
  /** Optional event emitter for integrated tool lifecycle/events. */
  toolEventEmitter?: IntegratedToolEventEmitter;
  /** Optional normalized marker icon override. */
  markerIconConfig?: NormalizedMarkerIconConfig | null;
  /** Optional draw/ruler toolbar button customization. */
  toolButtonConfig?: ToolButtonConfig | null;
  /** Optional additional toolbar groups rendered over the map. */
  toolbarGroups?: ToolToolbarGroupConfig[] | null;
  /** Opt-in screen-space snapping for drawing and vertex editing. */
  snapping?: SnappingOptions | null;
  /** Opt-in live length/area/perimeter feedback while drawing or editing. */
  measurementOverlay?: MeasurementOverlayOptions | null;
}

type CreatedLayerType =
  "polygon" | "polyline" | "rectangle" | "circle" | "marker";

const CREATED_LAYER_EVENT_BY_TYPE: Record<
  CreatedLayerType,
  IntegratedToolEventName
> = {
  polygon: "tool:polygon:created",
  polyline: "tool:polyline:created",
  rectangle: "tool:rectangle:created",
  circle: "tool:circle:created",
  marker: "tool:marker:created",
};

interface TileLayerCallbacks {
  onTileError?: (error: unknown) => void;
}

interface ToolCommandContext {
  tool: ToolButtonName;
  action: ToolCommandAction;
  source: string;
  groupId?: string;
  commandId: string;
  previousTool: ToolButtonName | null;
  terminalOutcome?: "completed" | "failed";
  replacedActive?: boolean;
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
  private layerRegistry = new LayerRegistry();
  private featureLayers = new Map<string, BundledL.Layer>();
  private closeLayerStylePanel: (() => void) | null = null;

  // Leaflet entities
  private map: BundledL.Map | null = null;
  private tileLayer: BundledL.Layer | null = null;
  private adapterAttribution: string | null = null;
  private providerDiagnostics: ProviderDiagnostics | null = null;
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
  private vertexEditSurfaceCleanup: (() => void) | null = null;
  private activeCakeSession: LayerCakeManager | null = null;
  private cakeSessionCommand: ToolCommandContext | null = null;

  // Move tool UI elements
  private moveConfirmationUI: HTMLDivElement | null = null;
  private activeMoveHandler: DrawMove | null = null;
  private markerIconConfig: NormalizedMarkerIconConfig | null = null;
  private markerIcon: BundledL.Icon | null = null;
  private toolButtonConfig: ToolButtonConfig | null = null;
  private toolbarGroups: ToolToolbarGroupConfig[] | null = null;
  private activeToolCommand: ToolCommandContext | null = null;
  private pendingToolCommand: ToolCommandContext | null = null;
  private observedNativeToolbarCommand: ToolCommandContext | null = null;
  private commandSequence = 0;
  private toolErrors: Partial<Record<ToolButtonName, string>> = {};
  private toolSelection: string[] = [];
  private toolProvider: ToolProviderCapability = {
    requested: "tile-url", active: "tile-url", state: "enabled", reason: null,
  };
  private capabilityNotificationPending = false;
  private lastCapabilities = "";
  private toolEscapeKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private measurementPreviousFocus: HTMLElement | null = null;
  private snappingOptions: SnappingOptions | null = null;
  private measurementOverlayOptions: MeasurementOverlayOptions | null = null;
  private interactionCleanup: (() => void) | null = null;
  private measurementOverlayElement: HTMLDivElement | null = null;
  private snapFeedbackMarker: BundledL.CircleMarker | null = null;
  private lastMeasurementFeature: Feature | null = null;
  private lastMeasurementLatLng: BundledL.LatLng | null = null;

  private emitToolEvent(
    eventName: IntegratedToolEventName,
    detail: unknown,
  ): void {
    try {
      this.options.toolHooks?.[eventName]?.(detail);
    } catch (err) {
      this._error(`tool hook failed: ${eventName}`, err);
    }

    const emitter = this.options.toolEventEmitter;
    if (!emitter) return;

    try {
      if (typeof emitter.emit === "function") {
        emitter.emit(eventName, detail);
        return;
      }

      if (typeof emitter.dispatchEvent === "function") {
        emitter.dispatchEvent(
          new CustomEvent(eventName, {
            detail,
          }),
        );
      }
    } catch (err) {
      this._error(`tool emitter failed: ${eventName}`, err);
    }
  }

  constructor(opts: MapControllerOptions) {
    this.options = opts;
    this.container = opts.container;
    this.logger = (opts.logger ?? createLogger("controller", "debug")).child(
      "map",
    );
    this.L = this.resolveLeaflet(opts);
    this.store = new FeatureStore(this.logger.child("store"));
    this.layerRegistry.add([], { id: "base", name: "Basemap" }, "base");
    this.setMarkerIconConfig(opts.markerIconConfig ?? null, {
      reapplyExistingLayers: false,
      syncDrawControl: false,
    });
    this.toolButtonConfig = opts.toolButtonConfig ?? null;
    this.toolbarGroups = opts.toolbarGroups ?? null;
    this.snappingOptions = opts.snapping ? { ...opts.snapping, enabled: opts.snapping.enabled ?? true } : null;
    this.measurementOverlayOptions = opts.measurementOverlay ? { ...opts.measurementOverlay, enabled: opts.measurementOverlay.enabled ?? true } : null;
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

  private nextCommandId(): string {
    this.commandSequence += 1;
    return `tool-${Date.now().toString(36)}-${this.commandSequence.toString(36)}`;
  }

  getToolCapabilities(): ToolCapabilities {
    const available: Partial<Record<ToolButtonName, boolean>> = {};
    for (const tool of Object.keys(TOOL_REGISTRY) as ToolButtonName[]) {
      available[tool] = tool === "ruler"
        ? this.canTriggerRulerTool()
        : typeof this.findLeafletDrawHandler(tool)?.enable === "function";
    }
    return buildToolCapabilities({
      ready: Boolean(this.map && this.drawnItems),
      readOnly: Boolean(this.options.readOnly),
      controls: this.options.controls,
      available,
      layerCount: this.drawnItems?.getLayers?.().length ?? 0,
      selectedFeatureIds: this.toolSelection.filter((id) => this.store.has(id)),
      activeTool: this.activeToolCommand?.tool ?? null,
      config: this.toolButtonConfig,
      groups: this.toolbarGroups,
      errors: this.toolErrors,
      provider: this.toolProvider,
    });
  }

  setToolSelection(ids: readonly string[]): void {
    this.toolSelection = [...new Set(ids)].filter((id) => this.store.has(id));
    this.notifyToolCapabilities();
  }

  setToolProvider(provider: ToolProviderCapability): void {
    this.toolProvider = { ...provider, reason: provider.reason ? { ...provider.reason } : null };
    this.notifyToolCapabilities();
  }

  /** Update structural options before rebuilding, retaining the existing feature store. */
  configure(map: MapConfig, controls: DrawControlsConfig): void {
    this.options.map = map;
    this.options.controls = controls;
    this.options.readOnly = map.readOnly;
    this.toolErrors = {};
    this.notifyToolCapabilities();
  }

  private notifyToolCapabilities(): void {
    if (this.capabilityNotificationPending) return;
    this.capabilityNotificationPending = true;
    queueMicrotask(() => {
      this.capabilityNotificationPending = false;
      this.toolSelection = this.toolSelection.filter((id) => this.store.has(id));
      const snapshot = this.getToolCapabilities();
      reflectToolCapabilities(this.container, snapshot);
      const serialized = JSON.stringify(snapshot);
      if (serialized === this.lastCapabilities) return;
      this.lastCapabilities = serialized;
      this.options.callbacks?.onToolCapabilitiesChanged?.(snapshot);
    });
  }

  private toolEventDetail(
    command: ToolCommandContext,
    overrides: Partial<ToolEventDetail> = {},
  ): ToolEventDetail {
    return {
      tool: command.tool,
      action: command.action,
      source: command.source,
      groupId: command.groupId,
      commandId: command.commandId,
      previousTool: command.previousTool,
      activeTool: this.activeToolCommand?.tool ?? null,
      featureIds: [],
      timestamp: Date.now(),
      ...overrides,
    };
  }

  private emitToolLifecycle(
    eventName: ToolLifecycleEventName,
    command: ToolCommandContext,
    overrides: Partial<ToolEventDetail> = {},
  ): ToolEventDetail {
    const detail = this.toolEventDetail(command, overrides);
    const outcome = eventName.replace("leaflet-geokit:tool-", "");
    if (["started", "completed", "cancelled", "failed"].includes(outcome)) {
      announceToolStatus(this.container, detail.reason ?? `${command.tool}: ${outcome}`, outcome === "failed");
    }
    this.options.callbacks?.onToolEvent?.(eventName, detail);
    this.emitToolEvent(eventName, detail);
    this.notifyToolCapabilities();
    return detail;
  }

  private beginToolCommand(
    tool: ToolButtonName,
    action: ToolCommandAction,
    options: ToolTriggerOptions,
    emitCommand: boolean,
    requestDetail?: ToolCommandEventDetail,
  ): ToolCommandContext {
    const command: ToolCommandContext = {
      tool,
      action,
      source: options.source ?? "api",
      groupId: options.groupId,
      commandId: options.commandId?.trim() || this.nextCommandId(),
      previousTool: this.activeToolCommand?.tool ?? null,
    };
    const detail = this.toolEventDetail(command);
    if (requestDetail) {
      Object.assign(requestDetail, detail);
    }
    if (emitCommand) {
      this.emitToolLifecycle("leaflet-geokit:tool-command", command);
    }
    this.emitToolLifecycle("leaflet-geokit:tool-commanded", command);
    return command;
  }

  private startPersistentTool(command: ToolCommandContext): void {
    if (this.activeToolCommand === command) return;
    if (this.activeToolCommand) {
      this.cancelActiveTool(
        `Superseded by command "${command.commandId}"`,
        false,
      );
      command.replacedActive = true;
    }
    this.activeToolCommand = command;
    this.emitToolLifecycle("leaflet-geokit:tool-started", command, {
      activeTool: command.tool,
    });
    if (command.previousTool !== command.tool) {
      this.emitToolLifecycle("leaflet-geokit:tool-state-changed", command, {
        previousTool: command.previousTool,
        activeTool: command.tool,
      });
    }
    setActiveToolbarTool(this.container, command.tool);
  }

  private clearActiveTool(command: ToolCommandContext): void {
    if (this.activeToolCommand !== command) return;
    this.activeToolCommand = null;
    setActiveToolbarTool(this.container, null);
    this.emitToolLifecycle("leaflet-geokit:tool-state-changed", command, {
      previousTool: command.tool,
      activeTool: null,
    });
  }

  private cancelActiveTool(reason: string, emitState = true): void {
    const command = this.activeToolCommand;
    if (!command) return;
    this.activeToolCommand = null;
    this.emitToolLifecycle("leaflet-geokit:tool-cancelled", command, {
      previousTool: command.tool,
      activeTool: null,
      reason,
    });
    setActiveToolbarTool(this.container, null);
    if (emitState) {
      this.emitToolLifecycle("leaflet-geokit:tool-state-changed", command, {
        previousTool: command.tool,
        activeTool: null,
      });
    }
  }

  private completeActiveTool(
    overrides: Partial<ToolEventDetail>,
    endsSession: boolean,
  ): void {
    const command = this.activeToolCommand;
    if (!command) return;
    this.emitToolLifecycle("leaflet-geokit:tool-completed", command, overrides);
    if (endsSession) {
      command.terminalOutcome = "completed";
    }
  }

  private failToolCommand(command: ToolCommandContext, reason: string): void {
    if (this.getToolCapabilities().tools[command.tool]?.state === "enabled") {
      this.toolErrors[command.tool] = reason;
    }
    command.terminalOutcome = "failed";
    this.emitToolLifecycle("leaflet-geokit:tool-failed", command, { reason });
    if (this.activeToolCommand === command) {
      this.clearActiveTool(command);
    } else if (command.replacedActive && !this.activeToolCommand) {
      this.emitToolLifecycle("leaflet-geokit:tool-state-changed", command, {
        previousTool: command.previousTool,
        activeTool: null,
      });
    }
  }

  setToolObservers(options: {
    toolHooks?: IntegratedToolHooks;
    toolEventEmitter?: IntegratedToolEventEmitter;
  }): void {
    this.options.toolHooks = options.toolHooks;
    this.options.toolEventEmitter = options.toolEventEmitter;
  }

  setMarkerIconConfig(
    config: NormalizedMarkerIconConfig | null,
    options: {
      reapplyExistingLayers?: boolean;
      syncDrawControl?: boolean;
    } = {},
  ): void {
    const { reapplyExistingLayers = true, syncDrawControl = true } = options;
    this.options.markerIconConfig = config;
    this.markerIconConfig = config;
    this.markerIcon = this.createMarkerIcon(config);

    if (syncDrawControl) {
      this.syncDrawMarkerOptions();
    }

    if (reapplyExistingLayers) {
      this.reapplyMarkerIconsToExistingLayers();
    }
  }

  setToolButtonConfig(config: ToolButtonConfig | null | undefined): void {
    this.options.toolButtonConfig = config ?? null;
    this.toolButtonConfig = config ?? null;
    this.applyToolButtonCustomizations();
    this.notifyToolCapabilities();
  }

  setSnappingOptions(options: SnappingOptions | null | undefined): void {
    if (options?.modes?.includes("grid") && (!Number.isFinite(options.gridSizeMeters) || (options.gridSizeMeters ?? 0) <= 0)) {
      throw new Error("Grid snapping requires gridSizeMeters greater than zero.");
    }
    if (options?.tolerancePx !== undefined && (!Number.isFinite(options.tolerancePx) || options.tolerancePx <= 0)) {
      throw new Error("Snapping tolerancePx must be a finite number greater than zero.");
    }
    this.snappingOptions = options ? { ...options, enabled: options.enabled ?? true } : null;
    this.options.snapping = this.snappingOptions;
    this.installInteractionIntegrations();
  }

  getSnappingOptions(): SnappingOptions | null {
    return this.snappingOptions ? { ...this.snappingOptions, modes: this.snappingOptions.modes ? [...this.snappingOptions.modes] : undefined, gridOrigin: this.snappingOptions.gridOrigin ? [...this.snappingOptions.gridOrigin] as [number, number] : undefined } : null;
  }

  setMeasurementOverlayOptions(options: MeasurementOverlayOptions | null | undefined): void {
    if (options?.maximumFractionDigits !== undefined && (!Number.isInteger(options.maximumFractionDigits) || options.maximumFractionDigits < 0 || options.maximumFractionDigits > 20)) {
      throw new Error("Measurement maximumFractionDigits must be an integer from 0 through 20.");
    }
    this.measurementOverlayOptions = options ? { ...options, enabled: options.enabled ?? true } : null;
    this.options.measurementOverlay = this.measurementOverlayOptions;
    this.installInteractionIntegrations();
  }

  getMeasurementOverlayOptions(): MeasurementOverlayOptions | null {
    return this.measurementOverlayOptions ? { ...this.measurementOverlayOptions } : null;
  }

  setToolbarGroups(groups: ToolToolbarGroupConfig[] | null | undefined): void {
    this.options.toolbarGroups = groups ?? null;
    this.toolbarGroups = groups ?? null;
    this.applyToolButtonCustomizations();
    this.notifyToolCapabilities();
  }

  activateTool(
    tool: ToolButtonName,
    options: ToolTriggerOptions = {},
  ): boolean {
    const action: ToolCommandAction =
      tool === "select" ? "deactivate" : "activate";
    return this.executeToolCommand(tool, action, options, true);
  }

  triggerTool(tool: ToolButtonName, options: ToolTriggerOptions = {}): boolean {
    return this.activateTool(tool, options);
  }

  deactivateTool(options: ToolTriggerOptions = {}): boolean {
    return this.executeToolCommand("select", "deactivate", options, true);
  }

  handleToolCommand(detail: ToolCommandEventDetail): boolean {
    const action: ToolCommandAction =
      detail.action === "deactivate" || detail.tool === "select"
        ? "deactivate"
        : "activate";
    const tool = action === "deactivate" ? "select" : detail.tool;
    return this.executeToolCommand(tool, action, detail, false, detail);
  }

  private executeToolCommand(
    tool: ToolButtonName,
    action: ToolCommandAction,
    options: ToolTriggerOptions,
    emitCommand: boolean,
    requestDetail?: ToolCommandEventDetail,
  ): boolean {
    const command = this.beginToolCommand(
      tool,
      action,
      options,
      emitCommand,
      requestDetail,
    );

    delete this.toolErrors[tool];
    const requirements = this.toolButtonConfig?.[tool]?.requirements;
    const capability = this.getToolCapabilities().tools[tool];
    if (action !== "deactivate" && (
      capability?.reason?.code === "missing_attribute" ||
      capability?.reason?.code === "no_editable_layers" ||
      (this.options.readOnly && TOOL_REGISTRY[tool]?.mutates) ||
      (requirements?.selection && this.getToolCapabilities().selectedFeatureIds.length === 0) ||
      (requirements?.provider && this.toolProvider.state !== "enabled")
    )) {
      const reason = `Tool "${tool}" is not available: ${capability?.reason?.message ?? "Tool requirements are not met"}`;
      this.failToolCommand(command, reason);
      this.emitToolTrigger({ tool, source: command.source, groupId: command.groupId, commandId: command.commandId, handled: false, error: reason });
      return false;
    }

    try {
      if (action === "deactivate" || tool === "select") {
        const previous = this.activeToolCommand?.tool;
        this.cancelActiveTool("Deactivated by select command");
        this.disablePhysicalTool(previous);
        this.toggleMeasurementModal(false);
        this.emitToolLifecycle("leaflet-geokit:tool-completed", command, {
          activeTool: null,
        });
        this.emitToolTrigger({
          tool: "select",
          source: command.source,
          groupId: command.groupId,
          commandId: command.commandId,
          handled: true,
        });
        return true;
      }

      if (tool === "save") {
        const geoJSON = this.store.toFeatureCollection();
        const featureIds = geoJSON.features
          .map((feature) => normalizeId(feature))
          .filter((id): id is string => Boolean(id));
        this.options.callbacks?.onSaved?.({
          geoJSON,
          featureCount: geoJSON.features.length,
        });
        this.emitToolEvent("tool:save", {
          geoJSON,
          featureCount: geoJSON.features.length,
        });
        this.emitToolLifecycle("leaflet-geokit:tool-completed", command, {
          featureIds,
          geometry: geoJSON,
        });
        this.emitToolTrigger({
          tool,
          source: command.source,
          groupId: command.groupId,
          commandId: command.commandId,
          handled: true,
        });
        return true;
      }

      if (tool === "layerStyle" || tool === "measurementSettings") {
        if (tool === "measurementSettings") {
          this.toggleMeasurementModal(true);
        } else {
          this.closeLayerStylePanel?.();
          const detail = { layers: this.getLayers() };
          if (!this.options.callbacks?.onLayerStyleRequested?.(detail)) {
            this.closeLayerStylePanel = openLayerStylePanel(this.container, detail.layers, (id, style) => {
              this.setLayerStyle(id, style);
            });
          }
        }
        this.emitToolLifecycle("leaflet-geokit:tool-completed", command);
        this.emitToolTrigger({
          tool,
          source: command.source,
          groupId: command.groupId,
          commandId: command.commandId,
          handled: true,
        });
        return true;
      }

      if (tool === "ruler") {
        if (!this.canTriggerRulerTool()) {
          const reason = "Ruler control is not available";
          this.failToolCommand(command, reason);
          this.emitToolTrigger({
            tool,
            source: command.source,
            groupId: command.groupId,
            commandId: command.commandId,
            handled: false,
            error: reason,
          });
          return false;
        }
        this.preparePersistentTool(command);
        const handled = this.triggerRulerTool();
        if (!handled) {
          const reason = "Ruler control is not available";
          this.failToolCommand(command, reason);
          this.emitToolTrigger({
            tool,
            source: command.source,
            groupId: command.groupId,
            commandId: command.commandId,
            handled: false,
            error: reason,
          });
          return false;
        }
        this.startPersistentTool(command);
        this.emitToolTrigger({
          tool,
          source: command.source,
          groupId: command.groupId,
          commandId: command.commandId,
          handled: true,
        });
        return true;
      }

      const handler = this.findLeafletDrawHandler(tool);
      if (!handler || typeof handler.enable !== "function") {
        const reason = `Tool "${tool}" is not available on this map`;
        this.failToolCommand(command, reason);
        this.emitToolTrigger({
          tool,
          source: command.source,
          groupId: command.groupId,
          commandId: command.commandId,
          handled: false,
          error: reason,
        });
        return false;
      }

      this.preparePersistentTool(command);
      this.pendingToolCommand = command;
      handler.enable();
      this.pendingToolCommand = null;
      if (
        typeof handler.enabled === "function" &&
        handler.enabled() === false
      ) {
        const reason = `Tool "${tool}" could not be started`;
        this.failToolCommand(command, reason);
        this.emitToolTrigger({
          tool,
          source: command.source,
          groupId: command.groupId,
          commandId: command.commandId,
          handled: false,
          error: reason,
        });
        return false;
      }
      this.startPersistentTool(command);
      this.emitToolTrigger({
        tool,
        source: command.source,
        groupId: command.groupId,
        commandId: command.commandId,
        handled: true,
      });
      return true;
    } catch (cause) {
      this.pendingToolCommand = null;
      const message =
        action === "deactivate"
          ? "Failed to deactivate active map tools"
          : "Failed to activate tool " + tool;
      const reason = cause instanceof Error ? cause.message : message;
      this.toolErrors[tool] = reason;
      this._error(message, cause);
      this.failToolCommand(command, reason);
      this.emitToolTrigger({
        tool,
        source: command.source,
        groupId: command.groupId,
        commandId: command.commandId,
        handled: false,
        error: reason,
      });
      return false;
    }
  }

  private preparePersistentTool(command: ToolCommandContext): void {
    const previous = this.activeToolCommand?.tool;
    if (this.activeToolCommand) {
      this.cancelActiveTool(
        `Superseded by command "${command.commandId}"`,
        false,
      );
      command.replacedActive = true;
    }
    this.disablePhysicalTool(previous);
  }

  private disablePhysicalTool(tool?: ToolButtonName): void {
    if (tool === "layerCake" || this.activeCakeSession) {
      try {
        if (this.activeCakeSession) this.emitCakeEvent("tool:layer-cake:cancelled");
        this.activeCakeSession?.destroy();
      } finally {
        this.activeCakeSession = null;
        this.cakeSessionCommand = null;
      }
    }
    if (tool === "move" && this.activeMoveHandler?.hasPendingMove?.()) {
      this.activeMoveHandler.cancelMove?.();
      this.hideMoveConfirmationUI();
    }
    if (tool === "ruler") {
      this.triggerRulerTool();
    }
    if (tool) {
      this.disableActiveToolHandlers();
    }
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
        minZoom,
        preferCanvas,
      }).setView(center, zoom);

      // Add tile layer
      this.setTileLayer(
        {
          urlTemplate: tileUrl,
          attribution: tileAttribution ?? "",
          maxZoom,
        },
        {
          onTileError: (error: unknown) => {
            this.options.callbacks?.onTileError?.(error);
          },
        },
      );

      // FeatureGroup for all drawn layers
      this.drawnItems = Lns.featureGroup().addTo(this.map);
      this.drawnItems.on("layeradd layerremove", () => this.notifyToolCapabilities());

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

      this.restoreVisibleLayersFromStore();

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

      this.applyToolButtonCustomizations();

      // Patch known Leaflet.draw bugs (e.g., readableArea strict-mode variable)
      this.patchLeafletDrawBugs();

      // Patch: reliably allow closing polygons by clicking the first vertex (Shadow DOM safe)
      this.installPolygonFinishPatch();
      this.installVertexEditSurfaceMenu();

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
      this.installInteractionIntegrations();

      const elapsed = (performance.now?.() ?? Date.now()) - t0;
      this.logger.debug("init:ready", { elapsedMs: Math.round(elapsed) });

      // Announce ready with current bounds (if any)
      const b = this.store.bounds();
      this.options.callbacks?.onReady?.(b ? { bounds: b } : {});
      this.toolErrors = {};
      this.notifyToolCapabilities();
    } catch (err) {
      this._error("Failed to initialize Leaflet map", err, {
        code: "map_init_failed",
        recoverable: false,
      });
    }
  }

  async destroy(): Promise<void> {
    this.cancelLayerCakeSession();
    this.closeLayerStylePanel?.();
    this.closeLayerStylePanel = null;
    this.featureLayers.clear();
    this.providerDiagnostics = null;
    this.interactionCleanup?.();
    this.interactionCleanup = null;
    this.adapterAttribution = null;
    try {
      applyToolButtonConfig(this.container, null, { toolbarGroups: null });
      if (this.map) {
        // Release captured move gestures and roll back before off() removes
        // the unload hook. The confirmation UI may not exist mid-gesture.
        this.findLeafletDrawHandler("move")?.disable?.();
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
    try {
      this.vertexEditSurfaceCleanup?.();
    } catch {
      // Ignore errors when cleaning up vertex edit surface listeners
    }
    this.vertexEditSurfaceCleanup = null;

    // Cleanup move confirmation UI if present
    try {
      this.hideMoveConfirmationUI();
    } catch {
      // Ignore errors when cleaning up move confirmation UI during destruction
    }

    if (this.toolEscapeKeyHandler) {
      this.container.removeEventListener("keydown", this.toolEscapeKeyHandler);
      this.container.removeEventListener("keyup", this.toolEscapeKeyHandler);
      this.toolEscapeKeyHandler = null;
    }
    this.activeToolCommand = null;
    this.pendingToolCommand = null;
    this.observedNativeToolbarCommand = null;
    setActiveToolbarTool(this.container, null);

    this.drawControl = null;
    this.rulerControl = null;
    this.measurementControl = null;
    this.removeMeasurementModal();
    this.drawnItems = null;
    this.notifyToolCapabilities();
    this.tileLayer = null;

    try {
      this.activeCakeSession?.destroy();
    } catch {
      // Ignore errors when cleaning up an in-progress cake session
    }
    this.activeCakeSession = null;

    this.map = null;
  }

  // ---------------- Public API (data) ----------------

  getLayers(): MapLayer[] { return this.layerRegistry.getLayers(); }

  private applyLayerRegistry(): void {
    if (!this.map || !this.drawnItems) return;
    for (const record of this.getLayers()) {
      if (record.kind === "base") {
        if (this.tileLayer) {
          if (record.visible) this.tileLayer.addTo(this.map);
          else this.map.removeLayer(this.tileLayer);
          (this.tileLayer as BundledL.TileLayer).setOpacity?.(record.style.opacity ?? 1);
        }
        continue;
      }
      for (const id of record.featureIds) {
        const layer = this.featureLayers.get(id) as (BundledL.Layer & { setStyle?: (style: LayerStyle) => void; setOpacity?: (n: number) => void; bringToFront?: () => void; setZIndexOffset?: (n: number) => void }) | undefined;
        if (!layer) continue;
        if (record.visible) this.drawnItems.addLayer(layer);
        else this.drawnItems.removeLayer(layer);
        layer.setStyle?.(record.style);
        layer.setOpacity?.(record.style.opacity ?? 1);
        if (record.visible) layer.bringToFront?.();
        layer.setZIndexOffset?.(record.order * 100);
      }
    }
    this.options.callbacks?.onLayerEvent?.("leaflet-geokit:layers-changed", { layers: this.getLayers() });
    this.notifyToolCapabilities();
  }

  setLayerVisibility(id: string, visible: boolean): void {
    this.layerRegistry.setLayerVisibility(id, visible);
    this.applyLayerRegistry();
  }
  setLayerStyle(id: string, style: LayerStyle): void {
    this.layerRegistry.setLayerStyle(id, style);
    this.applyLayerRegistry();
  }
  reorderLayers(ids: readonly string[]): void {
    this.layerRegistry.reorderLayers(ids);
    this.applyLayerRegistry();
  }
  async focusLayer(id: string): Promise<void> {
    const record = this.layerRegistry.get(id);
    const group = this.L.featureGroup(record.featureIds.map((fid) => this.featureLayers.get(fid)).filter((layer): layer is BundledL.Layer => Boolean(layer)));
    const bounds = group.getBounds();
    if (bounds.isValid()) this.map?.fitBounds(bounds, { maxZoom: 18 });
  }
  async removeLayer(id: string): Promise<void> {
    if (this.options.readOnly) throw new Error("Map is read-only");
    const record = this.layerRegistry.get(id);
    if (record.kind === "base") throw new Error("Hide the basemap with setLayerVisibility instead");
    for (const fid of record.featureIds) await this.removeFeature(fid);
    if (this.getLayers().some((layer) => layer.id === id)) this.layerRegistry.removeLayer(id);
    this.applyLayerRegistry();
  }
  getLayerCakeSession() { return this.activeCakeSession?.snapshot() ?? null; }
  updateLayerCakeSession(update: LayerCakeSessionUpdate): void {
    if (this.options.readOnly) throw new Error("Map is read-only");
    if (!this.activeCakeSession) throw new Error("No active layer cake session");
    this.activeCakeSession.update(update);
  }
  saveLayerCakeSession(): void {
    if (this.options.readOnly) throw new Error("Map is read-only");
    if (!this.activeCakeSession) throw new Error("No active layer cake session");
    this.activeCakeSession.save();
  }
  cancelLayerCakeSession(): void {
    if (!this.activeCakeSession) return;
    this.disablePhysicalTool("layerCake");
    this.cancelActiveTool("Layer cake cancelled by host");
  }
  private emitCakeEvent(name: IntegratedToolEventName, extra: Record<string, unknown> = {}): void {
    const command = this.cakeSessionCommand ?? this.activeToolCommand;
    const detail = { session: this.getLayerCakeSession(), source: command?.source, commandId: command?.commandId, groupId: command?.groupId, ...extra };
    this.emitToolEvent(name, detail);
    this.options.callbacks?.onLayerEvent?.(name, detail);
  }

  async getGeoJSON(): Promise<FeatureCollection> {
    return this.store.toFeatureCollection();
  }

  async exportGeoJSON(
    options: GeoJSONExportOptions = {},
  ): Promise<FeatureCollection> {
    const fc = adaptFeatureCollectionForExport(await this.getGeoJSON(), options);
    return options.preserveLayers ? { ...fc, "geokit:layers": this.layerRegistry.snapshot() } as FeatureCollection : fc;
  }

  async importGeoJSON(
    fc: FeatureCollection,
    options: GeoJSONImportOptions = {},
  ): Promise<string[]> {
    if (!this.map || !this.drawnItems) return [];

    const behavior = options.behavior ?? "replace";
    const normalized = options.validate
      ? normalizeGeoJSON(fc, { expandMulti: true })
      : expandMultiGeometries(fc);
    if (options.preserveLayers && behavior !== "replace") throw new Error("preserveLayers requires replace import");
    const snapshot = options.preserveLayers
      ? LayerRegistry.parseSnapshot((fc as FeatureCollection & { "geokit:layers"?: unknown })["geokit:layers"], normalized.features.map((feature) => normalizeId(feature) ?? ""))
      : null;
    if (!snapshot) {
      const validation = new LayerRegistry();
      validation.add([], options.layer);
      if (options.layer?.id === "base" || (behavior === "add" && this.getLayers().some((layer) => layer.id === options.layer?.id))) throw new Error("Duplicate layer id");
    }
    if (options.validate && behavior === "add") {
      normalizeGeoJSON({
        type: "FeatureCollection",
        features: [
          ...this.store.toFeatureCollection().features,
          ...normalized.features,
        ],
      });
    }
    if (behavior === "replace") {
      await this.clearLayers();
    } else {
      // Preserve legacy upsert behavior without duplicate rendered features or membership.
      for (const feature of normalized.features) {
        const id = normalizeId(feature);
        if (id && this.store.has(id)) await this.removeFeature(id);
      }
    }

    const ids = this.store.add(normalized);
    const layers = this.createGeoJSONLayers(normalized);
    this.addGeoJSONLayersToDrawnItems(layers);
    layers.eachLayer((layer: any) => { if (layer._fid) this.featureLayers.set(layer._fid, layer); });
    if (snapshot) this.layerRegistry.restore(snapshot);
    else if (ids.length) this.layerRegistry.add(ids, options.layer);
    this.applyLayerRegistry();
    this.notifyToolCapabilities();

    this.logger.debug("importGeoJSON", {
      behavior,
      count: normalized.features.length,
      ids,
    });

    if (options.fitToData) {
      await this.fitBoundsToData();
    }

    return ids;
  }

  async loadGeoJSON(
    fc: FeatureCollection,
    fitToData: boolean = false,
  ): Promise<void> {
    await this.importGeoJSON(fc, {
      behavior: "replace",
      fitToData,
    });
  }

  async clearLayers(): Promise<void> {
    this.cancelLayerCakeSession();
    if (this.drawnItems) {
      this.drawnItems.clearLayers();
    }
    this.store.clear();
    this.featureLayers.clear();
    this.layerRegistry.clearData();
    this.applyLayerRegistry();
    this.toolSelection = [];
    this.notifyToolCapabilities();
  }

  async addFeatures(fc: FeatureCollection): Promise<string[]> {
    return this.importGeoJSON(fc, { behavior: "add" });
  }

  async updateFeature(id: string, feature: Feature): Promise<void> {
    if (!this.store.has(id)) {
      this.logger.warn("updateFeature:missing", { id });
      return;
    }

    this.store.update(id, feature);

    if (!this.drawnItems) return;

    this.drawnItems.eachLayer((layer: any) => {
      if ((layer as any)._fid === id) {
        this.drawnItems!.removeLayer(layer);
      }
    });

    const layers = this.createGeoJSONLayers({
      type: "FeatureCollection",
      features: [{ ...feature, id }],
    });

    layers.eachLayer((layer: any) => {
      (layer as any)._fid = id;
      this.drawnItems!.addLayer(layer);
      this.installVertexContextMenu(layer);
    });
    layers.eachLayer((layer: any) => this.featureLayers.set(id, layer));
    this.applyLayerRegistry();
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
    this.toolSelection = this.toolSelection.filter((selected) => selected !== id);
    this.featureLayers.delete(id);
    this.layerRegistry.removeFeature(id);
    this.applyLayerRegistry();
    this.notifyToolCapabilities();
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

  getProviderDiagnostics(): ProviderDiagnostics | null {
    return this.providerDiagnostics ? { ...this.providerDiagnostics } : null;
  }

  /** Basemap-only swap: preserve the map, drawing engine and feature store. */
  setBasemapAdapter(adapter: BasemapAdapter): void {
    if (!this.map) throw new Error("Map is not ready");
    if (adapter.provider.capabilities.attributionRequired && !adapter.attribution.trim()) {
      throw new Error("Basemap attribution is required");
    }
    if (adapter.provider.kind === "raster") {
      this.setTileLayer({ ...adapter.provider.resolve(), attribution: adapter.attribution });
    } else {
      const next = adapter.provider.createLayer(this.L);
      if (next === this.tileLayer || this.map.hasLayer(next)) {
        throw new Error("Basemap adapter must return a fresh layer");
      }
      try {
        next.addTo(this.map);
      } catch {
        if (this.map.hasLayer(next)) this.map.removeLayer(next);
        throw new Error("Basemap adapter failed to mount");
      }
      if (this.tileLayer) this.map.removeLayer(this.tileLayer);
      if (this.adapterAttribution) this.map.attributionControl?.removeAttribution(this.adapterAttribution);
      this.tileLayer = next;
      this.adapterAttribution = adapter.attribution;
      this.map.attributionControl?.addAttribution(adapter.attribution);
    }
    this.providerDiagnostics = getProviderDiagnostics(adapter.provider, adapter.attribution);
    this.applyLayerRegistry();
  }

  setTileLayer(config: TileURLTemplate, callbacks?: TileLayerCallbacks): void {
    if (!this.map) {
      this.logger.warn("setTileLayer called before map initialization");
      return;
    }

    this.logger.debug("tile-layer:switch", {
      maxZoom: config.maxZoom,
      subdomains: config.subdomains,
    });

    if (this.adapterAttribution) this.map.attributionControl?.removeAttribution(this.adapterAttribution);
    this.adapterAttribution = null;
    this.providerDiagnostics = getProviderDiagnostics(createCustomRasterProvider(config), config.attribution);

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
      this.tileLayer = null;
    }

    const tileLayerOptions: BundledL.TileLayerOptions = {
      attribution: config.attribution,
      minZoom: this.options.map.minZoom,
      maxZoom: config.maxZoom,
    };

    if (config.subdomains !== undefined) {
      tileLayerOptions.subdomains = config.subdomains;
    } else if (config.urlTemplate.includes("{s}")) {
      tileLayerOptions.subdomains = ["a", "b", "c"];
    }

    const nextTileLayer = this.L.tileLayer(
      config.urlTemplate,
      tileLayerOptions,
    );

    let tileErrorReported = false;
    nextTileLayer.on("tileerror", (error: unknown) => {
      if (this.tileLayer !== nextTileLayer) return;
      this.logger.error("tile-layer:error");
      if (!tileErrorReported) {
        tileErrorReported = true;
        callbacks?.onTileError?.(error);
      }
    });

    nextTileLayer.addTo(this.map);
    this.tileLayer = nextTileLayer;
    this.applyLayerRegistry();
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
      const id = normalizeId(feature);
      const hidden = this.getLayers().some((layer) => !layer.visible && id && layer.featureIds.includes(id));
      return !hidden && geom && (isPolygon(geom) || isMultiPolygon(geom));
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
    const previous = this.measurementSystem;
    this.measurementSystem = system;
    this.logger.debug("ruler:units", { system });
    this.emitToolEvent("tool:ruler:units-changed", {
      previous,
      current: system,
    });
    this.syncMeasurementModalState();
    this.refreshMeasurementOverlay();
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
      marker: controls.marker ? this.buildMarkerDrawOptions() : false,
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

  private buildMarkerDrawOptions(): Record<string, unknown> {
    return this.markerIcon ? { icon: this.markerIcon } : {};
  }

  private createMarkerIcon(
    config: NormalizedMarkerIconConfig | null,
  ): BundledL.Icon | null {
    if (!config) {
      return null;
    }

    return this.L.icon({
      iconUrl: config.iconUrl,
      iconRetinaUrl: config.iconRetinaUrl,
      shadowUrl: config.shadowUrl,
      iconSize: config.iconSize,
      iconAnchor: config.iconAnchor,
      popupAnchor: config.popupAnchor,
    });
  }

  private createDefaultMarkerIcon(): BundledL.Icon | null {
    const DefaultIcon = this.L.Icon?.Default as
      (new () => BundledL.Icon) | undefined;
    return DefaultIcon ? new DefaultIcon() : null;
  }

  private createGeoJSONLayers(fc: FeatureCollection): BundledL.GeoJSON {
    return this.L.geoJSON(fc, {
      pointToLayer: (_feature, latlng) =>
        this.markerIcon
          ? this.L.marker(latlng, { icon: this.markerIcon })
          : this.L.marker(latlng),
      onEachFeature: (feature, layer) => {
        const id = normalizeId(feature as Feature);
        if (id) {
          (layer as any)._fid = id;
        }
      },
    });
  }

  private addGeoJSONLayersToDrawnItems(layers: BundledL.GeoJSON): void {
    if (!this.drawnItems) {
      return;
    }

    layers.eachLayer((layer: any) => {
      this.drawnItems!.addLayer(layer);
      this.installVertexContextMenu(layer);
    });
  }

  private restoreVisibleLayersFromStore(): void {
    if (!this.drawnItems) {
      return;
    }

    const existing = this.store.toFeatureCollection();
    if (existing.features.length === 0) {
      return;
    }

    const layers = this.createGeoJSONLayers(existing);
    this.addGeoJSONLayersToDrawnItems(layers);
  }

  private syncDrawMarkerOptions(): void {
    const drawControl = this.drawControl as {
      setDrawingOptions?: (options: {
        marker: Record<string, unknown>;
      }) => void;
      options?: { draw?: { marker?: Record<string, unknown> } };
    } | null;
    if (!drawControl) {
      return;
    }

    const markerOptions = this.buildMarkerDrawOptions();
    drawControl.options ??= {};
    drawControl.options.draw ??= {};
    drawControl.options.draw.marker = markerOptions;
    drawControl.setDrawingOptions?.({ marker: markerOptions });
  }

  private reapplyMarkerIconsToExistingLayers(): void {
    if (!this.drawnItems) {
      return;
    }

    const defaultIcon = this.markerIcon ? null : this.createDefaultMarkerIcon();
    this.drawnItems.eachLayer((layer: any) => {
      if (
        typeof layer?.setIcon !== "function" ||
        typeof layer?.getLatLng !== "function"
      ) {
        return;
      }

      if (this.markerIcon) {
        layer.setIcon(this.markerIcon);
        return;
      }

      if (defaultIcon) {
        layer.setIcon(defaultIcon);
      }
    });
  }

  private applyToolButtonCustomizations(): void {
    const apply = () => {
      applyToolButtonConfig(this.container, this.toolButtonConfig, {
        toolbarGroups: this.toolbarGroups,
        onTrigger: (tool, context) => this.handleToolbarTrigger(tool, context),
      });
      reflectToolCapabilities(this.container, this.getToolCapabilities());
    };
    apply();
    setTimeout(apply, 0);
  }

  private handleToolbarTrigger(
    tool: ToolButtonName,
    context: ToolButtonTriggerContext,
  ): void {
    if (context.activate) {
      this.activateTool(tool, {
        source: context.source,
        groupId: context.groupId,
      });
      return;
    }

    let command =
      this.observedNativeToolbarCommand?.tool === tool
        ? this.observedNativeToolbarCommand
        : null;
    if (command) {
      this.observedNativeToolbarCommand = null;
    }

    if (tool === "measurementSettings") {
      command = this.beginToolCommand(
        tool,
        "activate",
        { source: context.source, groupId: context.groupId },
        true,
      );
      this.emitToolLifecycle("leaflet-geokit:tool-completed", command);
    } else if (tool === "ruler") {
      const rulerActive = this.isRulerActive();
      if (this.activeToolCommand?.tool === "ruler" && !rulerActive) {
        command = this.beginToolCommand(
          tool,
          "activate",
          { source: context.source, groupId: context.groupId },
          true,
        );
        this.cancelActiveTool("Ruler toggled off");
        this.emitToolLifecycle("leaflet-geokit:tool-completed", command, {
          activeTool: null,
        });
      } else if (!command) {
        command = this.observePersistentToolStart(tool, {
          source: context.source,
          groupId: context.groupId,
        });
      }
    } else if (!command) {
      command = this.observePersistentToolStart(tool, {
        source: context.source,
        groupId: context.groupId,
      });
    }

    this.emitToolTrigger({
      tool,
      source: context.source,
      groupId: context.groupId,
      commandId: command?.commandId,
      handled: true,
    });
  }

  private observePersistentToolStart(
    tool: ToolButtonName,
    options: ToolTriggerOptions,
  ): ToolCommandContext {
    const pending = this.pendingToolCommand;
    const nativeObservation = pending?.tool !== tool;
    const command = nativeObservation
      ? this.beginToolCommand(tool, "activate", options, true)
      : pending;
    if (this.activeToolCommand && this.activeToolCommand !== command) {
      const previous = this.activeToolCommand.tool;
      this.cancelActiveTool(
        `Superseded by command "${command.commandId}"`,
        false,
      );
      command.replacedActive = true;
      this.cleanupSupersededNativeTool(previous);
    }
    this.startPersistentTool(command);
    if (nativeObservation) {
      this.observedNativeToolbarCommand = command;
      queueMicrotask(() => {
        if (this.observedNativeToolbarCommand === command) {
          this.observedNativeToolbarCommand = null;
        }
      });
    }
    return command;
  }

  private cleanupSupersededNativeTool(tool: ToolButtonName): void {
    if (tool === "layerCake" && this.activeCakeSession) {
      try {
        this.emitCakeEvent("tool:layer-cake:cancelled");
        this.activeCakeSession.destroy();
      } finally {
        this.activeCakeSession = null;
        this.cakeSessionCommand = null;
      }
    }
    if (tool === "ruler" && this.isRulerActive()) {
      this.triggerRulerTool();
    }
    if (tool === "move" && this.activeMoveHandler?.hasPendingMove?.()) {
      this.activeMoveHandler.cancelMove?.();
      this.hideMoveConfirmationUI();
    }
  }

  private handlePersistentToolStop(tool: ToolButtonName, reason: string): void {
    const command = this.activeToolCommand;
    if (!command || command.tool !== tool) return;
    if (tool === "layerCake" && this.activeCakeSession) return;
    if (command.terminalOutcome) {
      this.clearActiveTool(command);
      return;
    }
    this.cancelActiveTool(reason);
  }

  private failActiveTool(reason: string): void {
    const command = this.activeToolCommand;
    if (command) {
      this.failToolCommand(command, reason);
    }
  }

  private emitToolTrigger(
    detail: Omit<ToolTriggerEventDetail, "timestamp">,
  ): void {
    this.options.callbacks?.onToolTrigger?.({
      ...detail,
      timestamp: Date.now(),
    });
  }

  private findLeafletDrawHandler(tool: ToolButtonName): any | null {
    const drawModeByTool: Partial<Record<ToolButtonName, string>> = {
      polygon: "polygon",
      polyline: "polyline",
      rectangle: "rectangle",
      circle: "circle",
      marker: "marker",
      layerCake: "cake",
      move: "move",
    };
    const editModeByTool: Partial<Record<ToolButtonName, string>> = {
      edit: "edit",
      delete: "remove",
    };

    const drawMode = drawModeByTool[tool];
    if (drawMode) {
      return this.drawControl?._toolbars?.draw?._modes?.[drawMode]?.handler;
    }

    const editMode = editModeByTool[tool];
    if (editMode) {
      return this.drawControl?._toolbars?.edit?._modes?.[editMode]?.handler;
    }

    return null;
  }

  private disableActiveToolHandlers(): void {
    const toolbars = this.drawControl?._toolbars;
    if (!toolbars) return;

    Object.values(toolbars).forEach((toolbar: any) => {
      Object.values(toolbar?._modes ?? {}).forEach((mode: any) => {
        const handler = mode?.handler;
        if (handler && typeof handler.disable === "function") {
          handler.disable();
        }
      });
    });
  }

  private canTriggerRulerTool(): boolean {
    const ruler = this.rulerControl as
      (BundledL.Control.Ruler & { _toggleMeasure?: () => void }) | null;
    return (
      typeof ruler?._toggleMeasure === "function" ||
      Boolean(this.container.querySelector<HTMLElement>(".leaflet-ruler"))
    );
  }

  private isRulerActive(): boolean {
    const ruler = this.rulerControl as
      (BundledL.Control.Ruler & { _choice?: boolean }) | null;
    return (
      ruler?._choice === true ||
      Boolean(this.container.querySelector(".leaflet-ruler-clicked"))
    );
  }

  private triggerRulerTool(): boolean {
    const ruler = this.rulerControl as
      | (BundledL.Control.Ruler & {
          _toggleMeasure?: () => void;
        })
      | null;
    if (typeof ruler?._toggleMeasure === "function") {
      ruler._toggleMeasure();
      return true;
    }

    const button = this.container.querySelector<HTMLElement>(".leaflet-ruler");
    if (button) {
      button.click();
      return true;
    }

    return false;
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
    dialog.setAttribute("aria-label", "Measurement units");
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
      if (this.measurementPreviousFocus?.isConnected) this.measurementPreviousFocus.focus();
      this.measurementPreviousFocus = null;
      return;
    }

    const overlay = this.ensureMeasurementModal();
    const root = this.container.getRootNode();
    const focus = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    if (!overlay.contains(focus)) this.measurementPreviousFocus = focus instanceof HTMLElement ? focus : null;
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
      const dialog = this.measurementModalDialog;
      if (!dialog || !e.composedPath().includes(dialog)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMeasurementModal(false);
      } else if (e.key === "Tab") {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>("input:checked, button:not(:disabled)"));
        const current = e.composedPath()[0];
        if (e.shiftKey && (current === controls[0] || current === dialog)) {
          e.preventDefault();
          controls.at(-1)?.focus();
        } else if (!e.shiftKey && (current === controls.at(-1) || current === dialog)) {
          e.preventDefault();
          controls[0]?.focus();
        }
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
        // Only activate once a polygon can legally close.
        if (!Array.isArray(markers) || markers.length < 3) return;

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

  private getSnapTargets(): SnapTarget[] {
    const targets: SnapTarget[] = [];
    for (const record of this.layerRegistry.getLayers()) {
      if (record.kind === "base" || record.kind === "measurement") continue;
      for (const featureId of record.featureIds) {
        const layer = this.featureLayers.get(featureId) as any;
        if (!layer || typeof layer.toGeoJSON !== "function") continue;
        const feature = layer.toGeoJSON() as Feature;
        targets.push({
          featureId,
          layerId: record.id,
          layerKind: record.kind,
          visible: record.visible,
          feature,
        });
      }
    }
    return targets;
  }

  private findSnapResult(raw: any, excludedFeatureId?: string): SnapResult | null {
    if (!this.map || !this.snappingOptions || this.snappingOptions.enabled === false || !raw) return null;
    return findSnap(
      { lat: Number(raw.lat), lng: Number(raw.lng) },
      this.getSnapTargets(),
      (latlng) => {
        const point = this.map!.latLngToContainerPoint([latlng.lat, latlng.lng]);
        return { x: point.x, y: point.y };
      },
      (point) => {
        const latlng = this.map!.containerPointToLatLng([point.x, point.y]);
        return { lat: latlng.lat, lng: latlng.lng };
      },
      this.snappingOptions,
      excludedFeatureId,
    );
  }

  private eventLatLng(event: any): any | null {
    if (event?.latlng) return event.latlng;
    const original = event?.originalEvent;
    const touch = original?.touches?.[0] ?? original?.changedTouches?.[0];
    if (touch && this.map) {
      try {
        return this.map.mouseEventToLatLng(touch);
      } catch {
        return null;
      }
    }
    return null;
  }

  private showSnapFeedback(result: SnapResult | null): void {
    if (!this.map || !this.snappingOptions || this.snappingOptions.enabled === false) return;
    if (!result) {
      if (this.snapFeedbackMarker) this.map.removeLayer(this.snapFeedbackMarker);
      this.snapFeedbackMarker = null;
      const old = this.container.querySelector(".geokit-snap-feedback-label");
      old?.remove();
      return;
    }
    if (!this.snapFeedbackMarker) {
      this.snapFeedbackMarker = this.L.circleMarker([result.latlng.lat, result.latlng.lng], {
        radius: 7,
        color: "#f59e0b",
        fillColor: "#fff7ed",
        fillOpacity: 0.85,
        weight: 3,
        className: "geokit-snap-feedback",
        interactive: false,
      } as any).addTo(this.map);
    } else {
      this.snapFeedbackMarker.setLatLng([result.latlng.lat, result.latlng.lng]);
    }
    let label = this.container.querySelector<HTMLDivElement>(".geokit-snap-feedback-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "geokit-snap-feedback-label";
      label.setAttribute("role", "status");
      label.setAttribute("aria-live", "polite");
      Object.assign(label.style, {
        position: "absolute", zIndex: "1000", pointerEvents: "none",
        padding: "3px 6px", borderRadius: "4px", background: "#fff7ed",
        color: "#7c2d12", border: "1px solid #f59e0b", font: "12px system-ui",
      });
      this.container.appendChild(label);
    }
    label.textContent = `Snapped to ${result.mode}`;
    const point = this.map.latLngToContainerPoint([result.latlng.lat, result.latlng.lng]);
    label.style.left = `${point.x + 10}px`;
    label.style.top = `${point.y + 10}px`;
  }

  private geometryFeatureForHandler(handler: any, cursor?: any): Feature | null {
    const shape = handler?._poly ?? handler?._shape;
    if (!shape) return null;
    if (handler?._poly?.getLatLngs) {
      const raw = handler._poly.getLatLngs();
      const source = Array.isArray(raw?.[0]) ? raw[0] : raw;
      const points = (Array.isArray(source) ? source : []).map((item: any) => [item.lng, item.lat]);
      const current = cursor ?? handler._currentLatLng;
      if (current && points.length && (points.at(-1)?.[0] !== current.lng || points.at(-1)?.[1] !== current.lat)) points.push([current.lng, current.lat]);
      if (handler.type === "polygon" || shape instanceof (this.L as any).Polygon) {
        if (points.length < 3) return null;
        const closed = points[0][0] === points.at(-1)?.[0] && points[0][1] === points.at(-1)?.[1] ? points : [...points, points[0]];
        return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closed] } } as Feature;
      }
      if (points.length < 2) return null;
      return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } } as Feature;
    }
    if (handler?._shape?.getLatLng && handler?._shape?.getRadius) {
      const center = handler._shape.getLatLng();
      const radius = handler._shape.getRadius();
      const latScale = 110574;
      const lngScale = latScale * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180));
      const coordinates = Array.from({ length: 65 }, (_, index) => {
        const angle = (index / 64) * Math.PI * 2;
        return [center.lng + (Math.cos(angle) * radius) / lngScale, center.lat + (Math.sin(angle) * radius) / latScale];
      });
      return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } } as Feature;
    }
    return typeof shape.toGeoJSON === "function" ? shape.toGeoJSON() as Feature : null;
  }

  private renderMeasurement(feature: Feature | null, cursor?: any): void {
    if (!this.measurementOverlayOptions?.enabled || !feature) return;
    const measured = measureGeoJSON(feature);
    if (!measured.ok) {
      this.logger.warn("measurement-overlay:failed", measured.error);
      return;
    }
    const formatted = formatMeasurements(measured.value, this.measurementSystem, {
      maximumFractionDigits: this.measurementOverlayOptions.maximumFractionDigits ?? 2,
      autoScale: this.measurementOverlayOptions.autoScale ?? true,
    });
    if (!formatted.ok) return;
    const lines: string[] = [];
    const options = this.measurementOverlayOptions;
    if (options.showLength !== false && measured.value.lengthMeters > 0) lines.push(`Length: ${formatted.value.length.text}`);
    if (options.showPerimeter !== false && measured.value.perimeterMeters > 0) lines.push(`Perimeter: ${formatted.value.perimeter.text}`);
    if (options.showArea !== false && measured.value.areaSquareMeters > 0) lines.push(`Area: ${formatted.value.area.text}`);
    if (!lines.length) return;
    let overlay = this.measurementOverlayElement;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "geokit-measurement-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      Object.assign(overlay.style, {
        position: "absolute", zIndex: "999", pointerEvents: "none",
        padding: "6px 8px", borderRadius: "5px", background: "rgba(255,255,255,.94)",
        color: "#1f2937", border: "1px solid #94a3b8", boxShadow: "0 1px 3px rgba(0,0,0,.18)",
        font: "12px/1.4 system-ui", whiteSpace: "pre-line",
      });
      this.container.appendChild(overlay);
      this.measurementOverlayElement = overlay;
    }
    overlay.textContent = lines.join("\n");
    const location = cursor ?? this.lastMeasurementLatLng ?? this.map?.getCenter();
    if (location && this.map) {
      const point = this.map.latLngToContainerPoint(location);
      overlay.style.left = `${point.x + 12}px`;
      overlay.style.top = `${point.y + 12}px`;
    }
    this.lastMeasurementFeature = feature;
    this.lastMeasurementLatLng = cursor ? this.L.latLng(cursor) : this.lastMeasurementLatLng;
  }

  private refreshMeasurementOverlay(): void {
    if (!this.measurementOverlayOptions?.enabled) return;
    this.renderMeasurement(this.lastMeasurementFeature, this.lastMeasurementLatLng);
  }

  private hideLiveOverlays(): void {
    this.measurementOverlayElement?.remove();
    this.measurementOverlayElement = null;
    this.lastMeasurementFeature = null;
    this.lastMeasurementLatLng = null;
    this.showSnapFeedback(null);
  }

  private installEditMarkerSnap(marker: any, vertexHandler: any, cleanups: Array<() => void>): void {
    if (!marker?.on || marker._geokitSnapBound) return;
    marker._geokitSnapBound = true;
    const originalDrag = vertexHandler._onMarkerDrag;
    const originalTouch = vertexHandler._onTouchMove;
    if (originalDrag) marker.off?.("drag", originalDrag, vertexHandler);
    const onDrag = (event: any) => {
      const featureId = vertexHandler._poly?._fid;
      const result = this.findSnapResult(marker.getLatLng?.(), featureId);
      this.showSnapFeedback(result);
      if (result) marker.setLatLng(result.latlng);
      originalDrag?.call(vertexHandler, { ...event, target: marker });
      this.renderMeasurement(vertexHandler._poly?.toGeoJSON?.() ?? null, marker.getLatLng?.());
    };
    marker.on("drag", onDrag, vertexHandler);
    if (originalTouch) {
      marker.off?.("touchmove", originalTouch, vertexHandler);
      const onTouch = (event: any) => {
        const raw = this.eventLatLng(event) ?? marker.getLatLng?.();
        const result = this.findSnapResult(raw, vertexHandler._poly?._fid);
        this.showSnapFeedback(result);
        if (result) {
          marker.setLatLng(result.latlng);
          originalDrag?.call(vertexHandler, { ...event, target: marker });
        } else {
          if (raw) marker.setLatLng?.(raw);
          if (originalTouch) {
            originalTouch.call(vertexHandler, { ...event, target: marker });
          } else {
            originalDrag?.call(vertexHandler, { ...event, target: marker });
          }
        }
        this.renderMeasurement(vertexHandler._poly?.toGeoJSON?.() ?? null, marker.getLatLng?.());
      };
      marker.on("touchmove", onTouch, vertexHandler);
      cleanups.push(() => marker.off?.("touchmove", onTouch, vertexHandler));
    }
    cleanups.push(() => {
      marker.off?.("drag", onDrag, vertexHandler);
      marker._geokitSnapBound = false;
      if (originalDrag) marker.on?.("drag", originalDrag, vertexHandler);
      if (originalTouch) marker.on?.("touchmove", originalTouch, vertexHandler);
    });
  }

  private installEditHandlerSnap(vertexHandler: any, cleanups: Array<() => void>): void {
    const originalCreate = vertexHandler?._createMarker;
    if (
      typeof originalCreate !== "function" ||
      vertexHandler._geokitSnapCreateMarker
    ) return;

    const hadOwnCreate = Object.prototype.hasOwnProperty.call(vertexHandler, "_createMarker");
    const ownCreate = vertexHandler._createMarker;
    const controller = this;
    const wrappedCreate = function patchedGeokitCreateMarker(this: any, ...args: any[]) {
      const marker = originalCreate.apply(this, args);
      controller.installEditMarkerSnap(marker, this, cleanups);
      return marker;
    };
    vertexHandler._geokitSnapCreateMarker = true;
    vertexHandler._createMarker = wrappedCreate;
    cleanups.push(() => {
      if (vertexHandler._createMarker === wrappedCreate) {
        if (hadOwnCreate) vertexHandler._createMarker = ownCreate;
        else delete vertexHandler._createMarker;
      }
      delete vertexHandler._geokitSnapCreateMarker;
    });
  }
  private installInteractionIntegrations(): void {
    this.interactionCleanup?.();

    this.interactionCleanup = null;
    this.hideLiveOverlays();
    if (!this.map || !this.drawControl) return;
    const cleanup: Array<() => void> = [];
    const editCleanup: Array<() => void> = [];
    const snappingEnabled = Boolean(this.snappingOptions?.enabled !== false && this.snappingOptions);
    let integrationActive = true;
    const measurementEnabled = Boolean(this.measurementOverlayOptions?.enabled);
    const clearEdit = () => { while (editCleanup.length) editCleanup.pop()?.(); this.showSnapFeedback(null); };

    if (snappingEnabled) {

      const modes = Object.values((this.drawControl as any)?._toolbars?.draw?._modes ?? {}) as any[];
      for (const mode of modes) {
        const handler = mode?.handler;
        if (!handler) continue;
        for (const method of ["_onMouseMove", "_onMouseDown", "_onMouseUp", "_onTouch"]) {
          const original = handler[method];
          if (typeof original !== "function") continue;
          const wrapped = (event: any) => {
            const raw = this.eventLatLng(event);
            const result = this.findSnapResult(raw);
            this.showSnapFeedback(result);
            const nextEvent = result ? { ...event, latlng: result.latlng } : event;
            const output = original.call(handler, nextEvent);
            if (result) {
              handler._currentLatLng = result.latlng;
              handler._mouseMarker?.setLatLng(result.latlng);
              if (typeof handler._updateGuide === "function") handler._updateGuide(this.map!.latLngToLayerPoint(result.latlng));
              handler._updateTooltip?.(result.latlng);
            }
            this.renderMeasurement(this.geometryFeatureForHandler(handler, result?.latlng), result?.latlng ?? raw);
            return output;
          };
          handler[method] = wrapped;
          cleanup.push(() => { if (handler[method] === wrapped) handler[method] = original; });
        }
      }
    }

    const onPointer = (event: any) => {
      const handler = (Object.values((this.drawControl as any)?._toolbars?.draw?._modes ?? {}) as any[])
        .map((mode) => mode?.handler)
        .find((candidate) => candidate?._enabled);
      if (!handler) return;
      const raw = this.eventLatLng(event);
      const result = snappingEnabled ? this.findSnapResult(raw) : null;
      if (snappingEnabled) this.showSnapFeedback(result);
      this.renderMeasurement(this.geometryFeatureForHandler(handler, result?.latlng ?? raw), result?.latlng ?? raw);
    };
    this.map.on("mousemove touchmove", onPointer);
    cleanup.push(() => this.map?.off("mousemove touchmove", onPointer));

    const onEditStart = () => {
      if (measurementEnabled) {
        for (const layer of this.drawnItems?.getLayers?.() ?? []) {
          const editLayer = layer as any;
          const onEdit = () => this.renderMeasurement(editLayer.toGeoJSON?.() ?? null, editLayer.getLatLng?.());
          editLayer.on?.("editdrag drag", onEdit);
          editCleanup.push(() => editLayer.off?.("editdrag drag", onEdit));
        }
      }
      if (!snappingEnabled) return;
      queueMicrotask(() => {
        if (!integrationActive) return;
        for (const layer of this.drawnItems?.getLayers?.() ?? []) {
          const edit = (layer as any).editing;
          for (const handler of edit?._verticesHandlers ?? []) {
            this.installEditHandlerSnap(handler, editCleanup);
            for (const marker of handler?._markers ?? []) this.installEditMarkerSnap(marker, handler, editCleanup);
          }
        }
      });
    };
    const onEditVertex = (event: any) => {
      const feature = event?.poly?.toGeoJSON?.() ?? event?.layer?.toGeoJSON?.();
      this.renderMeasurement(feature, event?.marker?.getLatLng?.() ?? event?.poly?.getCenter?.());
    };
    const onEditStop = () => { clearEdit(); this.hideLiveOverlays(); };
    const onDrawStop = () => { this.hideLiveOverlays(); };
    this.map.on("draw:editstart", onEditStart);
    this.map.on("draw:editvertex", onEditVertex);
    this.map.on("draw:editstop", onEditStop);
    this.map.on("draw:drawstop", onDrawStop);
    cleanup.push(() => {
      integrationActive = false;
      clearEdit();
      this.map?.off("draw:editstart", onEditStart);
      this.map?.off("draw:editvertex", onEditVertex);
      this.map?.off("draw:editstop", onEditStop);
      this.map?.off("draw:drawstop", onDrawStop);
    });

    this.interactionCleanup = () => {
      while (cleanup.length) cleanup.pop()?.();
      clearEdit();
      this.hideLiveOverlays();
    };
  }

  private bindDrawEvents(): void {
    if (!this.map || !this.drawnItems) return;

    const drawToolFromLayerType = (
      layerType: unknown,
    ): ToolButtonName | null => {
      const tool = layerType === "cake" ? "layerCake" : layerType;
      return [
        "polygon",
        "polyline",
        "rectangle",
        "circle",
        "marker",
        "layerCake",
        "move",
      ].includes(String(tool))
        ? (tool as ToolButtonName)
        : null;
    };

    this.map.on("draw:drawstart", (event: any) => {
      const tool = drawToolFromLayerType(event?.layerType);
      if (tool) {
        this.observePersistentToolStart(tool, { source: "leaflet-toolbar" });
      }
    });
    this.map.on("draw:editstart", () => {
      this.observePersistentToolStart("edit", { source: "leaflet-toolbar" });
    });
    this.map.on("draw:deletestart", () => {
      this.observePersistentToolStart("delete", { source: "leaflet-toolbar" });
    });
    this.map.on("draw:canceled", (event: any) => {
      const tool = drawToolFromLayerType(event?.layerType);
      if (tool && this.activeToolCommand?.tool === tool) {
        this.cancelActiveTool("Cancelled with Escape");
      }
    });
    this.map.on("draw:drawstop", (event: any) => {
      const tool = drawToolFromLayerType(event?.layerType);
      if (tool) this.handlePersistentToolStop(tool, "Draw interaction stopped");
    });
    this.map.on("draw:editstop", () => {
      this.handlePersistentToolStop("edit", "Edit interaction stopped");
    });
    this.map.on("draw:deletestop", () => {
      this.handlePersistentToolStop("delete", "Delete interaction stopped");
    });

    if (!this.toolEscapeKeyHandler) {
      this.toolEscapeKeyHandler = (event: KeyboardEvent) => {
        if (event.type !== "keydown" || event.defaultPrevented || event.repeat) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable], [role='dialog']")) return;
        if (event.key === "Escape" && this.activeToolCommand) {
          event.preventDefault();
          this.deactivateTool({ source: "api" });
        } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          const tool = this.activeToolCommand?.tool;
          if (tool === "edit" || tool === "delete") {
            const handler = this.findLeafletDrawHandler(tool);
            handler?.save?.();
            handler?.disable?.();
          } else if (tool === "move") {
            this.activeMoveHandler?.confirmMove();
            this.hideMoveConfirmationUI();
          } else {
            this.activateTool("save");
          }
        }
      };
      this.container.addEventListener("keydown", this.toolEscapeKeyHandler);
      this.container.addEventListener("keyup", this.toolEscapeKeyHandler);
    }

    // CREATED: single layer with layerType
    this.map.on((this.L as any).Draw.Event.CREATED, (e: any) => {
      try {
        const { layer, layerType } = e;

        if (layerType === DrawCake.TYPE) {
          try {
            if (this.activeCakeSession) this.emitCakeEvent("tool:layer-cake:cancelled");
            this.activeCakeSession?.destroy();
          } catch {
            // Ignore previous session cleanup failures
          }

          this.cakeSessionCommand = this.activeToolCommand;
          this.activeCakeSession = new LayerCakeManager(
            this.map!,
            layer as BundledL.Circle,
            (featureCollection) => {
              if (!this.drawnItems) return;
              const session = this.activeCakeSession!.snapshot();
              featureCollection.features.forEach((feature, index) => {
                feature.properties = { ...feature.properties, name: `${session.name} ${index === 0 ? "core" : `ring ${index}`}` };
              });
              const ids = this.store.add(featureCollection);
              const layerId = this.layerRegistry.add(ids, { name: session.name, kind: "drawn", style: session.style });
              const layers = this.L.geoJSON(featureCollection);

              let i = 0;
              layers.eachLayer((createdLayer: any) => {
                const id = ids[i] ?? ids[ids.length - 1];
                (createdLayer as any)._fid = id;
                this.featureLayers.set(id, createdLayer);
                this.drawnItems!.addLayer(createdLayer);
                this.installVertexContextMenu(createdLayer);
                this.options.callbacks?.onCreated?.({
                  id,
                  layerType: "polygon",
                  geoJSON: createdLayer.toGeoJSON(),
                });
                i++;
              });

              this.applyLayerRegistry();
              const command =
                this.activeToolCommand?.tool === "layerCake"
                  ? this.activeToolCommand
                  : null;
              this.emitCakeEvent("tool:layer-cake:saved", {
                layerId,
                featureCollection,
                source: command?.source,
                groupId: command?.groupId,
                commandId: command?.commandId,
              });
              this.activeCakeSession = null;
              this.cakeSessionCommand = null;
              if (command) {
                this.completeActiveTool(
                  { featureIds: ids, geometry: featureCollection },
                  true,
                );
                this.clearActiveTool(command);
              }
            },
            this.measurementSystem,
            () => this.emitCakeEvent("tool:layer-cake:session-changed"),
          );

          const command =
            this.activeToolCommand?.tool === "layerCake"
              ? this.activeToolCommand
              : null;
          this.emitCakeEvent("tool:layer-cake:session-started", {
            center: (layer as BundledL.Circle).getLatLng(),
            radius: (layer as BundledL.Circle).getRadius(),
            source: command?.source,
            groupId: command?.groupId,
            commandId: command?.commandId,
          });

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
        this.featureLayers.set(id, layer);
        this.layerRegistry.add([id], { name: `${layerType} layer`, kind: "drawn" });
        this.applyLayerRegistry();

        this.options.callbacks?.onCreated?.({ id, layerType, geoJSON: feat });
        const createdToolEvent =
          CREATED_LAYER_EVENT_BY_TYPE[layerType as CreatedLayerType];
        if (createdToolEvent) {
          this.emitToolEvent(createdToolEvent, {
            id,
            geoJSON: feat,
          });
        }
        if (this.activeToolCommand?.tool === layerType) {
          this.completeActiveTool({ featureIds: [id], geometry: feat }, true);
        }
      } catch (err) {
        this.failActiveTool(
          err instanceof Error ? err.message : "Draw completion failed",
        );
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
            this.featureLayers.set(newId, layer);
            this.layerRegistry.add([newId], { kind: "drawn" });
          }
        });

        const geoJSON = this.store.toFeatureCollection();
        this.options.callbacks?.onEdited?.({
          ids,
          geoJSON,
        });
        this.emitToolEvent("tool:edit:applied", {
          ids,
          geoJSON,
        });
        if (this.activeToolCommand?.tool === "edit") {
          this.completeActiveTool({ featureIds: ids, geometry: geoJSON }, true);
        }
      } catch (err) {
        this.failActiveTool(
          err instanceof Error ? err.message : "Edit completion failed",
        );
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
            this.featureLayers.delete(id);
            this.layerRegistry.removeFeature(id);
          }
        });

        const geoJSON = this.store.toFeatureCollection();
        this.options.callbacks?.onDeleted?.({
          ids,
          geoJSON,
        });
        this.emitToolEvent("tool:delete:applied", {
          ids,
          geoJSON,
        });
        this.applyLayerRegistry();
        if (this.activeToolCommand?.tool === "delete") {
          this.completeActiveTool({ featureIds: ids, geometry: geoJSON }, true);
        }
      } catch (err) {
        this.failActiveTool(
          err instanceof Error ? err.message : "Delete completion failed",
        );
        this._error("onDeleted handler failed", err);
      }
    });

    // MOVEEND: user has finished dragging a feature, show Save/Cancel UI
    this.map.on("draw:moveend", (e: any) => {
      try {
        this.emitToolEvent("tool:move:pending", {
          layerId: (e?.layer as any)?._fid,
          originalGeoJSON: e?.originalGeoJSON,
          newGeoJSON: e?.newGeoJSON,
        });
        this.showMoveConfirmationUI(e.layer);
      } catch (err) {
        this._error("draw:moveend handler failed", err);
      }
    });

    // MOVECONFIRMED: user clicked Save, update the store and emit event
    this.map.on("draw:moveconfirmed", (e: any) => {
      try {
        this.emitToolEvent("tool:move:confirmed", {
          layerId: (e?.layer as any)?._fid,
          originalGeoJSON: e?.originalGeoJSON,
          newGeoJSON: e?.newGeoJSON,
        });
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
        if (this.activeToolCommand?.tool === "move") {
          this.completeActiveTool(
            {
              featureIds: id ? [id] : [],
              geometry: e?.newGeoJSON,
            },
            false,
          );
        }

        this.hideMoveConfirmationUI();
      } catch (err) {
        this.failActiveTool(
          err instanceof Error ? err.message : "Move completion failed",
        );
        this._error("draw:moveconfirmed handler failed", err);
      }
    });
  }

  private _error(
    message: string,
    cause: unknown,
    options?: { code?: string; recoverable?: boolean },
  ): void {
    const detail: ErrorEventDetail = {
      code: options?.code ?? "controller_error",
      message,
      recoverable: options?.recoverable ?? true,
      cause,
      timestamp: Date.now(),
    };

    this.logger.error("error", detail);
    this.options.callbacks?.onError?.(detail);
  }

  // -------- Vertex deletion context menu --------

  private installVertexEditSurfaceMenu(): void {
    if (!this.map) return;

    try {
      this.vertexEditSurfaceCleanup?.();
    } catch {
      // Ignore errors when replacing vertex edit surface listeners
    }

    const mapContainer = this.map.getContainer();
    const handleContext = (event: MouseEvent) => {
      this.openNearestEditableVertexMenuFromDomEvent(event);
    };
    const handleClick = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        this.openNearestEditableVertexMenuFromDomEvent(event);
      }
    };

    mapContainer.addEventListener("contextmenu", handleContext, {
      capture: true,
    });
    mapContainer.addEventListener("click", handleClick, { capture: true });

    this.vertexEditSurfaceCleanup = () => {
      mapContainer.removeEventListener("contextmenu", handleContext, {
        capture: true,
      });
      mapContainer.removeEventListener("click", handleClick, { capture: true });
    };
  }

  private openNearestEditableVertexMenuFromDomEvent(event: MouseEvent): void {
    try {
      if (!this.map || !this.drawnItems) return;

      const containerPt = this.map.mouseEventToContainerPoint(event);
      const latlng = this.map.containerPointToLatLng(containerPt);
      let match: { layer: any; pathIndex: number; vertexIndex: number } | null =
        null;

      this.drawnItems.eachLayer((layer: any) => {
        if (match) return;

        const editing = (layer as any).editing;
        const isEditing =
          editing && typeof editing.enabled === "function" && editing.enabled();
        if (!isEditing) return;

        const nearest = this.findNearestVertex(layer, latlng, 16);
        if (!nearest) return;

        match = { layer, ...nearest };
      });

      if (!match) return;

      event.preventDefault();
      event.stopPropagation();
      this.showVertexMenu(containerPt, async () => {
        await this.deleteVertex(
          match!.layer,
          match!.pathIndex,
          match!.vertexIndex,
        );
      });
    } catch (err) {
      this._error("openNearestEditableVertexMenuFromDomEvent", err);
    }
  }

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
        // Close if clicking elsewhere. Shadow DOM retargets events to the
        // host, so use the composed path before falling back to contains().
        const path =
          typeof e.composedPath === "function" ? e.composedPath() : [];
        if (!path.includes(menu) && !menu.contains(e.target)) cleanup();
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

  private showMoveConfirmationUI(layer: any): void {
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
      ui.dataset.geokitMoveConfirmation = "";
      // Treat this overlay as a Leaflet control: touch taps must not start map
      // dragging or double-tap zoom and suppress the following native click.
      this.L.DomEvent.disableClickPropagation(ui);
      this.L.DomEvent.disableScrollPropagation(ui);
      ui.style.position = "absolute";
      const bounds = this.container.getBoundingClientRect();
      let bottom = 60;
      this.container.querySelectorAll<HTMLElement>("[data-geokit-managed-toolbar]").forEach(toolbar => {
        const rect = toolbar.getBoundingClientRect();
        if (rect.width && rect.height && toolbar.dataset.geokitToolbarPosition?.startsWith("bottom")) {
          bottom = Math.max(bottom, bounds.bottom - rect.top + 8);
        }
      });
      ui.style.bottom = `${bottom}px`;
      ui.style.maxWidth = "calc(100% - 32px)";
      ui.style.boxSizing = "border-box";
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
      saveBtn.style.minHeight = "44px";
      saveBtn.style.minWidth = "44px";
      saveBtn.style.whiteSpace = "nowrap";
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
      cancelBtn.style.minHeight = "44px";
      cancelBtn.style.minWidth = "44px";
      cancelBtn.style.whiteSpace = "nowrap";
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
        this.emitToolEvent("tool:move:cancelled", {
          layerId: (layer as any)?._fid,
        });
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
