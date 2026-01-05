import { describe, it, expect, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import * as geojsonUtils from "@src/utils/geojson";

// The key functionality we want to test is the integration of mergePolygons with the MapController
describe("Polygon Merging Functionality", () => {
  // Test the utility function directly
  it("mergePolygonsFromCollection should combine polygons", () => {
    const spy = vi.spyOn(geojsonUtils, "mergePolygonsFromCollection");

    // Mock input and output for our test
    const mockInput: FeatureCollection = {
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

    // Test the function directly
    const result = geojsonUtils.mergePolygonsFromCollection(mockInput);

    // Verify it was called with our input
    expect(spy).toHaveBeenCalledWith(mockInput);

    // Check that we got a valid result
    expect(result).not.toBeNull();
    expect(result?.type).toBe("Feature");

    // The result should be a MultiPolygon since we merged two polygons
    expect(result?.geometry.type).toBe("MultiPolygon");

    // Clean up
    spy.mockRestore();
  });

  // Test with custom properties
  it("mergePolygonsFromCollection should support custom properties", () => {
    const customProps = { source: "test", merged: true, count: 2 };

    const mockInput: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Original 1" },
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
          properties: { name: "Original 2" },
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

    // Test with custom properties
    const result = geojsonUtils.mergePolygonsFromCollection(
      mockInput,
      customProps,
    );

    // Check properties were applied
    expect(result?.properties).toEqual(customProps);
  });

  // Test filtering of non-polygon features
  it("mergePolygonsFromCollection should filter out non-polygon features", () => {
    const mockInput: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Polygon" },
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

    // Test function with mixed feature types
    const result = geojsonUtils.mergePolygonsFromCollection(mockInput);

    // Only the polygon should be processed (so result is a Polygon not a MultiPolygon)
    expect(result?.geometry.type).toBe("Polygon");
  });
});
