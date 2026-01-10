import { describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("LeafletDrawMapElement — API delegation", () => {
  it("clearLayers delegates to controller", async () => {
    const el: any = document.createElement(TAG);
    const spy = vi.fn();
    el._controller = { clearLayers: spy };
    await el.clearLayers();
    expect(spy).toHaveBeenCalled();
  });

  it("fitBoundsToData delegates with default padding when undefined", async () => {
    const el: any = document.createElement(TAG);
    const spy = vi.fn();
    el._controller = { fitBoundsToData: spy };
    await el.fitBoundsToData();
    const last = spy.mock.calls.at(-1)!;
    expect(last[0]).toBe(0.05);
  });

  it("getGeoJSON returns empty FeatureCollection when controller missing", async () => {
    const el: any = document.createElement(TAG);
    const fc = await el.getGeoJSON();
    expect(fc).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("ingest event emits correct mode for load/add", async () => {
    const el: any = document.createElement(TAG);
    el._controller = {
      loadGeoJSON: vi.fn(async () => {}),
      addFeatures: vi.fn(async () => []),
    };
    const modes: string[] = [];
    el.addEventListener("leaflet-draw:ingest", (e: any) => {
      modes.push(e.detail?.mode);
    });
    const input = { type: "FeatureCollection", features: [] };
    await el.loadGeoJSON(input);
    await el.addFeatures(input);
    expect(modes).toEqual(["load", "add"]);
  });
});
