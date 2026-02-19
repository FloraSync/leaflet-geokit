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

  it("mergePolygons returns null when controller is missing", async () => {
    const el: any = document.createElement(TAG);
    await expect(el.mergePolygons()).resolves.toBeNull();
  });

  it("mergePolygons delegates and dispatches merged event when merge succeeds", async () => {
    const el: any = document.createElement(TAG);

    const preState = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: null },
        { type: "Feature", properties: {}, geometry: null },
      ],
    };
    const postState = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: null }],
    };

    const getGeoJSON = vi
      .fn()
      .mockResolvedValueOnce(preState)
      .mockResolvedValueOnce(postState);
    const mergeVisiblePolygons = vi.fn().mockResolvedValue("merged-id");

    el._controller = {
      getGeoJSON,
      mergeVisiblePolygons,
    };

    let mergedEvent: CustomEvent | null = null;
    el.addEventListener("leaflet-draw:merged", (e: Event) => {
      mergedEvent = e as CustomEvent;
    });

    const options = { properties: { source: "unit-test" } };
    const result = await el.mergePolygons(options);

    expect(result).toBe("merged-id");
    expect(mergeVisiblePolygons).toHaveBeenCalledWith(options);
    expect(mergedEvent).not.toBeNull();
    expect(mergedEvent!.detail.id).toBe("merged-id");
    expect(mergedEvent!.detail.mergedFeatureCount).toBe(2);
    expect(mergedEvent!.detail.geoJSON).toEqual(postState);
  });

  it("mergePolygons does not dispatch merged event when merge returns null", async () => {
    const el: any = document.createElement(TAG);
    const getGeoJSON = vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    const mergeVisiblePolygons = vi.fn().mockResolvedValue(null);

    el._controller = {
      getGeoJSON,
      mergeVisiblePolygons,
    };

    const mergedSpy = vi.fn();
    el.addEventListener("leaflet-draw:merged", mergedSpy);

    const result = await el.mergePolygons();

    expect(result).toBeNull();
    expect(mergedSpy).not.toHaveBeenCalled();
  });

  it("setMeasurementUnits delegates to controller when present", async () => {
    const el: any = document.createElement(TAG);
    const setRulerUnits = vi.fn();
    el._controller = { setRulerUnits };

    await el.setMeasurementUnits("imperial");
    expect(setRulerUnits).toHaveBeenCalledWith("imperial");
  });

  it("setMeasurementUnits is a no-op when controller is missing", async () => {
    const el: any = document.createElement(TAG);
    await expect(el.setMeasurementUnits("metric")).resolves.toBeUndefined();
  });
});
