import { describe, it, expect } from "vitest";
import type { FeatureCollection } from "geojson";

import {
  normalizeId,
  bboxOfFeature,
  bboxOfFeatureCollection,
  bboxToBoundsPair,
  expandMultiGeometries,
} from "@src/utils/geojson";

describe("utils/geojson", () => {
  it("normalizeId returns id or properties.id", () => {
    const f1: any = {
      type: "Feature",
      id: "abc",
      properties: {},
      geometry: { type: "Point", coordinates: [0, 0] },
    };
    const f2: any = {
      type: "Feature",
      properties: { id: 123 },
      geometry: { type: "Point", coordinates: [1, 1] },
    };
    const f3: any = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [2, 2] },
    };
    expect(normalizeId(f1)).toBe("abc");
    expect(normalizeId(f2)).toBe("123"); // coerced to string
    expect(normalizeId(f3)).toBeUndefined();
  });

  it("bboxOfFeature computes [minLng,minLat,maxLng,maxLat]", () => {
    const f: any = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [-1, 1],
          [2, -3],
          [0, 5],
        ],
      },
    };
    expect(bboxOfFeature(f)).toEqual([-1, -3, 2, 5]);
  });

  it("bboxOfFeatureCollection aggregates multiple features", () => {
    const fc: any = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [10, 10] },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [5, 0],
                [5, 5],
                [0, 5],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(bboxOfFeatureCollection(fc)).toEqual([0, 0, 10, 10]);
  });

  it("bboxToBoundsPair maps to [[south,west],[north,east]]", () => {
    expect(bboxToBoundsPair([-10, -5, 20, 15])).toEqual([
      [-5, -10],
      [15, 20],
    ]);
  });

  it("expandMultiGeometries splits Multi* and GeometryCollection", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { a: 1 },
          geometry: {
            type: "MultiPoint",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        {
          type: "Feature",
          properties: { b: 2 },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [0, 0],
                [1, 0],
              ],
              [
                [1, 1],
                [2, 2],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: { c: 3 },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [0, 0],
                  [2, 0],
                  [2, 2],
                  [0, 2],
                  [0, 0],
                ],
              ],
              [
                [
                  [3, 3],
                  [4, 3],
                  [4, 4],
                  [3, 4],
                  [3, 3],
                ],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: { d: 4 },
          geometry: {
            type: "GeometryCollection",
            geometries: [
              { type: "Point", coordinates: [5, 5] },
              {
                type: "LineString",
                coordinates: [
                  [6, 6],
                  [7, 7],
                ],
              },
            ],
          },
        },
      ],
    };

    const out = expandMultiGeometries(input);
    // 2 points + 2 lines + 2 polygons + 2 from collection = 8
    expect(out.features.length).toBe(8);
    // Props preserved
    expect(
      out.features.filter((f) => f.properties && (f.properties as any).a === 1)
        .length,
    ).toBe(2);
    expect(
      out.features.filter((f) => f.properties && (f.properties as any).b === 2)
        .length,
    ).toBe(2);
    expect(
      out.features.filter((f) => f.properties && (f.properties as any).c === 3)
        .length,
    ).toBe(2);
    expect(
      out.features.filter((f) => f.properties && (f.properties as any).d === 4)
        .length,
    ).toBe(2);
  });
});
