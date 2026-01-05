import { describe, it, expect } from "vitest";
import {
  isPolygon,
  isMultiPolygon,
  extractPolygonCoordinates,
  mergePolygons,
  mergePolygonsFromCollection,
} from "@src/utils/geojson";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from "geojson";

describe("Polygon Type Guards", () => {
  it("isPolygon should correctly identify Polygon geometries", () => {
    const polygon = {
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
    } as Polygon;
    const multiPolygon = {
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
      ],
    } as MultiPolygon;

    expect(isPolygon(polygon)).toBe(true);
    expect(isPolygon(multiPolygon)).toBe(false);
    expect(isPolygon(null)).toBe(false);
    expect(isPolygon({ type: "Point", coordinates: [0, 0] } as any)).toBe(
      false,
    );
  });

  it("isMultiPolygon should correctly identify MultiPolygon geometries", () => {
    const polygon = {
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
    } as Polygon;
    const multiPolygon = {
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
      ],
    } as MultiPolygon;

    expect(isMultiPolygon(polygon)).toBe(false);
    expect(isMultiPolygon(multiPolygon)).toBe(true);
    expect(isMultiPolygon(null)).toBe(false);
    expect(isMultiPolygon({ type: "Point", coordinates: [0, 0] } as any)).toBe(
      false,
    );
  });
});

describe("extractPolygonCoordinates", () => {
  it("should extract coordinates from a Polygon feature", () => {
    const polygonCoords = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ];
    const feature: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: polygonCoords,
      },
    };

    const result = extractPolygonCoordinates(feature);
    expect(result).toEqual([polygonCoords]);
  });

  it("should extract coordinates from a MultiPolygon feature", () => {
    const multiPolygonCoords = [
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
    ];
    const feature: Feature<MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: multiPolygonCoords,
      },
    };

    const result = extractPolygonCoordinates(feature);
    expect(result).toEqual(multiPolygonCoords);
  });

  it("should return empty array for non-polygon features", () => {
    const pointFeature: Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: [0, 0],
      },
    };

    const result = extractPolygonCoordinates(pointFeature);
    expect(result).toEqual([]);
  });
});

describe("mergePolygons", () => {
  const poly1: Feature<Polygon> = {
    type: "Feature",
    properties: { name: "Polygon 1" },
    geometry: {
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
  };

  const poly2: Feature<Polygon> = {
    type: "Feature",
    properties: { name: "Polygon 2" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 3],
          [2, 2],
        ],
      ],
    },
  };

  it("should merge multiple polygons into a MultiPolygon feature", () => {
    const result = mergePolygons([poly1, poly2]);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("Feature");
    expect(result!.geometry.type).toBe("MultiPolygon");
    expect((result!.geometry as MultiPolygon).coordinates).toHaveLength(2);
  });

  it("should use properties from first feature by default", () => {
    const result = mergePolygons([poly1, poly2]);

    expect(result!.properties).toEqual({ name: "Polygon 1" });
  });

  it("should allow custom properties in result", () => {
    const customProps = { name: "Merged Polygons", id: "custom-id" };
    const result = mergePolygons([poly1, poly2], customProps);

    expect(result!.properties).toEqual(customProps);
  });

  it("should return null for empty features array", () => {
    const result = mergePolygons([]);
    expect(result).toBeNull();
  });

  it("should return a single polygon feature if only one polygon provided", () => {
    const result = mergePolygons([poly1]);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("Feature");
    expect(result!.geometry.type).toBe("Polygon");
  });
});

describe("mergePolygonsFromCollection", () => {
  it("should merge polygons from a FeatureCollection", () => {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Polygon 1" },
          geometry: {
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
        },
        {
          type: "Feature",
          properties: { name: "Polygon 2" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [2, 2],
                [3, 2],
                [3, 3],
                [2, 3],
                [2, 2],
              ],
            ],
          },
        },
      ],
    };

    const result = mergePolygonsFromCollection(fc);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("Feature");
    expect(result!.geometry.type).toBe("MultiPolygon");
    expect((result!.geometry as MultiPolygon).coordinates).toHaveLength(2);
  });

  it("should filter out non-polygon features", () => {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Polygon 1" },
          geometry: {
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
        },
        {
          type: "Feature",
          properties: { name: "Point" },
          geometry: {
            type: "Point",
            coordinates: [0, 0],
          },
        },
      ],
    };

    const result = mergePolygonsFromCollection(fc);

    expect(result).not.toBeNull();
    expect(result!.geometry.type).toBe("Polygon");
  });

  it("should return null for empty collections", () => {
    expect(
      mergePolygonsFromCollection({ type: "FeatureCollection", features: [] }),
    ).toBeNull();
    expect(mergePolygonsFromCollection(null as any)).toBeNull();
  });
});
