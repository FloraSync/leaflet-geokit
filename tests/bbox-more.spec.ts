import { describe, it, expect } from "vitest";
import { bboxOfFeature, bboxOfFeatureCollection } from "@src/utils/geojson";

describe("utils/geojson bbox — additional cases", () => {
  it("bboxOfFeature handles GeometryCollection", () => {
    const f: any = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [5, 5] },
          {
            type: "LineString",
            coordinates: [
              [-1, -2],
              [3, 4],
            ],
          },
          {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        ],
      },
    };
    expect(bboxOfFeature(f)).toEqual([-1, -2, 10, 10]);
  });

  it("bboxOfFeatureCollection returns null for empty", () => {
    const fc: any = { type: "FeatureCollection", features: [] };
    expect(bboxOfFeatureCollection(fc)).toBeNull();
  });
});
