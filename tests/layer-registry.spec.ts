import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as L from "leaflet";
import type { FeatureCollection } from "geojson";
import { LayerRegistry } from "@src/lib/LayerRegistry";
import { MapController } from "@src/lib/MapController";

const polygon = (id = "bed"): FeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id,
      properties: { crop: "beans" },
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
    },
  ],
});

describe("portable layer registry", () => {
  it("supports all kinds and returns detached snapshots", () => {
    const registry = new LayerRegistry();
    registry.add([], { id: "base" }, "base");
    for (const kind of ["drawn", "imported", "guide", "measurement"] as const)
      registry.add([kind], { id: kind, kind });
    const layers = registry.getLayers();
    layers[1].featureIds.push("oops");
    layers[1].style.color = "red";
    expect(registry.getLayers()[1]).toMatchObject({
      featureIds: ["drawn"],
      style: {},
    });
    registry.reorderLayers(layers.map((layer) => layer.id).reverse());
    expect(registry.getLayers()[0]).toMatchObject({
      id: "measurement",
      order: 0,
    });
    expect(() => registry.reorderLayers(["base", "base"])).toThrow();
    expect(() => registry.setLayerStyle("drawn", { opacity: NaN })).toThrow();
    expect(() => registry.setLayerStyle("unknown", {})).toThrow();
    expect(() => registry.add([], { id: "base" })).toThrow();
  });
  it("validates snapshot membership and style before restore", () => {
    const registry = new LayerRegistry();
    registry.add([], { id: "base" }, "base");
    registry.add(["a"], { id: "beds" });
    const snapshot = registry.snapshot();
    expect(LayerRegistry.parseSnapshot(snapshot, ["a"])).toEqual(snapshot);
    snapshot.layers[1].featureIds.push("missing");
    expect(() => LayerRegistry.parseSnapshot(snapshot, ["a"])).toThrow();
    expect(registry.get("beds").featureIds).toEqual(["a"]);
  });
});

