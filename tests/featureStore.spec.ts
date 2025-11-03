import { describe, it, expect } from "vitest";
import type { Feature, FeatureCollection } from "geojson";
import { FeatureStore } from "@src/lib/FeatureStore";

function fc(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("FeatureStore", () => {
  it("adds features and assigns ids when missing", () => {
    const store = new FeatureStore();
    const ids = store.add(
      fc([
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
        {
          type: "Feature",
          properties: { id: "p2" } as any,
          geometry: { type: "Point", coordinates: [1, 1] },
        },
      ]),
    );
    expect(ids.length).toBe(2);
    expect(store.size()).toBe(2);

    const all = store.toFeatureCollection().features;
    // Root id should be present and properties.id should mirror generated id
    const f0 = all[0];
    expect(typeof f0.id).toBe("string");
    expect((f0.properties as any).id).toBe(f0.id);

    const f1 = all[1];
    expect(f1.id).toBe("p2");
  });

  it("updates existing features and ignores missing ids on update/remove", () => {
    const store = new FeatureStore();
    const [id] = store.add(
      fc([
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ]),
    );
    const replacement: Feature = {
      type: "Feature",
      properties: { name: "x" },
      geometry: { type: "Point", coordinates: [2, 2] },
    };
    store.update(id, replacement);
    const out = store.get(id)!;
    expect(out.id).toBe(id);
    expect((out.properties as any).name).toBe("x");
    // Missing update/remove are no-ops
    store.update("missing", replacement);
    store.remove("missing");
    // Removing existing reduces size
    store.remove(id);
    expect(store.size()).toBe(0);
  });

  it("computes bounds over stored data", () => {
    const store = new FeatureStore();
    // Add a polygon roughly around (0..2, 0..2)
    store.add(
      fc([
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2],
                [0, 0],
              ],
            ],
          },
        },
      ]),
    );
    const b = store.bounds();
    expect(b).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });
});
