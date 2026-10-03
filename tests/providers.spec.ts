import { afterEach, describe, expect, it, vi } from "vitest";
import * as L from "leaflet";
import { MapController } from "@src/lib/MapController";
import {
  createCustomRasterProvider,
  createMapLibreBasemapAdapter,
  createRasterProvider,
  getProviderDiagnostics,
} from "@src/lib/providers";

const controllers: MapController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.destroy();
  document.body.replaceChildren();
});
async function makeController() {
  const container = document.createElement("div");
  document.body.append(container);
  const controller = new MapController({
    container,
    map: {
      latitude: 0,
      longitude: 0,
      zoom: 2,
      tileUrl: "/tiles/{z}/{x}/{y}.png",
    },
    controls: {},
  });
  controllers.push(controller);
  await controller.init();
  return { controller, container };
}

describe("provider v2 boundary", () => {
  it("preserves raster resolution and isolates custom configuration", () => {
    expect(
      createRasterProvider({ provider: "osm" }).resolve().urlTemplate,
    ).toContain("openstreetmap.org");
    const here = createRasterProvider({
      provider: " HERE ",
      apiKey: "fixture-key",
      style: "satellite.day",
    });
    expect(here.resolve().urlTemplate).toContain("style=satellite.day");
    expect(here.capabilities.apiKey).toBe("required");
    expect(() => createRasterProvider({ provider: "here" }).resolve()).toThrow(
      "requires an API key",
    );
    const config = {
      urlTemplate: "/tiles/{z}/{x}/{y}",
      attribution: "Local data",
      subdomains: ["a"],
    };
    const custom = createCustomRasterProvider(config);
    config.subdomains.push("b");
    custom.resolve().subdomains?.push("c");
    expect(custom.resolve().subdomains).toEqual(["a"]);
    expect(custom.capabilities.offline).toBe("unknown");
  });

  it("diagnostics expose no credentials, URL, style, or attribution HTML", () => {
    const provider = createRasterProvider({
      provider: "here",
      apiKey: "fixture-secret",
      attribution: "private attribution",
    });
    const report = getProviderDiagnostics(provider, "private attribution");
    expect(report).toEqual({
      kind: "raster",
      attribution: "present",
      attributionRequired: true,
      offline: "unsupported",
      apiKey: "required",
      drawing: "leaflet-draw",
      scope: "configuration",
    });
    expect(JSON.stringify(report)).not.toMatch(
      /fixture-secret|private attribution|https:/,
    );
    expect(getProviderDiagnostics(provider, " ").attribution).toBe("missing");
  });

  it("mounts the injected vector shim, removes it on raster switch, preserves data", async () => {
    const { controller, container } = await makeController();
    await controller.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "bed",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ],
    });
    const before = await controller.getGeoJSON();
    const removed = vi.fn();
    const layer = new L.Layer();
    layer.onAdd = () => layer;
    layer.onRemove = () => {
      removed();
      return layer;
    };
    controller.setBasemapAdapter(
      createMapLibreBasemapAdapter({
        createLayer: () => layer,
        attribution: "Vector fixture",
        offline: "host-managed",
        apiKey: "none",
      }),
    );
    expect(container.textContent).toContain("Vector fixture");
    expect(controller.getProviderDiagnostics()).toMatchObject({
      kind: "vector",
      offline: "host-managed",
      drawing: "leaflet-draw",
    });
    const snapshot = controller.getProviderDiagnostics()!;
    snapshot.kind = "raster";
    expect(controller.getProviderDiagnostics()?.kind).toBe("vector");
    expect(await controller.getGeoJSON()).toEqual(before);
    controller.setTileLayer(
      createRasterProvider({ provider: "osm" }).resolve(),
    );
    expect(removed).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Vector fixture");
    expect(controller.getProviderDiagnostics()?.kind).toBe("raster");
    expect(await controller.getGeoJSON()).toEqual(before);
  });

  it("rejects missing attribution and failed mounts without losing the current layer", async () => {
    const { controller, container } = await makeController();
    controller.setTileLayer({
      urlTemplate: "/tiles/{z}/{x}/{y}",
      attribution: "Working raster",
    });
    const createLayer = vi.fn(() => new L.Layer());
    expect(() =>
      controller.setBasemapAdapter(
        createMapLibreBasemapAdapter({ createLayer, attribution: " " }),
      ),
    ).toThrow("attribution");
    expect(createLayer).not.toHaveBeenCalled();
    const failed = new L.Layer();
    failed.onAdd = () => {
      throw new Error("renderer failure");
    };
    failed.onRemove = () => failed;
    expect(() =>
      controller.setBasemapAdapter(
        createMapLibreBasemapAdapter({
          createLayer: () => failed,
          attribution: "Failed vector",
        }),
      ),
    ).toThrow("failed to mount");
    expect(container.textContent).toContain("Working raster");
    expect(container.textContent).not.toContain("Failed vector");
    expect(controller.getProviderDiagnostics()?.kind).toBe("raster");
  });

  it("cleans up a vector layer on destruction and rejects layer reuse", async () => {
    const { controller } = await makeController();
    const removed = vi.fn();
    const layer = new L.Layer();
    layer.onAdd = () => layer;
    layer.onRemove = () => {
      removed();
      return layer;
    };
    const adapter = createMapLibreBasemapAdapter({
      createLayer: () => layer,
      attribution: "Fixture",
    });
    controller.setBasemapAdapter(adapter);
    expect(() => controller.setBasemapAdapter(adapter)).toThrow("fresh layer");
    await controller.destroy();
    expect(removed).toHaveBeenCalledOnce();
    expect(controller.getProviderDiagnostics()).toBeNull();
  });

  it("ignores late errors from removed raster layers", async () => {
    const { controller } = await makeController();
    const error = vi.fn();
    controller.setTileLayer(
      { urlTemplate: "/old/{z}/{x}/{y}", attribution: "Old" },
      { onTileError: error },
    );
    let oldLayer: L.TileLayer | undefined;
    const vector = new L.Layer();
    vector.onAdd = (map) => {
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) oldLayer = layer;
      });
      return vector;
    };
    vector.onRemove = () => vector;
    controller.setBasemapAdapter(
      createMapLibreBasemapAdapter({
        createLayer: () => vector,
        attribution: "New",
      }),
    );
    expect(oldLayer).toBeDefined();
    oldLayer!.fire("tileerror", { error: new Error("old request failed") });
    expect(error).not.toHaveBeenCalled();
    expect(controller.getProviderDiagnostics()?.kind).toBe("vector");
  });
});
