import { afterEach, describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

const originalFetch = globalThis.fetch;

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

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

  it("loadGeoJSONFromUrl is a no-op when controller is missing", async () => {
    const el: any = document.createElement(TAG);
    const fetchSpy = vi.spyOn(globalThis as any, "fetch");

    await expect(el.loadGeoJSONFromUrl("/noop.json")).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loadGeoJSONFromUrl emits ingest and falls back when ingest payload is mutated", async () => {
    const el: any = document.createElement(TAG);
    const loadSpy = vi.fn();
    el._controller = { loadGeoJSON: loadSpy };

    const sourceFc = { type: "FeatureCollection", features: [] };
    const replacement = { type: "NotFeatureCollection", features: [1] } as any;

    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => sourceFc,
    })) as any;

    el.addEventListener("leaflet-draw:ingest", (e: any) => {
      e.detail.fc = replacement;
    });

    await el.loadGeoJSONFromUrl("/mutate.json");
    expect(loadSpy).toHaveBeenCalledWith(sourceFc, true);
  });

  it("loadGeoJSONFromText is a no-op when controller is missing", async () => {
    const el: any = document.createElement(TAG);
    await expect(
      el.loadGeoJSONFromText(
        JSON.stringify({ type: "FeatureCollection", features: [] }),
      ),
    ).resolves.toBeUndefined();
  });

  it("loadGeoJSONFromText emits ingest and falls back when ingest payload is mutated", async () => {
    const el: any = document.createElement(TAG);
    const loadSpy = vi.fn();
    el._controller = { loadGeoJSON: loadSpy };

    const sourceFc = { type: "FeatureCollection", features: [] };
    const replacement = { type: "NotFeatureCollection", features: [1] } as any;

    el.addEventListener("leaflet-draw:ingest", (e: any) => {
      e.detail.fc = replacement;
    });

    await el.loadGeoJSONFromText(JSON.stringify(sourceFc));
    expect(loadSpy).toHaveBeenCalledWith(sourceFc, true);
  });
});
