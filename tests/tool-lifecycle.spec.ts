import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Feature } from "geojson";
import { MapController } from "@src/lib/MapController";
import type {
  ToolButtonName,
  ToolEventDetail,
  ToolLifecycleEventName,
} from "@src/types/public";
import "@src/index";

type RecordedEvent = {
  name: ToolLifecycleEventName;
  detail: ToolEventDetail;
};

type Handler = {
  enable: Mock<() => void>;
  disable: Mock<() => void>;
};

const DRAW_TOOLS = [
  "polygon",
  "polyline",
  "rectangle",
  "circle",
  "marker",
  "layerCake",
  "move",
] as const satisfies readonly ToolButtonName[];
const EDIT_TOOLS = [
  "edit",
  "delete",
] as const satisfies readonly ToolButtonName[];
const PERSISTENT_TOOLS = [
  ...DRAW_TOOLS,
  ...EDIT_TOOLS,
  "ruler",
] as const satisfies readonly ToolButtonName[];
const ACTION_TOOLS = [
  "select",
  "measurementSettings",
  "layerStyle",
  "save",
] as const satisfies readonly ToolButtonName[];

class FakeMap {
  private handlers = new Map<string, Array<(event: any) => void>>();

  on(eventName: string, handler: (event: any) => void): void {
    for (const name of eventName.split(" ")) {
      const handlers = this.handlers.get(name) ?? [];
      handlers.push(handler);
      this.handlers.set(name, handlers);
    }
  }

  fire(eventName: string, event: any = {}): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(event);
    }
  }
}

class FakeFeatureGroup {
  layers: any[] = [];

  addLayer(layer: any): void {
    this.layers.push(layer);
  }
}

function createController() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const events: RecordedEvent[] = [];
  const controller = new MapController({
    container,
    map: {
      latitude: 0,
      longitude: 0,
      zoom: 3,
      tileUrl: "https://example.test/{z}/{x}/{y}.png",
    },
    controls: {
      polygon: true,
      polyline: true,
      rectangle: true,
      circle: true,
      cake: true,
      marker: true,
      move: true,
      edit: true,
      delete: true,
      ruler: true,
    },
    callbacks: {
      onToolEvent(name, detail) {
        events.push({ name, detail });
      },
    },
  });
  const handlers = Object.fromEntries(
    [...DRAW_TOOLS, ...EDIT_TOOLS].map((tool) => [
      tool,
      { enable: vi.fn(), disable: vi.fn() },
    ]),
  ) as Record<
    (typeof DRAW_TOOLS)[number] | (typeof EDIT_TOOLS)[number],
    Handler
  >;
  (controller as any).drawControl = {
    _toolbars: {
      draw: {
        _modes: {
          polygon: { handler: handlers.polygon },
          polyline: { handler: handlers.polyline },
          rectangle: { handler: handlers.rectangle },
          circle: { handler: handlers.circle },
          marker: { handler: handlers.marker },
          cake: { handler: handlers.layerCake },
          move: { handler: handlers.move },
        },
      },
      edit: {
        _modes: {
          edit: { handler: handlers.edit },
          remove: { handler: handlers.delete },
        },
      },
    },
  };
  (controller as any).rulerControl = { _toggleMeasure: vi.fn() };
  return { container, controller, events, handlers };
}

