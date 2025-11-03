import { describe, it, expect } from "vitest";
import { bboxOfFeature, expandMultiGeometries } from "@src/utils/geojson";

describe("utils/geojson — more coverage", () => {
  it("bboxOfFeature returns null for null geometry", () => {
    const f: any = { type: "Feature", properties: {}, geometry: null };
    expect(bboxOfFeature(f)).toBeNull();
  });

  it("bboxOfFeature handles MultiPoint", () => {
    const f: any = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPoint",
        coordinates: [
          [-3, 2],
          [5, -1],
          [0, 0],
        ],
      },
    };
    expect(bboxOfFeature(f)).toEqual([-3, -1, 5, 2]);
  });

  it("expandMultiGeometries skips features without geometry", () => {
    const fc: any = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { keep: 1 },
          geometry: { type: "Point", coordinates: [0, 0] },
        },
        { type: "Feature", properties: { skip: true }, geometry: null },
      ],
    };
    const out = expandMultiGeometries(fc);
    expect(out.features.length).toBe(1);
    expect((out.features[0].properties as any).keep).toBe(1);
  });
});
