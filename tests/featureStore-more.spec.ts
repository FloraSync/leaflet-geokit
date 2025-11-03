import { describe, it, expect } from "vitest";
import { FeatureStore } from "@src/lib/FeatureStore";

describe("FeatureStore — more cases", () => {
  it("bounds returns null when empty", () => {
    const store = new FeatureStore();
    expect(store.bounds()).toBeNull();
  });

  it("toFeatureCollection returns all added features", () => {
    const store = new FeatureStore();
    const ids = store.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { a: 1 },
          geometry: { type: "Point", coordinates: [0, 0] },
        },
        {
          type: "Feature",
          properties: { b: 2 },
          geometry: { type: "Point", coordinates: [1, 1] },
        },
      ],
    });
    const fc = store.toFeatureCollection();
    expect(fc.features.length).toBe(2);
    const props = fc.features
      .map((f) => f.properties as any)
      .sort((x, y) => (x.a ?? x.b) - (y.a ?? y.b));
    expect(props[0].a).toBe(1);
    expect(props[1].b).toBe(2);
    // ids are reflected on exported features
    const idSet = new Set(ids);
    for (const f of fc.features) expect(idSet.has(String(f.id))).toBe(true);
  });
});
