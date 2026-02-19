import { afterEach, describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

function mockFetch(impl: () => Promise<unknown>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    mockFetch(async () => ({
      ok: true,
      json: async () => mockFc,
    }));
    await el.loadGeoJSONFromUrl("/foo.json");
    expect(loadSpy).toHaveBeenCalledWith(mockFc, true);
  });

  it("loadGeoJSONFromUrl dispatches error on non-ok", async () => {
    const el: any = document.createElement(TAG);
    el._controller = { loadGeoJSON: vi.fn() };
    const errSpy = vi.fn();
    el.addEventListener("leaflet-draw:error", errSpy);
    mockFetch(async () => ({
      ok: false,
      status: 500,
      statusText: "ERR",
    }));
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

    mockFetch(async () => ({
      ok: true,
      json: async () => sourceFc,
    }));

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
