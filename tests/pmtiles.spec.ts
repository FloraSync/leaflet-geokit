import { beforeEach, describe, expect, it, vi } from "vitest";
import * as L from "leaflet";
const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  mounted: vi.fn(),
  unmounted: vi.fn(),
}));
vi.mock("maplibre-gl", () => ({
  addProtocol: mocks.add,
  removeProtocol: mocks.remove,
}));
vi.mock("@maplibre/maplibre-gl-leaflet", async () => {
  const leaflet = await import("leaflet");
  return {
    maplibreGL: vi.fn(() => {
      const layer = new leaflet.Layer();
      layer.onAdd = function () {
        mocks.mounted();
        return this;
      };
      layer.onRemove = function () {
        mocks.unmounted();
        return this;
      };
      return Object.assign(layer, {
        getMaplibreMap: () => ({ fixture: true }),
      });
    }),
  };
});
import {
  createPMTilesBasemapAdapter,
  registerPMTilesProtocol,
} from "../src/pmtiles";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
const options = {
  style: { version: 8 as const, sources: {}, layers: [] },
  attribution: "Licensed fixture",
};

describe("optional PMTiles adapter contract (renderer covered in Playwright)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires attribution and the shared Leaflet instance", () => {
    expect(() =>
      createPMTilesBasemapAdapter({ ...options, attribution: " " }),
    ).toThrow("attribution");
    const adapter = createPMTilesBasemapAdapter(options);
    if (adapter.provider.kind !== "vector") throw new Error("Expected vector");
    expect(
      () =>
        adapter.provider.kind === "vector" &&
        adapter.provider.createLayer({
          Layer: class {},
        } as unknown as typeof L),
    ).toThrow("shared Leaflet");
    expect(adapter.provider.capabilities.offline).toBe("unknown");
  });
  it("creates fresh noninteractive layers without registering globals implicitly", () => {
    const adapter = createPMTilesBasemapAdapter(options);
    if (adapter.provider.kind !== "vector") throw new Error("Expected vector");
    expect(adapter.provider.createLayer(L)).not.toBe(
      adapter.provider.createLayer(L),
    );
    expect(maplibreGL).toHaveBeenCalledWith({
      style: options.style,
      interactive: false,
      attributionControl: false,
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("shares registration leases and refuses final release while mounted", () => {
    const release1 = registerPMTilesProtocol();
    const release2 = registerPMTilesProtocol();
    expect(mocks.add).toHaveBeenCalledTimes(1);
    const adapter = createPMTilesBasemapAdapter(options);
    if (adapter.provider.kind !== "vector") throw new Error("Expected vector");
    const layer = adapter.provider.createLayer(L);
    const map = {} as L.Map;
    layer.onAdd(map);
    release1();
    release1();
    expect(() => release2()).toThrow("Remove PMTiles basemaps");
    layer.onRemove(map);
    layer.onRemove(map);
    expect(mocks.unmounted).toHaveBeenCalledTimes(1);
    release2();
    release2();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("pmtiles");
  });
  it("releases the renderer when a host mount callback throws", () => {
    const release = registerPMTilesProtocol();
    const adapter = createPMTilesBasemapAdapter({
      ...options,
      onMap: () => {
        throw new Error("host failed");
      },
    });
    if (adapter.provider.kind !== "vector") throw new Error("Expected vector");
    const layer = adapter.provider.createLayer(L);
    expect(() => layer.onAdd({} as L.Map)).toThrow("host failed");
    expect(mocks.unmounted).toHaveBeenCalledTimes(1);
    expect(() => release()).not.toThrow();
  });
});