describe("layer controller integration", () => {
  let controller: MapController;
  let container: HTMLDivElement;
  let events: { name: string; detail: any }[];
  beforeEach(async () => {
    events = [];
    container = document.createElement("div");
    document.body.append(container);
    controller = new MapController({
      container,
      map: {
        latitude: 0,
        longitude: 0,
        zoom: 10,
        tileUrl: "",
        preferCanvas: false,
      },
      controls: { cake: true, polygon: true, edit: true, delete: true },
      callbacks: {
        onLayerEvent: (name, detail) => events.push({ name, detail }),
      },
    });
    await controller.init();
  });
  afterEach(async () => {
    await controller.destroy();
    container.remove();
  });

  it("renders visibility/style/order and round trips named groups including hidden data", async () => {
    await controller.importGeoJSON(polygon(), {
      layer: { id: "beds", name: "Bean beds", kind: "drawn" },
    });
    await controller.importGeoJSON(polygon("guide"), {
      behavior: "add",
      layer: { id: "guides", name: "Fence", kind: "guide" },
    });
    controller.setLayerStyle("beds", { color: "red", fillOpacity: 0.4 });
    controller.setLayerVisibility("beds", false);
    controller.setLayerVisibility("base", false);
    controller.reorderLayers(["base", "guides", "beds"]);
    const physical = (controller as any).featureLayers.get("bed");
    expect((controller as any).map.hasLayer(physical)).toBe(false);
    expect(physical.options).toMatchObject({ color: "red", fillOpacity: 0.4 });
    const before = controller.getLayers();
    const exported = await controller.exportGeoJSON({ preserveLayers: true });
    expect(exported.features).toHaveLength(2);
    expect(await controller.exportGeoJSON()).not.toHaveProperty(
      "geokit:layers",
    );
    await controller.importGeoJSON(JSON.parse(JSON.stringify(exported)), {
      preserveLayers: true,
    });
    expect(controller.getLayers()).toEqual(before);
    expect((controller as any).drawnItems.getLayers()).toHaveLength(1);
    controller.setLayerVisibility("beds", true);
    expect((controller as any).drawnItems.getLayers()).toHaveLength(2);
    const fit = vi.spyOn((controller as any).map, "fitBounds");
    await controller.focusLayer("beds");
    expect(fit).toHaveBeenCalled();
    await controller.removeLayer("beds");
    expect((await controller.getGeoJSON()).features.map((f) => f.id)).toEqual([
      "guide",
    ]);
    expect(controller.getLayers().map((l) => l.id)).toEqual(["base", "guides"]);
  });

  it("rejects malformed metadata and add restoration without losing current data", async () => {
    await controller.importGeoJSON(polygon());
    const before = await controller.getGeoJSON();
    await expect(
      controller.importGeoJSON(polygon("bad"), { preserveLayers: true }),
    ).rejects.toThrow();
    await expect(
      controller.importGeoJSON(polygon(), {
        preserveLayers: true,
        behavior: "add",
      }),
    ).rejects.toThrow();
    expect(await controller.getGeoJSON()).toEqual(before);
  });

  it("round trips expanded source geometry membership", async () => {
    const multi: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "trees",
          properties: { name: "Fruit trees" },
          geometry: {
            type: "MultiPoint",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    };
    await controller.importGeoJSON(multi, {
      layer: { id: "trees", name: "Fruit trees", kind: "imported" },
    });
    controller.setLayerVisibility("trees", false);
    controller.setLayerStyle("trees", { opacity: 0.5 });
    const before = controller.getLayers();
    const snapshot = await controller.exportGeoJSON({
      adapter: "source",
      preserveLayers: true,
    });
    expect(snapshot.features[0].geometry.type).toBe("MultiPoint");
    await controller.importGeoJSON(snapshot, { preserveLayers: true });
    expect(controller.getLayers()).toEqual(before);
    expect((controller as any).drawnItems.getLayers()).toHaveLength(0);
  });

  it("preserves basemap presentation across tile switches", async () => {
    controller.setLayerVisibility("base", false);
    controller.setLayerStyle("base", { opacity: 0.3 });
    controller.setTileLayer({
      urlTemplate: "https://example.invalid/{z}/{x}/{y}.png",
      attribution: "Test tiles",
    });
    expect(
      (controller as any).map.hasLayer((controller as any).tileLayer),
    ).toBe(false);
    controller.setLayerVisibility("base", true);
    expect((controller as any).tileLayer.options.opacity).toBe(0.3);
  });

  it("upserts existing ids without duplicate rendering or layer memberships", async () => {
    await controller.importGeoJSON(polygon(), { layer: { id: "old" } });
    await controller.importGeoJSON(polygon(), {
      behavior: "add",
      layer: { id: "new" },
    });
    expect((controller as any).drawnItems.getLayers()).toHaveLength(1);
    expect(controller.getLayers().map((layer) => layer.id)).toEqual([
      "base",
      "new",
    ]);
    const snapshot = await controller.exportGeoJSON({ preserveLayers: true });
    await expect(
      controller.importGeoJSON(snapshot, { preserveLayers: true }),
    ).resolves.toEqual(["bed"]);
  });

  it("reorders physical paths and excludes hidden polygons from merge", async () => {
    await controller.importGeoJSON(polygon("one"), { layer: { id: "one" } });
    await controller.importGeoJSON(polygon("two"), {
      behavior: "add",
      layer: { id: "two" },
    });
    const first = vi.spyOn(
      (controller as any).featureLayers.get("one"),
      "bringToFront",
    );
    const second = vi.spyOn(
      (controller as any).featureLayers.get("two"),
      "bringToFront",
    );
    controller.reorderLayers(["base", "two", "one"]);
    expect(second.mock.invocationCallOrder[0]).toBeLessThan(
      first.mock.invocationCallOrder[0],
    );
    controller.setLayerVisibility("two", false);
    expect(await controller.mergeVisiblePolygons()).toBe("one");
    expect((await controller.getGeoJSON()).features).toHaveLength(2);
  });

  it("keeps cancellation correlation when another tool supersedes the cake", () => {
    controller.activateTool("layerCake", {
      source: "host",
      commandId: "superseded-cake",
    });
    (controller as any).map.fire("draw:created", {
      layer: L.circle([0, 0], { radius: 50 }),
      layerType: "cake",
    });
    controller.activateTool("polygon");
    expect(controller.getLayerCakeSession()).toBeNull();
    expect(
      events.filter((event) => event.name === "tool:layer-cake:cancelled"),
    ).toHaveLength(1);
    expect(
      events.find((event) => event.name === "tool:layer-cake:cancelled")
        ?.detail,
    ).toMatchObject({ source: "host", commandId: "superseded-cake" });
  });

  it("keeps hidden feature updates and deletion in sync", async () => {
    await controller.importGeoJSON(polygon(), { layer: { id: "beds" } });
    controller.setLayerVisibility("beds", false);
    await controller.updateFeature("bed", polygon().features[0]);
    expect((controller as any).drawnItems.getLayers()).toHaveLength(0);
    await controller.removeFeature("bed");
    expect(controller.getLayers()).toHaveLength(1);
    expect((await controller.getGeoJSON()).features).toHaveLength(0);
  });

  it("creates a named cake group from editable session rings, and emits start/change/save/cancel", async () => {
    controller.activateTool("layerCake", {
      commandId: "cake-test",
      source: "sidebar",
    });
    (controller as any).map.fire("draw:created", {
      layer: L.circle([0, 0], { radius: 100 }),
      layerType: "cake",
    });
    expect(controller.getLayerCakeSession()?.rings).toEqual([{ radius: 100 }]);
    controller.updateLayerCakeSession({
      name: "Orchard",
      radii: [100, 150, 225],
      preset: "water",
    });
    const current = controller.getLayerCakeSession();
    expect(() =>
      controller.updateLayerCakeSession({ radii: [2, 1] }),
    ).toThrow();
    expect(controller.getLayerCakeSession()).toEqual(current);
    controller.saveLayerCakeSession();
    expect(controller.getLayerCakeSession()).toBeNull();
    expect(controller.getLayers()[1]).toMatchObject({
      name: "Orchard",
      kind: "drawn",
      style: { color: "#176da5" },
    });
    expect(controller.getLayers()[1].featureIds).toHaveLength(3);
    expect(
      events
        .filter((event) => event.name.startsWith("tool:"))
        .map((event) => event.name),
    ).toEqual([
      "tool:layer-cake:session-started",
      "tool:layer-cake:session-changed",
      "tool:layer-cake:saved",
    ]);
    expect(
      events.find((event) => event.name === "tool:layer-cake:saved")?.detail,
    ).toMatchObject({ commandId: "cake-test", session: { name: "Orchard" } });
    controller.activateTool("layerCake");
    (controller as any).map.fire("draw:created", {
      layer: L.circle([0, 0], { radius: 50 }),
      layerType: "cake",
    });
    controller.cancelLayerCakeSession();
    expect(
      events.filter((event) => event.name === "tool:layer-cake:cancelled"),
    ).toHaveLength(1);
    expect((await controller.getGeoJSON()).features).toHaveLength(3);
  });
});
