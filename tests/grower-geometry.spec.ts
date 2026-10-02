import { describe, expect, it } from "vitest";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import {
  GROWER_PRESETS,
  boundingBoxGeoJSON,
  bufferGeoJSON,
  centroidGeoJSON,
  createBedWidthGuides,
  createIrrigationZones,
  createRowSpacingGuides,
  formatMeasurements,
  measureGeoJSON,
  mergeGeoJSON,
  simplifyGeoJSON,
  splitGeoJSON,
  type GrowerGeometryResult,
} from "../src/utils/grower-geometry";
import { computePreciseDistance } from "../src/utils/geodesic";

function valueOf<T>(result: GrowerGeometryResult<T>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function square(
  west: number,
  south: number,
  size: number,
  properties: Record<string, unknown> = {},
): Feature<Polygon> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [west + size, south],
          [west + size, south + size],
          [west, south + size],
          [west, south],
        ],
      ],
    },
  };
}

describe("safe GeoJSON geometry operations", () => {
  it("buffers without mutating nested input metadata", () => {
    const point: Feature<Point> = {
      type: "Feature",
      id: "well-1",
      properties: { id: "well-1", meta: { crop: "tomato", flags: [1, 2] } },
      geometry: { type: "Point", coordinates: [-122, 38] },
    };
    const before = structuredClone(point);

    const buffered = valueOf(bufferGeoJSON(point, 10, { steps: 64 }));

    expect(point).toEqual(before);
    expect(buffered.type).toBe("Feature");
    if (buffered.type !== "Feature") throw new Error("expected feature");
    expect(buffered.geometry.type).toMatch(/Polygon/);
    expect(buffered.properties).toEqual(point.properties);
    expect(buffered.properties).not.toBe(point.properties);
    const measured = valueOf(measureGeoJSON(buffered));
    expect(measured.areaSquareMeters).toBeCloseTo(Math.PI * 100, -0.3);
  });

  it("rejects self-intersecting, degenerate, and invalid buffer requests", () => {
    const bowTie: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      },
    };
    const degenerate = square(0, 0, 0);

    expect(bufferGeoJSON(bowTie, 1)).toMatchObject({
      ok: false,
      error: { code: "topology-error" },
    });
    expect(bufferGeoJSON(degenerate, 1)).toMatchObject({
      ok: false,
      error: { code: "topology-error" },
    });
    expect(bufferGeoJSON(square(0, 0, 1), 0)).toMatchObject({
      ok: false,
      error: { code: "invalid-options" },
    });
  });

  it("splits intersecting lines, preserves cloned metadata, and rewrites IDs", () => {
    const line: Feature<LineString> = {
      type: "Feature",
      id: "row-a",
      properties: { id: "row-a", nested: { crop: "beans" } },
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [2, 0],
        ],
      },
    };
    const splitter: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [1, -1],
          [1, 1],
        ],
      },
    };
    const before = structuredClone(line);

    const result = valueOf(splitGeoJSON(line, splitter));

    expect(result.features).toHaveLength(2);
    expect(result.features.map((feature) => feature.id)).toEqual([
      "row-a:split:1",
      "row-a:split:2",
    ]);
    expect(result.features.map((feature) => feature.properties?.id)).toEqual([
      "row-a:split:1",
      "row-a:split:2",
    ]);
    expect(result.features[0].properties?.nested).toEqual({ crop: "beans" });
    expect(result.features[0].properties?.nested).not.toBe(
      line.properties?.nested,
    );
    expect(line).toEqual(before);
  });

  it("returns an explicit error when a splitter does not cut the line", () => {
    const line: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 0],
        ],
      },
    };
    const splitter: Feature<Point> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [5, 5] },
    };

    expect(splitGeoJSON(line, splitter)).toMatchObject({
      ok: false,
      error: { code: "empty-result" },
    });
  });

  it("uses geometric union for overlapping polygons", () => {
    const first = square(0, 0, 0.0001, { source: "first" });
    const second = square(0.00005, 0, 0.0001, { source: "second" });
    const collection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: [first, second],
    };
    const before = structuredClone(collection);
    const separateArea =
      valueOf(measureGeoJSON(first)).areaSquareMeters +
      valueOf(measureGeoJSON(second)).areaSquareMeters;

    const merged = valueOf(mergeGeoJSON(collection, { crop: "mixed" }));
    const mergedArea = valueOf(measureGeoJSON(merged)).areaSquareMeters;

    expect(merged.type).toBe("Feature");
    expect(merged.geometry.type).toBe("Polygon");
    expect(merged.properties).toEqual({ crop: "mixed" });
    expect(mergedArea).toBeLessThan(separateArea);
    expect(mergedArea).toBeCloseTo(separateArea * 0.75, 3);
    expect(collection).toEqual(before);
  });

  it("simplifies safely and rejects unsupported point simplification", () => {
    const line: Feature<LineString> = {
      type: "Feature",
      properties: { nested: { retained: true } },
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0.00001, 0.000001],
          [0.00002, -0.000001],
          [0.00003, 0],
        ],
      },
    };
    const before = structuredClone(line);

    const simplified = valueOf(
      simplifyGeoJSON(line, { toleranceDegrees: 0.000005 }),
    );

    expect(simplified.geometry.type).toBe("LineString");
    if (simplified.geometry.type !== "LineString")
      throw new Error("expected line");
    expect(simplified.geometry.coordinates.length).toBeLessThan(
      line.geometry.coordinates.length,
    );
    expect(line).toEqual(before);
    expect(
      simplifyGeoJSON(
        { type: "Point", coordinates: [0, 0] },
        { toleranceDegrees: 0.1 },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported-geometry" },
    });
  });

  it("computes a vertex centroid and recomputes stale bounds", () => {
    const polygon = {
      ...square(0, 0, 2),
      bbox: [99, 99, 100, 100] as [number, number, number, number],
    };

    const centroid = valueOf(centroidGeoJSON(polygon, { role: "center" }));
    const bounds = valueOf(boundingBoxGeoJSON(polygon));

    expect(centroid.geometry.coordinates[0]).toBeCloseTo(1, 12);
    expect(centroid.geometry.coordinates[1]).toBeCloseTo(1, 12);
    expect(centroid.properties).toEqual({ role: "center" });
    expect(bounds).toEqual([0, 0, 2, 2]);
  });

  it("rejects unsupported and out-of-range GeoJSON", () => {
    expect(
      boundingBoxGeoJSON({
        type: "CircularString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported-geometry" },
    });
    expect(
      centroidGeoJSON({ type: "Point", coordinates: [181, 0] }),
    ).toMatchObject({
      ok: false,
      error: { code: "topology-error" },
    });
  });
});

