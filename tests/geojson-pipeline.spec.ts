import { describe, expect, it, vi } from "vitest";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  applyGeoJSONPatch,
  diffGeoJSON,
  exportGeoJSONData,
  importGeoJSONData,
  importGeoJSONText,
  importGeoJSONURL,
  normalizeGeoJSON,
  validateGeoJSON,
} from "../src/utils/geojson-pipeline";

const point = (id: string | number = "bed"): Feature => ({
  type: "Feature",
  id,
  properties: { crop: "beans", care: { water: [1, 2] } },
  geometry: { type: "Point", coordinates: [-118, 34] },
});
const fc = (...features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

describe("GeoJSON pipeline", () => {
  it("stops before geometry traversal when JSON preflight rejects a cycle", () => {
    const geometry: { type: string; geometries: unknown[] } = {
      type: "GeometryCollection",
      geometries: [],
    };
    geometry.geometries.push(geometry, geometry);
    const result = importGeoJSONData(geometry);
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      "invalid-json",
      "invalid-json",
    ]);
  });

  it("rejects sparse arrays, malformed provenance and invalid fallback IDs", () => {
    expect(validateGeoJSON({ type: { toString: 0 } }).valid).toBe(false);
    expect(validateGeoJSON({ ...point(), id: { toString: 0 } }).valid).toBe(
      false,
    );
    expect(
      validateGeoJSON({ type: "Point", coordinates: new Array(2) }).valid,
    ).toBe(false);
    expect(
      validateGeoJSON({ ...point(), properties: { "geokit:source": [null] } })
        .valid,
    ).toBe(false);
    const p = point();
    delete p.id;
    p.properties!.id = {};
    expect(validateGeoJSON(p).valid).toBe(false);
  });
  it("does not infer provenance from app IDs and isolates sibling metadata", () => {
    const plain = fc(point("customer::0"));
    expect(exportGeoJSONData(plain, { adapter: "source" }).data).toEqual(plain);
    const expanded = normalizeGeoJSON(
      {
        ...point(),
        geometry: {
          type: "MultiPoint",
          coordinates: [
            [1, 2],
            [3, 4],
          ],
        },
      },
      { expandMulti: true },
    );
    expanded.features[0].properties!.care.water.push(9);
    expect(expanded.features[1].properties!.care.water).toEqual([1, 2]);
    expect(exportGeoJSONData(expanded, { adapter: "source" }).valid).toBe(
      false,
    );
  });
  it.each([point(), fc(point()), point().geometry])(
    "accepts each common app shape",
    (input) => {
      const result = importGeoJSONData(input);
      expect(result.valid).toBe(true);
      expect(result.featureCount).toBe(1);
      expect(result.data?.features).toHaveLength(1);
      expect(result.data?.features[0].id).toBeDefined();
    },
  );
  it.each([
    [
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        ],
      },
      "invalid-ring",
    ],
    [{ type: "Point", coordinates: [Infinity, 1] }, "invalid-position"],
    [{ type: "Triangle", coordinates: [] }, "unsupported-geometry"],
    [{ type: "MultiPoint", coordinates: [] }, "empty-geometry"],
    [null, "empty-geometry"],
    [{ type: "LineString", coordinates: [[1, 2]] }, "invalid-line"],
  ])("rejects invalid geometry with a path", (geometry, code) => {
    const input = { ...point(), geometry };
    const result = importGeoJSONData(input);
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code,
          path: expect.stringContaining("geometry"),
        }),
      ]),
    );
    expect(() => normalizeGeoJSON(input)).toThrow("GeoJSON validation failed");
  });
  it("warns on CRS without silently reprojecting", () => {
    const input = {
      ...point(),
      crs: { type: "name", properties: { name: "EPSG:3857" } },
      geometry: { type: "Point", coordinates: [1000, 2000] },
    };
    const result = importGeoJSONData(input);
    expect(result.valid).toBe(true);
    expect(
      result.diagnostics.filter((d) => d.code === "crs-mismatch"),
    ).toHaveLength(2);
    expect(result.data?.features[0].geometry).toEqual(input.geometry);
  });
  it("rejects duplicate and invalid IDs, malformed properties, and cyclic/non-JSON metadata", () => {
    expect(validateGeoJSON(fc(point(1), point("1"))).valid).toBe(false);
    expect(validateGeoJSON({ ...point(), id: {} }).valid).toBe(false);
    expect(validateGeoJSON({ ...point(), properties: [] }).valid).toBe(false);
    const p = point();
    p.properties!.cycle = p;
    expect(validateGeoJSON(p).valid).toBe(false);
    expect(
      validateGeoJSON({ ...point(), properties: { bad: undefined } }).valid,
    ).toBe(false);
  });
  it("normalizes without mutating or aliasing properties, coordinates or IDs", () => {
    const p = point(0);
    p.properties!.id = "app-row";
    const snapshot = structuredClone(p);
    const normalized = normalizeGeoJSON(p);
    expect(normalized.features[0]).toEqual(snapshot);
    normalized.features[0].properties!.care.water.push(3);
    expect(p).toEqual(snapshot);
    expect(normalizeGeoJSON(fc()).features).toEqual([]);
  });
  it.each<Geometry>([
    { type: "MultiPoint", coordinates: [[1, 2]] },
    {
      type: "MultiPoint",
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    },
    {
      type: "MultiLineString",
      coordinates: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    },
    {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
      ],
    },
    {
      type: "GeometryCollection",
      geometries: [
        {
          type: "MultiPoint",
          coordinates: [
            [1, 2],
            [3, 4],
          ],
        },
        { type: "Point", coordinates: [5, 6] },
      ],
    },
  ])(
    "round-trips Multi/collection topology and metadata: $type",
    (geometry) => {
      const p = { ...point(0), geometry };
      p.properties!.id = "app-row";
      const source = fc(p);
      const editing = normalizeGeoJSON(source, { expandMulti: true });
      expect(
        editing.features.every((f) =>
          ["Point", "LineString", "Polygon"].includes(f.geometry.type),
        ),
      ).toBe(true);
      const restored = exportGeoJSONData(editing, { adapter: "source" });
      expect(restored.valid).toBe(true);
      expect(restored.data).toEqual(source);
    },
  );
  it("round-trips null properties and exports edited geometry rather than stale source geometry", () => {
    const p: Feature = {
      type: "Feature",
      id: "m",
      properties: null,
      geometry: { type: "MultiPoint", coordinates: [[1, 2]] },
    };
    const editing = normalizeGeoJSON(p, { expandMulti: true });
    editing.features[0].geometry = { type: "Point", coordinates: [8, 9] };
    expect(
      exportGeoJSONData(editing, { adapter: "source" }).data?.features[0],
    ).toEqual({
      ...p,
      geometry: { type: "MultiPoint", coordinates: [[8, 9]] },
    });
  });
  it("reports child metadata conflicts instead of dropping app edits", () => {
    const editing = normalizeGeoJSON(
      {
        ...point(),
        geometry: {
          type: "MultiPoint",
          coordinates: [
            [1, 2],
            [3, 4],
          ],
        },
      },
      { expandMulti: true },
    );
    editing.features[1].properties!.crop = "peas";
    const result = exportGeoJSONData(editing, { adapter: "source" });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "metadata-conflict")).toBe(
      true,
    );
    expect(exportGeoJSONData(editing).valid).toBe(true);
  });
  it("detects expansion ID collisions before importing", () => {
    const result = importGeoJSONData(
      fc(
        {
          ...point("a"),
          geometry: { type: "MultiPoint", coordinates: [[1, 2]] },
        },
        point("a::0"),
      ),
      { expandMulti: true },
    );
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
  });
  it("adapts text and URL with summaries, handles HTTP and parse failures", async () => {
    expect(importGeoJSONText("not JSON").valid).toBe(false);
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(point())));
    const signal = new AbortController().signal;
    expect(
      (await importGeoJSONURL("https://example.test/data", { fetcher, signal }))
        .valid,
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("https://example.test/data", {
      signal,
    });
    fetcher.mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(
      importGeoJSONURL("https://example.test/data", { fetcher }),
    ).rejects.toThrow("HTTP 500");
    fetcher.mockResolvedValue(new Response("not JSON"));
    expect(
      (await importGeoJSONURL("https://example.test/data", { fetcher })).valid,
    ).toBe(false);
  });
  it("diffs created/updated/deleted IDs, patches immutably, and ignores object key order", () => {
    const before = fc(point("same"), point("edit"), point("delete"));
    const after = fc(
      point("same"),
      { ...point("edit"), geometry: { type: "Point", coordinates: [2, 3] } },
      point("new"),
    );
    const snapshot = structuredClone(before);
    const diff = diffGeoJSON(before, after);
    expect(diff.createdIds).toEqual(["new"]);
    expect(diff.updatedIds).toEqual(["edit"]);
    expect(diff.deletedIds).toEqual(["delete"]);
    expect(applyGeoJSONPatch(before, diff)).toEqual(after);
    expect(before).toEqual(snapshot);
    expect(
      diffGeoJSON(
        fc(point()),
        fc({
          ...point(),
          properties: { care: { water: [1, 2] }, crop: "beans" },
        }),
      ).updatedIds,
    ).toEqual([]);
    expect(
      diffGeoJSON(fc(point()), fc({ ...point(), properties: { crop: "peas" } }))
        .updatedIds,
    ).toEqual(["bed"]);
  });
  it("rejects missing IDs and conflicting patch operations without mutating base", () => {
    const noId = point();
    delete noId.id;
    expect(() => diffGeoJSON(fc(noId), fc())).toThrow("stable feature IDs");
    const base = fc(point());
    const snapshot = structuredClone(base);
    for (const patch of [
      { created: [point()], updated: [], deleted: [] },
      { created: [], updated: [point("missing")], deleted: [] },
      { created: [], updated: [], deleted: ["missing"] },
      { created: [point()], updated: [], deleted: ["bed"] },
    ])
      expect(() => applyGeoJSONPatch(base, patch)).toThrow();
    expect(base).toEqual(snapshot);
  });
});
