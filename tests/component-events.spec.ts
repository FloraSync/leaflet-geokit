import { describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("LeafletDrawMapElement — event hooks", () => {
  it("exportGeoJSON dispatches export event with featureCount", async () => {
    const el: any = document.createElement(TAG);
    // Stub controller
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
    el._controller = { getGeoJSON: vi.fn().mockResolvedValue(fc) };

    const spy = vi.fn();
    el.addEventListener("leaflet-draw:export", spy);
    const out = await el.exportGeoJSON();
    expect(out).toEqual(fc);
    expect(spy).toHaveBeenCalledOnce();
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.featureCount).toBe(1);
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
});
