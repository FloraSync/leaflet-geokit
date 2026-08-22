import { describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("LeafletDrawMapElement — event hooks", () => {
  it("tracks status snapshots across a successful loadGeoJSON call", async () => {
    const el: any = document.createElement(TAG);
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "bed-1" },
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ],
    };

    el._controller = {
      loadGeoJSON: vi.fn().mockResolvedValue(undefined),
      getGeoJSON: vi.fn().mockResolvedValue(fc),
    };

    const statuses: Array<any> = [];
    el.addEventListener("leaflet-geokit:status", (e: CustomEvent) => {
      statuses.push(e.detail);
    });

    await el.loadGeoJSON(fc);

    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({
      state: "loading",
      ready: false,
      busy: true,
      featureCount: 0,
      lastEvent: "leaflet-draw:ingest",
    });
    expect(statuses[1]).toMatchObject({
      state: "ready",
      ready: true,
      busy: false,
      featureCount: 1,
      lastEvent: "leaflet-draw:ingest",
    });
    expect(el.status).toMatchObject({
      state: "ready",
      ready: true,
      busy: false,
      featureCount: 1,
      lastEvent: "leaflet-draw:ingest",
    });
  });

  it("exportGeoJSON dispatches export event with featureCount and adapter", async () => {
    const el: any = document.createElement(TAG);
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ],
    };
    el._controller = { exportGeoJSON: vi.fn().mockResolvedValue(fc) };

    const spy = vi.fn();
    el.addEventListener("leaflet-draw:export", spy);
    const out = await el.exportGeoJSON({ adapter: "source" });
    expect(out).toEqual(fc);
    expect(spy).toHaveBeenCalledOnce();
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.featureCount).toBe(1);
    expect(detail.adapter).toBe("source");
  });

  it("ingest handler can mutate data before load/add", async () => {
    const el: any = document.createElement(TAG);
    const passed: any[] = [];
    el._controller = {
      loadGeoJSON: vi.fn(async (x: any) => {
        passed.push({ kind: "load", x });
      }),
      addFeatures: vi.fn(async (x: any) => {
        passed.push({ kind: "add", x });
        return [];
      }),
      getGeoJSON: vi.fn().mockResolvedValue({
        type: "FeatureCollection",
        features: [],
      }),
    };

    // Listener transforms fc to a single known feature
    el.addEventListener("leaflet-draw:ingest", (ev: any) => {
      ev.detail.fc = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { t: 1 },
            geometry: { type: "Point", coordinates: [9, 9] },
          },
        ],
      };
    });

    const input = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [1, 1] },
        },
      ],
    };
    await el.loadGeoJSON(input);
    await el.addFeatures(input);

    expect(passed.length).toBe(2);
    expect(passed[0].kind).toBe("load");
    expect(passed[0].x.features.length).toBe(1);
    expect(passed[1].kind).toBe("add");
    expect(passed[1].x.features.length).toBe(1);
  });

  it("keeps ready status while surfacing recoverable parse diagnostics", async () => {
    const el: any = document.createElement(TAG);
    el._controller = { loadGeoJSON: vi.fn() };
    el._status = {
      state: "ready",
      ready: true,
      busy: false,
      featureCount: 3,
      timestamp: Date.now(),
    };

    const errors = vi.fn();
    const diagnostics = vi.fn();
    el.addEventListener("leaflet-draw:error", errors);
    el.addEventListener("leaflet-geokit:diagnostic", diagnostics);

    await expect(el.loadGeoJSONFromText("{not-json")).rejects.toThrow(
      "Failed to parse GeoJSON text",
    );

    expect(errors).toHaveBeenCalledOnce();
    expect((errors.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      code: "data_parse_failed",
      message: "Failed to parse GeoJSON text",
      recoverable: true,
    });

    expect(diagnostics).toHaveBeenCalledOnce();
    expect((diagnostics.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      code: "data_parse_failed",
      recoverable: true,
      severity: "warn",
      state: "ready",
    });

    expect(el.status).toMatchObject({
      state: "ready",
      ready: true,
      busy: false,
      featureCount: 3,
      lastError: {
        code: "data_parse_failed",
        recoverable: true,
      },
    });
  });
});