describe("measurements and formatting", () => {
  it("measures same-meridian grower rows and multipart lines", () => {
    const rows: Feature<MultiLineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [0, 0.0001],
          ],
          [
            [0.001, 0],
            [0.001, 0.0001],
          ],
        ],
      },
    };

    const result = valueOf(measureGeoJSON(rows));

    expect(result.lengthMeters).toBeCloseTo(22.114855, 5);
    expect(result.perimeterMeters).toBe(0);
    expect(result.areaSquareMeters).toBe(0);
  });

  it("subtracts holes and accumulates multipart polygon area and perimeter", () => {
    const polygonWithHole: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          square(0, 0, 0.0002).geometry.coordinates[0],
          square(0.00005, 0.00005, 0.0001).geometry.coordinates[0],
        ],
      },
    };
    const second = square(0.001, 0, 0.0002);
    const multi: Feature<MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          polygonWithHole.geometry.coordinates,
          second.geometry.coordinates,
        ],
      },
    };

    const withHole = valueOf(measureGeoJSON(polygonWithHole));
    const withoutHole = valueOf(measureGeoJSON(square(0, 0, 0.0002)));
    const multiResult = valueOf(measureGeoJSON(multi));

    expect(withHole.areaSquareMeters).toBeLessThan(
      withoutHole.areaSquareMeters,
    );
    expect(withHole.perimeterMeters).toBeGreaterThan(
      withoutHole.perimeterMeters,
    );
    expect(multiResult.areaSquareMeters).toBeCloseTo(
      withHole.areaSquareMeters +
        valueOf(measureGeoJSON(second)).areaSquareMeters,
      8,
    );
    expect(multiResult.perimeterMeters).toBeCloseTo(
      withHole.perimeterMeters +
        valueOf(measureGeoJSON(second)).perimeterMeters,
      8,
    );
  });

  it("converts meters and square meters to metric and imperial values", () => {
    const measurements = {
      lengthMeters: 1,
      perimeterMeters: 10,
      areaSquareMeters: 1,
    };

    const metric = valueOf(
      formatMeasurements(measurements, "metric", {
        locale: "en-US",
        maximumFractionDigits: 3,
      }),
    );
    const imperial = valueOf(
      formatMeasurements(measurements, "imperial", {
        locale: "en-US",
        maximumFractionDigits: 6,
      }),
    );

    expect(metric.length).toEqual({ value: 1, unit: "m", text: "1 m" });
    expect(imperial.length.value).toBeCloseTo(3.280839895, 10);
    expect(imperial.length.unit).toBe("ft");
    expect(imperial.area.value).toBeCloseTo(10.763910417, 9);
    expect(imperial.area.unit).toBe("ft²");
  });
});

