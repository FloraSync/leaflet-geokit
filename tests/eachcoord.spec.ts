import { describe, it, expect } from "vitest";
import { eachCoord } from "@src/utils/geojson";

describe("utils/geojson.eachCoord", () => {
  it("walks through coordinates for various geometries", () => {
    const counts: Record<string, number> = {};
    const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

    eachCoord({ type: "Point", coordinates: [1, 2] }, () => count("pt"));
    eachCoord(
      {
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      () => count("mp"),
    );
    eachCoord(
      {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      },
      () => count("ls"),
    );
    eachCoord(
      {
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [2, 2],
            [3, 3],
          ],
        ],
      },
      () => count("mls"),
    );
    eachCoord(
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      () => count("poly"),
    );
    eachCoord(
      {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        ],
      },
      () => count("mpoly"),
    );
    eachCoord(
      {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [9, 9] },
          {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        ],
      },
      () => count("gc"),
    );

    expect(counts.pt).toBe(1);
    expect(counts.mp).toBe(2);
    expect(counts.ls).toBe(3);
    expect(counts.mls).toBe(4);
    expect(counts.poly).toBe(5);
    expect(counts.mpoly).toBe(10);
    expect(counts.gc).toBe(3);
  });
});
