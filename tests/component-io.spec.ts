import { describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-draw-map";

describe("LeafletDrawMapElement — IO helpers", () => {
  it("loadGeoJSONFromText dispatches error on invalid JSON", async () => {
    const el: any = document.createElement(TAG);
    el._controller = { loadGeoJSON: vi.fn() };
    const errSpy = vi.fn();
    el.addEventListener("leaflet-draw:error", errSpy);
    await expect(el.loadGeoJSONFromText("not-json")).rejects.toBeInstanceOf(
      Error,
    );
    expect(errSpy).toHaveBeenCalledOnce();
  });

  it("loadGeoJSONFromUrl calls controller on success", async () => {
    const el: any = document.createElement(TAG);
    const loadSpy = vi.fn();
    el._controller = { loadGeoJSON: loadSpy };

    const mockFc = { type: "FeatureCollection", features: [] };
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => mockFc,
    })) as any;
    await el.loadGeoJSONFromUrl("/foo.json");
    expect(loadSpy).toHaveBeenCalledWith(mockFc, true);
  });

  it("loadGeoJSONFromUrl dispatches error on non-ok", async () => {
    const el: any = document.createElement(TAG);
    el._controller = { loadGeoJSON: vi.fn() };
    const errSpy = vi.fn();
    el.addEventListener("leaflet-draw:error", errSpy);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "ERR",
    })) as any;
    await expect(el.loadGeoJSONFromUrl("/bad.json")).rejects.toBeInstanceOf(
      Error,
    );
    expect(errSpy).toHaveBeenCalledOnce();
  });
});
