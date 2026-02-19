import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as L from "leaflet";
import { MapController } from "@src/lib/MapController";

// Mock Leaflet.draw if needed, though it should be available in happy-dom via imports
if (!(L.Control as any).Draw) {
  (L.Control as any).Draw = class MockDraw extends L.Control {
    initialize(options: any) {
      (this as any).options = options;
    }
    onAdd() {
      return document.createElement("div");
    }
  };
}

describe("MapController", () => {
  let container: HTMLDivElement;
  let opts: any;

  beforeEach(() => {
    container = document.createElement("div");
    // Leaflet needs the container to have some dimensions to not complain in some environments
    container.style.width = "400px";
    container.style.height = "400px";
    document.body.appendChild(container);

    opts = {
      container,
      map: {
        latitude: 0,
        longitude: 0,
        zoom: 2,
        tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
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
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("initializes correctly with full controls", async () => {
    const controller = new MapController(opts);
    await controller.init();
    expect((controller as any).map).toBeDefined();

    // Check if draw control was added
    const drawControl = (controller as any).drawControl;
    expect(drawControl).toBeDefined();
    controller.destroy();
  });

  it("handles read-only mode", async () => {
    opts.readOnly = true;
    const controller = new MapController(opts);
    await controller.init();

    const options = (controller as any).buildDrawOptions(opts.controls, true);
    expect(options.draw).toBe(false);
    expect(options.edit).toBe(false);
    controller.destroy();
  });

  it("disables delete when requested", async () => {
    opts.controls.delete = false;
    const controller = new MapController(opts);
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.edit.remove).toBe(false);
    controller.destroy();
  });

  it("enables move tool draw options when requested", () => {
    const controller = new MapController(opts);
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.draw.move).toBeTruthy();
    expect(options.draw.move.featureGroup).toBe((controller as any).drawnItems);

    controller.destroy();
  });

  it("disables move tool draw options when not requested", () => {
    opts.controls.move = false;
    const controller = new MapController(opts);
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.draw.move).toBe(false);

    controller.destroy();
  });

  it("clears layers via store", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const storeSpy = vi.spyOn((controller as any).store, "clear");
    controller.clearLayers();
    expect(storeSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("adds features to store", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const storeSpy = vi.spyOn((controller as any).store, "add");
    controller.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: {},
        },
      ],
    });
    expect(storeSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("sets view on map", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const mapSpy = vi.spyOn((controller as any).map, "setView");
    controller.setView(10, 20, 5);
    expect(mapSpy).toHaveBeenCalledWith(expect.anything(), 5);
    controller.destroy();
  });

  it("fits bounds to data", async () => {
    const controller = new MapController(opts);
    await controller.init();

    vi.spyOn((controller as any).store, "bounds").mockReturnValue([
      [0, 0],
      [1, 1],
    ]);
    const mapSpy = vi.spyOn((controller as any).map, "fitBounds");

    controller.fitBoundsToData(0.1);
    expect(mapSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("falls back to bundled Leaflet when external mode is requested but Draw is missing", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => logger),
      setLevel: vi.fn(),
    } as any;

    const originalGlobalL = (globalThis as any).L;
    (globalThis as any).L = {
      map: vi.fn(),
      Control: {},
      draw: undefined,
    };

    const controller = new MapController({
      ...opts,
      logger,
      useExternalLeaflet: true,
      leaflet: {
        map: vi.fn(),
        Control: {},
        draw: undefined,
      } as any,
    });

    try {
      expect((controller as any).L).toBe(L);
      expect(logger.warn).toHaveBeenCalledWith(
        "leaflet-runtime:external-fallback-bundled",
        expect.objectContaining({
          message: expect.stringContaining("falling back to bundled"),
        }),
      );
    } finally {
      (globalThis as any).L = originalGlobalL;
      controller.destroy();
    }
  });

  describe("mergeVisiblePolygons", () => {
    it("returns null when no polygons exist", async () => {
      const controller = new MapController(opts);
      await controller.init();

      // Mock getGeoJSON to return no features
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [],
      });

      const result = await controller.mergeVisiblePolygons();
      expect(result).toBeNull();
      controller.destroy();
    });

    it("returns existing ID when only one polygon exists", async () => {
      const controller = new MapController(opts);
      await controller.init();

      const polygonFeature = {
        type: "Feature" as const,
        id: "test-polygon-id",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {},
      };

      // Mock getGeoJSON to return one polygon
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [polygonFeature],
      });

      const result = await controller.mergeVisiblePolygons();
      expect(result).toBe("test-polygon-id");
      controller.destroy();
    });

    it("merges multiple polygons", async () => {
      const controller = new MapController(opts);
      await controller.init();

      const polygon1 = {
        type: "Feature" as const,
        id: "poly1",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: { name: "first" },
      };

      const polygon2 = {
        type: "Feature" as const,
        id: "poly2",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        },
        properties: { name: "second" },
      };

      // Mock getGeoJSON to return multiple polygons
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [polygon1, polygon2],
      });

      // Mock removeFeature and addFeatures
      const removeSpy = vi
        .spyOn(controller, "removeFeature")
        .mockResolvedValue();
      const addSpy = vi
        .spyOn(controller, "addFeatures")
        .mockResolvedValue(["merged-id"]);

      const result = await controller.mergeVisiblePolygons({
        properties: { merged: true },
      });

      expect(result).toBe("merged-id");
      expect(removeSpy).toHaveBeenCalledWith("poly1");
      expect(removeSpy).toHaveBeenCalledWith("poly2");
      expect(addSpy).toHaveBeenCalled();
      controller.destroy();
    });

    it("handles merge failure gracefully", async () => {
      const controller = new MapController(opts);
      await controller.init();

      const polygon1 = {
        type: "Feature" as const,
        id: "poly1",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {},
      };

      const polygon2 = {
        type: "Feature" as const,
        id: "poly2",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        },
        properties: {},
      };

      // Mock getGeoJSON to return polygons
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [polygon1, polygon2],
      });

      // Mock the geojson utilities directly on the imported module
      const geojsonModule = await import("@src/utils/geojson");
      const mergePolygonsSpy = vi
        .spyOn(geojsonModule, "mergePolygons")
        .mockReturnValue(null);
      const isPolygonSpy = vi
        .spyOn(geojsonModule, "isPolygon")
        .mockReturnValue(true);
      const isMultiPolygonSpy = vi
        .spyOn(geojsonModule, "isMultiPolygon")
        .mockReturnValue(false);

      const result = await controller.mergeVisiblePolygons();
      expect(result).toBeNull();

      // Verify the mocked functions were called
      expect(isPolygonSpy).toHaveBeenCalled();
      expect(mergePolygonsSpy).toHaveBeenCalled();

      // Restore the spies
      mergePolygonsSpy.mockRestore();
      isPolygonSpy.mockRestore();
      isMultiPolygonSpy.mockRestore();

      controller.destroy();
    });
  });

  describe("setRulerUnits", () => {
    it("updates measurement system", async () => {
      const controller = new MapController(opts);
      await controller.init();

      // Mock the internal methods that setRulerUnits calls
      const syncSpy = vi
        .spyOn(controller as any, "syncMeasurementModalState")
        .mockImplementation(() => {});
      const rebuildSpy = vi
        .spyOn(controller as any, "rebuildRulerControl")
        .mockImplementation(() => {});

      controller.setRulerUnits("imperial");

      expect((controller as any).measurementSystem).toBe("imperial");
      expect(syncSpy).toHaveBeenCalled();
      expect(rebuildSpy).toHaveBeenCalled();
      controller.destroy();
    });

    it("does nothing when system is already set", async () => {
      const controller = new MapController(opts);
      await controller.init();

      // Set initial system
      (controller as any).measurementSystem = "imperial";

      const syncSpy = vi
        .spyOn(controller as any, "syncMeasurementModalState")
        .mockImplementation(() => {});
      const rebuildSpy = vi
        .spyOn(controller as any, "rebuildRulerControl")
        .mockImplementation(() => {});

      // Try to set the same system
      controller.setRulerUnits("imperial");

      expect(syncSpy).not.toHaveBeenCalled();
      expect(rebuildSpy).not.toHaveBeenCalled();
      controller.destroy();
    });
  });
});
