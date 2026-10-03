import type {
  DrawControlsConfig,
  ToolButtonConfig,
  ToolButtonName,
  ToolCapabilities,
  ToolCapability,
  ToolCapabilityReason,
  ToolProviderCapability,
  ToolToolbarGroupConfig,
} from "@src/types/public";

interface ToolDefinition {
  control?: keyof DrawControlsConfig;
  attribute?: string;
  behavior: ToolCapability["behavior"];
  mutates?: boolean;
  needsLayers?: boolean;
}

/** Complete, compile-time checked inventory of the existing command bus. */
export const TOOL_REGISTRY: Record<ToolButtonName, ToolDefinition> = {
  polygon: {
    control: "polygon",
    attribute: "draw-polygon",
    behavior: "draw",
    mutates: true,
  },
  polyline: {
    control: "polyline",
    attribute: "draw-polyline",
    behavior: "draw",
    mutates: true,
  },
  rectangle: {
    control: "rectangle",
    attribute: "draw-rectangle",
    behavior: "draw",
    mutates: true,
  },
  circle: {
    control: "circle",
    attribute: "draw-circle",
    behavior: "draw",
    mutates: true,
  },
  marker: {
    control: "marker",
    attribute: "draw-marker",
    behavior: "draw",
    mutates: true,
  },
  layerCake: {
    control: "cake",
    attribute: "draw-layer-cake",
    behavior: "draw",
    mutates: true,
  },
  move: {
    control: "move",
    attribute: "draw-move",
    behavior: "mode",
    mutates: true,
    needsLayers: true,
  },
  edit: {
    control: "edit",
    attribute: "edit-features",
    behavior: "mode",
    mutates: true,
    needsLayers: true,
  },
  delete: {
    control: "delete",
    attribute: "delete-features",
    behavior: "mode",
    mutates: true,
    needsLayers: true,
  },
  ruler: { control: "ruler", attribute: "draw-ruler", behavior: "mode" },
  measurementSettings: { behavior: "action" },
  layerStyle: { behavior: "action" },
  save: { behavior: "action" },
  select: { behavior: "deactivate" },
};

export interface ToolCapabilityContext {
  ready: boolean;
  readOnly: boolean;
  controls: DrawControlsConfig;
  available: Partial<Record<ToolButtonName, boolean>>;
  layerCount: number;
  selectedFeatureIds: readonly string[];
  activeTool: ToolButtonName | null;
  config?: ToolButtonConfig | null;
  groups?: ToolToolbarGroupConfig[] | null;
  errors?: Partial<Record<ToolButtonName, string>>;
  provider: ToolProviderCapability;
}

export function buildToolCapabilities(
  context: ToolCapabilityContext,
): ToolCapabilities {
  const tools = {} as ToolCapabilities["tools"];
  for (const tool of Object.keys(TOOL_REGISTRY) as ToolButtonName[]) {
    const definition = TOOL_REGISTRY[tool];
    const config = context.config?.[tool];
    let reason: ToolCapabilityReason | null = null;
    let state: ToolCapability["state"] = "disabled";
    if (!context.ready) {
      state = "unavailable";
      reason = { code: "not_ready", message: "Map controller is not ready" };
    } else if (definition.mutates && context.readOnly) {
      reason = {
        code: "read_only",
        message: "Map is read-only",
        requirement: "read-only=false",
      };
    } else if (definition.control && !context.controls[definition.control]) {
      reason = {
        code: "missing_attribute",
        message: `Enable ${definition.attribute} to use this tool`,
        requirement: definition.attribute,
      };
    } else if (tool === "delete" && !context.controls.edit) {
      // Leaflet.draw's remove handler belongs to the edit toolbar.
      reason = {
        code: "missing_attribute",
        message: "Enable edit-features to use delete",
        requirement: "edit-features",
      };
    } else if (definition.control && !context.available[tool]) {
      state = "unavailable";
      reason = {
        code: "unavailable_plugin",
        message: `Handler for ${tool} is unavailable`,
      };
    } else if (definition.needsLayers && context.layerCount === 0) {
      reason = {
        code: "no_editable_layers",
        message: "No editable layers are loaded",
      };
    } else if (
      config?.requirements?.selection &&
      context.selectedFeatureIds.length === 0
    ) {
      reason = {
        code: "empty_selection",
        message: "Select a feature first",
        requirement: "selection",
      };
    } else if (
      config?.requirements?.provider &&
      context.provider.state !== "enabled"
    ) {
      reason = context.provider.reason;
      state = context.provider.state;
    } else if (context.errors?.[tool]) {
      state = "unavailable";
      reason = { code: "runtime_error", message: context.errors[tool]! };
    } else if (config?.disabled) {
      reason = {
        code: "configured_disabled",
        message: "Disabled by host button configuration",
      };
    } else {
      state = "enabled";
    }
    tools[tool] = {
      tool,
      state,
      reason: reason ? { ...reason } : null,
      active: context.activeTool === tool,
      groupIds: [
        ...new Set(
          (context.groups ?? [])
            .filter((group) => group.tools.includes(tool))
            .map((group) => group.id),
        ),
      ],
      hotkey: null,
      commands: { activate: true, deactivate: true },
      commandEnabled:
        state === "enabled" ||
        reason?.code === "configured_disabled" ||
        reason?.code === "runtime_error",
      behavior: definition.behavior,
    };
  }
  return {
    tools,
    provider: {
      ...context.provider,
      reason: context.provider.reason ? { ...context.provider.reason } : null,
    },
    selectedFeatureIds: [...context.selectedFeatureIds],
  };
}

/** Apply the same snapshot to managed controls that hosts consume. */
export function reflectToolCapabilities(
  container: HTMLElement,
  snapshot: ToolCapabilities,
): void {
  for (const capability of Object.values(snapshot.tools)) {
    const dataTool = capability.tool.replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`,
    );
    container
      .querySelectorAll<HTMLButtonElement>(
        `.leaflet-geokit-toolbar-button[data-geokit-tool="${dataTool}"]`,
      )
      .forEach((button) => {
        button.disabled = capability.state !== "enabled";
        button.setAttribute("aria-disabled", String(button.disabled));
        button.dataset.geokitDisabled = String(button.disabled);
        button.dataset.geokitDisabledReason = capability.reason?.code ?? "";
        button.setAttribute(
          "part",
          `toolbar-button${capability.active ? " active" : ""}${button.disabled ? " disabled" : ""}`,
        );
      });
  }
}
