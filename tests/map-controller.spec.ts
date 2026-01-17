import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
