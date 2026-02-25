import { describe, expect, it, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("LeafletDrawMapElement — branch coverage", () => {
  it("handles additional observed attributes and numeric reflection", () => {
    const el: any = document.createElement(TAG);

    el.setAttribute("min-zoom", "3");
    el.setAttribute("max-zoom", "19");
    el.setAttribute("tile-url", "https://tiles.example/{z}/{x}/{y}.png");
    el.setAttribute("tile-attribution", "Example Tiles");
    el.setAttribute("tile-style", "  lite.day  ");
    el.setAttribute("log-level", "info");
    el.setAttribute("polygon-allow-intersection", "");
    el.setAttribute("prefer-canvas", "");

    expect(el.minZoom).toBe(3);
    expect(el.maxZoom).toBe(19);
    expect(el.tileUrl).toBe("https://tiles.example/{z}/{x}/{y}.png");
    expect(el.tileAttribution).toBe("Example Tiles");
    expect(el.tileStyle).toBe("lite.day");
    expect(el.logLevel).toBe("info");
    expect(el._polygonAllowIntersection).toBe(true);
    expect(el.preferCanvas).toBe(true);

    el.minZoom = 4;
    el.maxZoom = 20;
    expect(el.getAttribute("min-zoom")).toBe("4");
    expect(el.getAttribute("max-zoom")).toBe("20");
  });

  it("keeps theme CSS untouched while disconnected", () => {
    const el: any = document.createElement(TAG);
    expect(el.isConnected).toBe(false);

    el.themeCss = ".leaflet-container { color: green; }";
    expect(
      el.shadowRoot?.querySelector("style[data-geokit-theme-css]"),
    ).toBeNull();
  });

  it("supports no-controller API paths and setView without zoom", async () => {
    const el: any = document.createElement(TAG);

    const empty = { type: "FeatureCollection", features: [] };
    await expect(el.loadGeoJSON(empty)).resolves.toBeUndefined();
    await expect(el.addFeatures(empty)).resolves.toEqual([]);
    await expect(
      el.updateFeature("id", {
        type: "Feature",
        properties: {},
        geometry: null,
      }),
    ).resolves.toBeUndefined();
    await expect(el.removeFeature("id")).resolves.toBeUndefined();
    await expect(el.clearLayers()).resolves.toBeUndefined();
    await expect(el.fitBoundsToData()).resolves.toBeUndefined();
    await expect(
      el.fitBounds([
        [0, 0],
        [1, 1],
      ]),
    ).resolves.toBeUndefined();
    await expect(el.exportGeoJSON()).resolves.toEqual(empty);
    await expect(el.setMeasurementUnits("metric")).resolves.toBeUndefined();

    await expect(el.setView(10, 20)).resolves.toBeUndefined();
    expect(el.latitude).toBe(10);
    expect(el.longitude).toBe(20);
    expect(el.zoom).toBe(2);
  });

  it("covers ingest fallback branches for load/add and missing text length", async () => {
    const el: any = document.createElement(TAG);
    const loadGeoJSON = vi.fn();
    const addFeatures = vi.fn().mockResolvedValue(["id-1"]);
    el._controller = { loadGeoJSON, addFeatures };

    el.addEventListener("leaflet-draw:ingest", (event: any) => {
      event.detail.fc = { type: "NotFeatureCollection", features: [1] };
    });

    await el.loadGeoJSON(undefined);
    await el.addFeatures(undefined);
    expect(loadGeoJSON).toHaveBeenCalledWith(undefined, false);
    expect(addFeatures).toHaveBeenCalledWith(undefined);

    el._controller = null;
    await expect(el.loadGeoJSONFromText(undefined)).resolves.toBeUndefined();
  });

  it("covers updateTileLayer guard and catch branches", () => {
    const noControllerEl: any = document.createElement(TAG);
    expect(() => noControllerEl._updateTileLayer()).not.toThrow();

    const noMethodEl: any = document.createElement(TAG);
    noMethodEl._controller = {};
    expect(() => noMethodEl._updateTileLayer()).not.toThrow();

    const throwingEl: any = document.createElement(TAG);
    const setTileLayer = vi
      .fn()
      .mockImplementationOnce(() => {
        throw "boom";
      })
      .mockImplementation(() => undefined);
    throwingEl._controller = { setTileLayer };
    const errorSpy = vi.fn();
    throwingEl.addEventListener("tile-provider-error", errorSpy);

    throwingEl._updateTileLayer();

    expect(errorSpy).toHaveBeenCalledOnce();
    const detail = (errorSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.code).toBe("tile_load_failed");
    expect(detail.message).toBe("Unknown tile layer error");
    expect(detail.provider).toBe("unknown");
  });

  it("covers invalid provider validation and stale tile error callbacks", () => {
    const invalidProviderEl: any = document.createElement(TAG);
    invalidProviderEl._controller = { setTileLayer: vi.fn() };
    invalidProviderEl._tileProvider = "   ";
    invalidProviderEl._apiKey = "abc";
    const invalidSpy = vi.fn();
    invalidProviderEl.addEventListener("tile-provider-error", invalidSpy);

    invalidProviderEl._updateTileLayer();

    expect(invalidSpy).toHaveBeenCalledOnce();
    expect((invalidSpy.mock.calls[0][0] as CustomEvent).detail.code).toBe(
      "tile_load_failed",
    );

    const staleEl: any = document.createElement(TAG);
    let onTileError: ((error: unknown) => void) | undefined;
    staleEl._controller = {
      setTileLayer: vi.fn((_config: unknown, callbacks?: any) => {
        onTileError = callbacks?.onTileError;
      }),
    };
    staleEl._tileProvider = "here";
    staleEl._apiKey = "abc";

    const staleSpy = vi.fn();
    staleEl.addEventListener("tile-provider-error", staleSpy);

    staleEl._updateTileLayer();
    staleEl._tileProvider = "osm";
    onTileError?.(new Error("403 Forbidden"));

    expect(staleSpy).not.toHaveBeenCalled();
  });

  it("covers explicit tile-provider error handling without setTileLayer support", () => {
    const el: any = document.createElement(TAG);
    el._controller = {};
    const errorSpy = vi.fn();
    el.addEventListener("tile-provider-error", errorSpy);

    el._handleTileProviderError("tile_load_failed", "bad tiles", "osm");

    expect(errorSpy).toHaveBeenCalledOnce();
    const detail = (errorSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.code).toBe("tile_load_failed");
    expect(detail.provider).toBe("osm");
  });

  it("covers provider helpers and error classification branches", () => {
    const el: any = document.createElement(TAG);

    expect(el._normalizeText(null)).toBeUndefined();
    expect(el._normalizeText("   ")).toBeUndefined();
    expect(el._normalizeText("  HERE  ", { lowercase: true })).toBe("here");

    expect(el._resolveTileProviderErrorCode("boom")).toBe("tile_load_failed");
    expect(el._resolveTileProviderErrorCode(new Error("generic"))).toBe(
      "tile_load_failed",
    );

    expect(el._resolveHereTileLayerErrorCode("403")).toBe("permission_denied");
    expect(el._resolveHereTileLayerErrorCode("unauthorized")).toBe(
      "permission_denied",
    );
    expect(el._resolveHereTileLayerErrorCode("not authorized")).toBe(
      "permission_denied",
    );
    expect(el._resolveHereTileLayerErrorCode("not authorised")).toBe(
      "permission_denied",
    );
    expect(el._resolveHereTileLayerErrorCode("access denied")).toBe(
      "permission_denied",
    );
    expect(el._resolveHereTileLayerErrorCode("quota exceeded")).toBe(
      "invalid_api_key",
    );
  });

  it("covers tile-layer error descriptions and reflection/coercion no-op branches", () => {
    const el: any = document.createElement(TAG);
    el._tileStyle = "satellite.day";

    expect(
      el._describeTileLayerError({ error: new Error("nested-error") }, "here"),
    ).toBe("nested-error");
    expect(el._describeTileLayerError(new Error("plain-error"), "here")).toBe(
      "plain-error",
    );
    expect(
      el._describeTileLayerError({ message: "  from-object  " }, "here"),
    ).toBe("from-object");
    expect(el._describeTileLayerError({ message: "   " }, "here")).toContain(
      "satellite.day",
    );
    expect(el._describeTileLayerError(null, "osm")).toBe(
      "Failed to load tile layer",
    );

    el.setAttribute("stable-value", "same");
    const setAttributeSpy = vi.spyOn(el, "setAttribute");
    el._reflect("stable-value", "same");
    expect(setAttributeSpy).not.toHaveBeenCalled();
    setAttributeSpy.mockRestore();

    expect(el._coerceNumber(null, 7)).toBe(7);
    expect(el._coerceNumber("not-a-number", 7)).toBe(7);
  });

  it("removes legacy here-api-key and updates tiles when controller exists", () => {
    const el: any = document.createElement(TAG);
    el._controller = { setTileLayer: vi.fn() };
    const updateSpy = vi.spyOn(el, "_updateTileLayer");

    el.setAttribute("here-api-key", "legacy");
    el.apiKey = "canonical-key";
    el.tileProvider = "here";
    el.tileStyle = "lite.day";
    el.tileUrl = "https://tiles.example/{z}/{x}/{y}.png";
    el.tileAttribution = "Example Attribution";

    expect(el.hasAttribute("here-api-key")).toBe(false);
    expect(updateSpy).toHaveBeenCalled();
  });
});