function names(events: RecordedEvent[]): ToolLifecycleEventName[] {
  return events.map((event) => event.name);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("correlated public tool lifecycle", () => {
  it.each(PERSISTENT_TOOLS)(
    "starts persistent tool %s in documented order",
    (tool) => {
      const { controller, events } = createController();

      expect(
        controller.activateTool(tool, {
          source: "outside-button",
          groupId: "field-panel",
          commandId: `start-${tool}`,
        }),
      ).toBe(true);

      expect(names(events)).toEqual([
        "leaflet-geokit:tool-command",
        "leaflet-geokit:tool-commanded",
        "leaflet-geokit:tool-started",
        "leaflet-geokit:tool-state-changed",
      ]);
      for (const event of events) {
        expect(event.detail).toMatchObject({
          tool,
          action: "activate",
          source: "outside-button",
          groupId: "field-panel",
          commandId: `start-${tool}`,
          featureIds: [],
        });
      }
      expect(events.at(-1)?.detail).toMatchObject({
        previousTool: null,
        activeTool: tool,
      });
    },
  );

  it.each(ACTION_TOOLS)(
    "completes action tool %s without creating stale active state",
    (tool) => {
      const { controller, events } = createController();

      expect(
        controller.activateTool(tool, {
          source: "outside-button",
          groupId: "field-panel",
          commandId: `action-${tool}`,
        }),
      ).toBe(true);

      expect(names(events)).toEqual([
        "leaflet-geokit:tool-command",
        "leaflet-geokit:tool-commanded",
        "leaflet-geokit:tool-completed",
      ]);
      expect(events.at(-1)?.detail).toMatchObject({
        tool,
        commandId: `action-${tool}`,
        previousTool: null,
        activeTool: null,
      });
      if (tool === "save") {
        expect(events.at(-1)?.detail.geometry).toEqual({
          type: "FeatureCollection",
          features: [],
        });
      }
    },
  );

  it("correlates switches, repeated commands, and explicit deactivation without duplicate state", () => {
    const { controller, events } = createController();
    controller.activateTool("polygon", { commandId: "polygon-1" });
    events.length = 0;

    controller.activateTool("rectangle", { commandId: "rectangle-1" });
    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-cancelled",
      "leaflet-geokit:tool-started",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(events[2].detail).toMatchObject({
      tool: "polygon",
      commandId: "polygon-1",
      activeTool: null,
    });
    expect(events.at(-1)?.detail).toMatchObject({
      previousTool: "polygon",
      activeTool: "rectangle",
      commandId: "rectangle-1",
    });

    events.length = 0;
    controller.activateTool("rectangle", { commandId: "rectangle-2" });
    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-cancelled",
      "leaflet-geokit:tool-started",
    ]);
    expect(events[2].detail.commandId).toBe("rectangle-1");
    expect(events[3].detail).toMatchObject({
      commandId: "rectangle-2",
      activeTool: "rectangle",
    });

    events.length = 0;
    controller.deactivateTool({ commandId: "select-1" });
    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-cancelled",
      "leaflet-geokit:tool-state-changed",
      "leaflet-geokit:tool-completed",
    ]);
    expect(events.at(-1)?.detail).toMatchObject({
      tool: "select",
      commandId: "select-1",
      previousTool: "rectangle",
      activeTool: null,
    });
  });

  it.each([
    ["unavailable", undefined],
    ["throws", new Error("handler exploded")],
  ] as const)("reports %s activation failures with correlation", (_, error) => {
    const { controller, events, handlers } = createController();
    if (error) {
      handlers.polygon.enable.mockImplementation(() => {
        throw error;
      });
    } else {
      (controller as any).drawControl = null;
    }

    expect(
      controller.activateTool("polygon", {
        source: "outside-button",
        groupId: "field-panel",
        commandId: "failed-polygon",
      }),
    ).toBe(false);

    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-failed",
    ]);
    expect(events.at(-1)?.detail).toMatchObject({
      tool: "polygon",
      commandId: "failed-polygon",
      source: "outside-button",
      groupId: "field-panel",
      activeTool: null,
      reason: expect.any(String),
    });
  });

  it("completes a draw with feature ids and geometry, then clears state once", () => {
    const { controller, events, handlers } = createController();
    const map = new FakeMap();
    const drawnItems = new FakeFeatureGroup();
    (controller as any).map = map;
    (controller as any).drawnItems = drawnItems;
    (controller as any).bindDrawEvents();
    handlers.polygon.enable.mockImplementation(() => {
      map.fire("draw:drawstart", { layerType: "polygon" });
    });
    const geometry: Feature = {
      type: "Feature",
      properties: { crop: "corn" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    };
    const layer: any = {
      on: vi.fn(),
      toGeoJSON: vi.fn(() => geometry),
    };

    controller.activateTool("polygon", {
      source: "outside-button",
      groupId: "field-panel",
      commandId: "draw-polygon",
    });
    map.fire("draw:created", { layer, layerType: "polygon" });
    map.fire("draw:drawstop", { layerType: "polygon" });

    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-started",
      "leaflet-geokit:tool-state-changed",
      "leaflet-geokit:tool-completed",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(events[4].detail).toMatchObject({
      commandId: "draw-polygon",
      featureIds: [layer._fid],
      geometry,
      activeTool: "polygon",
    });
    expect(events[5].detail).toMatchObject({
      previousTool: "polygon",
      activeTool: null,
    });
  });

  it("emits one cancellation and one state change for Escape", () => {
    const { controller, events, handlers } = createController();
    const map = new FakeMap();
    (controller as any).map = map;
    (controller as any).drawnItems = new FakeFeatureGroup();
    (controller as any).bindDrawEvents();
    handlers.polygon.enable.mockImplementation(() => {
      map.fire("draw:drawstart", { layerType: "polygon" });
    });
    controller.activateTool("polygon", { commandId: "escape-polygon" });
    events.length = 0;

    map.fire("draw:canceled", { layerType: "polygon" });
    map.fire("draw:drawstop", { layerType: "polygon" });

    expect(names(events)).toEqual([
      "leaflet-geokit:tool-cancelled",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(events[0].detail).toMatchObject({
      commandId: "escape-polygon",
      reason: "Cancelled with Escape",
      activeTool: null,
    });
  });

  it("observes a synchronous native toolbar start exactly once", () => {
    const { container, controller, events, handlers } = createController();
    const map = new FakeMap();
    (controller as any).map = map;
    (controller as any).drawnItems = new FakeFeatureGroup();
    (controller as any).bindDrawEvents();
    container.innerHTML =
      '<a class="leaflet-draw-draw-polygon" title="Draw polygon"></a>';
    const button = container.querySelector("a") as HTMLAnchorElement;
    handlers.polygon.enable.mockImplementation(() => {
      map.fire("draw:drawstart", { layerType: "polygon" });
    });
    button.addEventListener("click", () => handlers.polygon.enable());
    (controller as any).applyToolButtonCustomizations();

    button.click();

    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-started",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(events[0].detail).toMatchObject({
      tool: "polygon",
      source: "leaflet-toolbar",
      commandId: expect.any(String),
    });
    expect(new Set(events.map((event) => event.detail.commandId)).size).toBe(1);
  });

  it("routes managed toolbar activation through one correlated lifecycle", () => {
    const { container, controller, events, handlers } = createController();
    const map = new FakeMap();
    (controller as any).map = map;
    (controller as any).drawnItems = new FakeFeatureGroup();
    (controller as any).bindDrawEvents();
    handlers.polygon.enable.mockImplementation(() => {
      map.fire("draw:drawstart", { layerType: "polygon" });
    });
    controller.setToolbarGroups([{ id: "managed-tools", tools: ["polygon"] }]);

    const button = container.querySelector(
      '[data-geokit-toolbar-group="managed-tools"] [data-geokit-tool="polygon"]',
    ) as HTMLButtonElement;
    button.click();

    expect(names(events)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-started",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(events[0].detail).toMatchObject({
      tool: "polygon",
      source: "toolbar",
      groupId: "managed-tools",
      commandId: expect.any(String),
    });
    expect(new Set(events.map((event) => event.detail.commandId)).size).toBe(1);
  });

  it("normalizes event commands without re-emitting the inbound command", () => {
    const { controller, events } = createController();
    const command = {
      tool: "save",
      source: "host-event",
      groupId: "outside-controls",
      commandId: "event-save",
    } as const;

    expect(controller.handleToolCommand({ ...command })).toBe(true);
    expect(names(events)).toEqual([
      "leaflet-geokit:tool-commanded",
      "leaflet-geokit:tool-completed",
    ]);
    expect(events[0].detail).toMatchObject(command);
  });

  it("emits a correlated command/failure pair when the public element has no controller", async () => {
    const element = document.createElement("leaflet-geokit") as any;
    const events: Array<{ name: string; detail: ToolEventDetail }> = [];
    for (const name of [
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-failed",
    ]) {
      element.addEventListener(name, (event: CustomEvent<ToolEventDetail>) => {
        events.push({ name, detail: event.detail });
      });
    }

    await expect(
      element.activateTool("polygon", {
        source: "outside-button",
        groupId: "field-panel",
        commandId: "no-controller",
      }),
    ).resolves.toBe(false);

    expect(events.map((event) => event.name)).toEqual([
      "leaflet-geokit:tool-command",
      "leaflet-geokit:tool-failed",
    ]);
    expect(events[0].detail).toMatchObject({
      commandId: "no-controller",
      previousTool: null,
      activeTool: null,
      featureIds: [],
    });
    expect(events[1].detail).toMatchObject({
      commandId: "no-controller",
      reason: "Map controller is not initialized",
    });
  });
});
