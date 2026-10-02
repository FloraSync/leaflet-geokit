import { afterEach, describe, expect, it, vi } from "vitest";
import { buildToolCapabilities, TOOL_REGISTRY, type ToolCapabilityContext } from "@src/lib/tool-capabilities";
import { MapController } from "@src/lib/MapController";
import type { LeafletDrawMapElement } from "@src/index";
import "@src/index";
import type { ToolButtonName } from "@src/types/public";

function context(overrides: Partial<ToolCapabilityContext> = {}): ToolCapabilityContext {
  return {
    ready: true, readOnly: false,
    controls: { polygon: true, polyline: true, rectangle: true, circle: true, marker: true, cake: true, move: true, edit: true, delete: true, ruler: true },
    available: Object.fromEntries(Object.keys(TOOL_REGISTRY).map((tool) => [tool, true])),
    layerCount: 1, selectedFeatureIds: [], activeTool: null,
    provider: { requested: "osm", active: "osm", state: "enabled", reason: null },
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("tool capability inventory", () => {
  it("covers every existing tool with detached metadata and actual shortcut support", () => {
    const input = context({ activeTool: "polygon", groups: [{ id: "primary", tools: ["polygon"] }, { id: "secondary", tools: ["polygon"] }] });
    const snapshot = buildToolCapabilities(input);
    expect(Object.keys(snapshot.tools)).toHaveLength(14);
    for (const tool of Object.keys(TOOL_REGISTRY) as ToolButtonName[]) {
      expect(snapshot.tools[tool]).toMatchObject({ tool, state: "enabled", reason: null, hotkey: null, commands: { activate: true, deactivate: true }, commandEnabled: true });
    }
    expect(snapshot.tools.polygon).toMatchObject({ active: true, behavior: "draw", groupIds: ["primary", "secondary"] });
    snapshot.tools.polygon.groupIds.pop();
    snapshot.provider.active = "changed";
    expect(buildToolCapabilities(input).tools.polygon.groupIds).toHaveLength(2);
    expect(input.provider.active).toBe("osm");
  });

  it.each(["polygon", "polyline", "rectangle", "circle", "marker", "layerCake", "move", "edit", "delete"] as const)("reflects read-only for %s without disabling save/ruler", (tool) => {
    const snapshot = buildToolCapabilities(context({ readOnly: true }));
    expect(snapshot.tools[tool].reason?.code).toBe("read_only");
    expect(snapshot.tools[tool].commandEnabled).toBe(false);
    expect(snapshot.tools.save.state).toBe("enabled");
    expect(snapshot.tools.ruler.state).toBe("enabled");
  });

  it("distinguishes missing attributes from missing plugins and absent editable data", () => {
    const input = context();
    input.controls.polygon = false;
    input.controls.edit = false;
    input.available.ruler = false;
    input.layerCount = 0;
    const snapshot = buildToolCapabilities(input);
    expect(snapshot.tools.polygon.reason).toMatchObject({ code: "missing_attribute", requirement: "draw-polygon" });
    expect(snapshot.tools.delete.reason?.requirement).toBe("edit-features");
    expect(snapshot.tools.ruler).toMatchObject({ state: "unavailable", reason: { code: "unavailable_plugin" } });
    expect(snapshot.tools.move.reason?.code).toBe("no_editable_layers");
    expect(buildToolCapabilities(context({ layerCount: 0 })).tools.edit.reason?.code).toBe("no_editable_layers");
  });

  it("supports opt-in selection/provider prerequisites without breaking local actions", () => {
    const input = context({ config: { layerStyle: { requirements: { selection: true } }, save: { requirements: { provider: true } } }, provider: { requested: "here", active: "osm", state: "unavailable", reason: { code: "missing_api_key", message: "API key required" } } });
    expect(buildToolCapabilities(input).tools.layerStyle.reason?.code).toBe("empty_selection");
    expect(buildToolCapabilities(input).tools.save.reason?.code).toBe("missing_api_key");
    expect(buildToolCapabilities(input).tools.polygon.state).toBe("enabled");
    input.selectedFeatureIds = ["bed"];
    input.provider = { requested: "osm", active: "osm", state: "enabled", reason: null };
    expect(buildToolCapabilities(input).tools.layerStyle.state).toBe("enabled");
    expect(buildToolCapabilities(input).tools.save.state).toBe("enabled");
  });

  it("reports host-disabled UI separately from command support and permits runtime retries", () => {
    const snapshot = buildToolCapabilities(context({ config: { save: { disabled: true } }, errors: { polygon: "Handler failed" } }));
    expect(snapshot.tools.save).toMatchObject({ state: "disabled", commandEnabled: true, reason: { code: "configured_disabled" } });
    expect(snapshot.tools.polygon).toMatchObject({ state: "unavailable", commandEnabled: true, reason: { code: "runtime_error" } });
  });

  it("returns not_ready from an unconnected element", () => {
    const map = document.createElement("leaflet-geokit") as LeafletDrawMapElement;
    expect(map.getToolCapabilities().tools.save.reason?.code).toBe("not_ready");
  });
});

describe("controller capability notifications", () => {
  it("captures thrown activation, emits changed snapshot, and recovers on successful retry", async () => {
    const onToolCapabilitiesChanged = vi.fn();
    const controller = new MapController({ container: document.createElement("div"), map: { latitude: 0, longitude: 0, zoom: 2, tileUrl: "" }, controls: context().controls, callbacks: { onToolCapabilitiesChanged } });
    const runtime = controller as any;
    runtime.map = { off: vi.fn(), remove: vi.fn() };
    runtime.drawnItems = { getLayers: () => [] };
    const enable = vi.fn().mockImplementationOnce(() => { throw new Error("Broken draw handler"); });
    runtime.drawControl = { _toolbars: { draw: { _modes: { polygon: { handler: { enable, disable: vi.fn() } } } } } };
    expect(controller.activateTool("polygon")).toBe(false);
    await Promise.resolve();
    expect(onToolCapabilitiesChanged.mock.lastCall?.[0].tools.polygon.reason.code).toBe("runtime_error");
    expect(controller.activateTool("polygon")).toBe(true);
    await Promise.resolve();
    expect(controller.getToolCapabilities().tools.polygon).toMatchObject({ state: "enabled", active: true });
    const calls = onToolCapabilitiesChanged.mock.calls.length;
    controller.setToolbarGroups([]);
    await Promise.resolve();
    expect(onToolCapabilitiesChanged).toHaveBeenCalledTimes(calls);
    await controller.destroy();
  });

  it("validates host selection and blocks opted-in actions until prerequisites are met", async () => {
    const controller = new MapController({ container: document.createElement("div"), map: { latitude: 0, longitude: 0, zoom: 2, tileUrl: "" }, controls: context().controls, toolButtonConfig: { layerStyle: { requirements: { selection: true } } } });
    const runtime = controller as any;
    runtime.map = { off: vi.fn(), remove: vi.fn() };
    runtime.drawnItems = { getLayers: () => [] };
    runtime.store.add({ type: "FeatureCollection", features: [{ type: "Feature", id: "bed", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }] });
    expect(controller.activateTool("layerStyle")).toBe(false);
    controller.setToolSelection(["unknown", "bed", "bed"]);
    expect(controller.getToolCapabilities().selectedFeatureIds).toEqual(["bed"]);
    expect(controller.activateTool("layerStyle")).toBe(true);
    runtime.drawnItems = null;
    await controller.removeFeature("bed");
    expect(controller.getToolCapabilities().selectedFeatureIds).toEqual([]);
    await controller.destroy();
  });
});
