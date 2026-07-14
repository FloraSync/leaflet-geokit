import { describe, expect, it, vi } from "vitest";
import { MapController } from "@src/lib/MapController";

type EventHandler = (event: any) => void;

class FakeMap {
  handlers = new Map<string, EventHandler>();

  on(eventName: string, handler: EventHandler): void {
    this.handlers.set(eventName, handler);
  }

  fire(eventName: string, event: any): void {
    const handler = this.handlers.get(eventName);
    if (!handler) throw new Error(`No handler registered for ${eventName}`);
    handler(event);
  }
}

class FakeFeatureGroup {
  layers: any[] = [];

  addLayer(layer: any): void {
    this.layers.push(layer);
  }
}

function createControllerHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const map = new FakeMap();
  const drawnItems = new FakeFeatureGroup();
  const onCreated = vi.fn();
  const toolEvents: Array<{ eventName: string; detail: unknown }> = [];
  const controller = new MapController({
    container,
    map: {
      latitude: 0,
      longitude: 0,
      zoom: 3,
      tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    },
    controls: { polygon: true },
    callbacks: { onCreated },
    leaflet: {
      Draw: {
        Event: {
          CREATED: "draw:created",
          EDITED: "draw:edited",
          DELETED: "draw:deleted",
        },
      },
      Polygon: class FakePolygon {},
      Polyline: class FakePolyline {},
    } as any,
    toolEventEmitter: {
      emit(eventName, detail) {
        toolEvents.push({ eventName, detail });
      },
    },
  });

  (controller as any).map = map;
  (controller as any).drawnItems = drawnItems;
  (controller as any).bindDrawEvents();

  return { container, map, drawnItems, onCreated, toolEvents };
}

describe("MapController draw runtime event bridge", () => {
  it("commits a created polygon into drawn layers, store, callbacks, and tool events", async () => {
    const { container, map, drawnItems, onCreated, toolEvents } =
      createControllerHarness();

    const polygonFeature = {
      type: "Feature",
      properties: { name: "runtime-polygon" },
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
      toGeoJSON: vi.fn(() => polygonFeature),
    };

    map.fire("draw:created", { layer, layerType: "polygon" });

    expect(drawnItems.layers).toEqual([layer]);
    expect(layer._fid).toEqual(expect.any(String));
    expect(layer.on).toHaveBeenCalledWith("contextmenu", expect.any(Function));
    expect(layer.on).toHaveBeenCalledWith("click", expect.any(Function));
    expect(onCreated).toHaveBeenCalledWith({
      id: layer._fid,
      layerType: "polygon",
      geoJSON: polygonFeature,
    });
    expect(toolEvents).toEqual([
      {
        eventName: "tool:polygon:created",
        detail: { id: layer._fid, geoJSON: polygonFeature },
      },
    ]);

    document.body.removeChild(container);
  });
});