describe("grower presets", () => {
  const baseline: Feature<LineString> = {
    type: "Feature",
    id: "bed-1",
    properties: { id: "bed-1", meta: { crop: "lettuce" } },
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [0, 0.0001],
      ],
    },
  };

  it("publishes only finite positive preset dimensions", () => {
    const dimensions = Object.values(GROWER_PRESETS).flatMap((group) =>
      Object.values(group),
    );

    expect(dimensions.length).toBeGreaterThan(0);
    expect(
      dimensions.every((value) => Number.isFinite(value) && value > 0),
    ).toBe(true);
  });

  it("creates non-mutating bed-edge guides at the requested full width", () => {
    const before = structuredClone(baseline);
    const guides = valueOf(createBedWidthGuides(baseline, 1));
    const left = guides.features[0].geometry.coordinates[0];
    const right = guides.features[1].geometry.coordinates[0];
    const separation = computePreciseDistance(
      left[1],
      left[0],
      right[1],
      right[0],
    );

    expect(guides.features).toHaveLength(2);
    expect(separation.meters).toBeCloseTo(1, 2);
    expect(guides.features.map((feature) => feature.properties?.id)).toEqual([
      "bed-1:bed-left",
      "bed-1:bed-right",
    ]);
    expect(baseline).toEqual(before);
  });

  it("creates symmetric row guides at grower-scale spacing", () => {
    const guides = valueOf(
      createRowSpacingGuides(baseline, 0.3, {
        rowsPerSide: 2,
        includeBaseline: true,
      }),
    );
    const offsets = guides.features.map(
      (feature) =>
        (feature.properties?.["geokit:guide"] as { offsetMeters: number })
          .offsetMeters,
    );

    expect(guides.features).toHaveLength(5);
    expect(offsets).toEqual([-0.6, -0.3, 0, 0.3, 0.6]);
    const first = guides.features[0].geometry.coordinates[0];
    const last = guides.features.at(-1)?.geometry.coordinates[0];
    if (!last) throw new Error("missing last guide");
    expect(
      computePreciseDistance(first[1], first[0], last[1], last[0]).meters,
    ).toBeCloseTo(1.2, 2);
  });

  it("reuses layer-cake baking for concentric irrigation zones", () => {
    const zones = valueOf(
      createIrrigationZones([-122, 38], 12, { zoneCount: 3, steps: 64 }),
    );
    const radii = zones.features.map(
      (feature) => feature.properties?.radius_outer,
    );
    const measured = valueOf(measureGeoJSON(zones));

    expect(zones.features).toHaveLength(3);
    expect(radii).toEqual([4, 8, 12]);
    expect(measured.areaSquareMeters).toBeCloseTo(Math.PI * 12 ** 2, -0.5);
    expect(
      createIrrigationZones([0, 0], Number.POSITIVE_INFINITY),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-options" },
    });
  });
});
