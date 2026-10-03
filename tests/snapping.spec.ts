import { describe, expect, it } from "vitest";
import { findSnap, type SnapTarget } from "@src/lib/snapping";
import { computePreciseDistance } from "@src/utils/geodesic";
import type { SnappingOptions } from "@src/types/public";

const project = (latlng: { lat: number; lng: number }) => ({
  x: latlng.lng * 100,
  y: -latlng.lat * 100,
});
const unproject = (point: { x: number; y: number }) => ({
  lng: point.x / 100,
  lat: -point.y / 100,
});
const target = (
  featureId: string,
  layerKind: string,
  coordinates: any,
  visible = true,
): SnapTarget => ({
  featureId,
  layerId: `${layerKind}-layer`,
  layerKind,
  visible,
  feature: {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  },
});

describe("screen-space snapping", () => {
  it("snaps to a vertex within tolerance and excludes the edited feature", () => {
    const result = findSnap(
      { lat: 0.03, lng: 0.04 },
      [
        target("other", "drawn", [
          [0, 0],
          [1, 0],
        ]),
      ],
      project,
      unproject,
      { enabled: true, modes: ["vertex"], tolerancePx: 6 },
    );
    expect(result).toMatchObject({
      mode: "vertex",
      targetFeatureId: "other",
      latlng: { lat: 0, lng: 0 },
    });
    expect(
      findSnap(
        { lat: 0.03, lng: 0.04 },
        [
          target("other", "drawn", [
            [0, 0],
            [1, 0],
          ]),
        ],
        project,
        unproject,
        { modes: ["vertex"], tolerancePx: 6 },
        "other",
      ),
    ).toBeNull();
  });

  it("uses rendered edge distance instead of geographic coordinate distance", () => {
    const result = findSnap(
      { lat: -0.03, lng: 0.5 },
      [
        target("line", "drawn", [
          [0, 0],
          [1, 0],
        ]),
      ],
      project,
      unproject,
      { modes: ["edge"], tolerancePx: 6 },
    );
    expect(result?.mode).toBe("edge");
    expect(result?.latlng.lng).toBeCloseTo(0.5);
    expect(result?.latlng.lat).toBeCloseTo(0);
  });

  it("evaluates vertex and edge candidates when both modes are enabled", () => {
    const result = findSnap(
      { lat: -0.02, lng: 0.5 },
      [
        target("line", "drawn", [
          [0, 0],
          [1, 0],
        ]),
      ],
      project,
      unproject,
      { modes: ["vertex", "edge"], tolerancePx: 3 },
    );
    expect(result).toMatchObject({
      mode: "edge",
      latlng: { lng: 0.5, lat: 0 },
    });
  });

  it("snaps a physical grid using the documented origin", () => {
    const result = findSnap(
      { lat: 0.000092, lng: 0.000091 },
      [],
      project,
      unproject,
      {
        modes: ["grid"],
        gridSizeMeters: 10,
        gridOrigin: [0, 0],
        tolerancePx: 2,
      },
    );
    expect(result?.mode).toBe("grid");
    expect(result?.latlng.lat).toBeCloseTo(0.0000904, 5);
    expect(result?.latlng.lng).toBeCloseTo(0.0000899, 5);
  });

  it("keeps one-meter grid nodes physically spaced as latitude grows", () => {
    const geographicProject = (latlng: { lat: number; lng: number }) => ({
      x: latlng.lng * 1_000_000,
      y: -latlng.lat * 1_000_000,
    });
    const geographicUnproject = (point: { x: number; y: number }) => ({
      lng: point.x / 1_000_000,
      lat: -point.y / 1_000_000,
    });
    const gridOptions = (latitude: number): SnappingOptions => ({
      modes: ["grid"],
      gridSizeMeters: 1,
      gridOrigin: [0, latitude] as [number, number],
      tolerancePx: 100,
    });
    const uniqueNodes = (
      raws: readonly { lat: number; lng: number }[],
      options: SnappingOptions,
    ) => {
      const nodes = new Map<string, { lat: number; lng: number }>();
      for (const raw of raws) {
        const result = findSnap(
          raw,
          [],
          geographicProject,
          geographicUnproject,
          options,
        );
        if (result)
          nodes.set(`${result.latlng.lng},${result.latlng.lat}`, result.latlng);
      }
      return [...nodes.values()];
    };

    for (const latitude of [0, 15, 30, 45, 60, 75]) {
      const options = gridOptions(latitude);
      const horizontal = uniqueNodes(
        Array.from({ length: 201 }, (_, index) => ({
          lat: latitude,
          lng: index / 1_000_000,
        })),
        options,
      );
      const vertical = uniqueNodes(
        Array.from({ length: 201 }, (_, index) => ({
          lat: latitude + index / 1_000_000,
          lng: 0,
        })),
        options,
      );

      expect(
        horizontal.length,
        `longitude nodes at ${latitude}°`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        vertical.length,
        `latitude nodes at ${latitude}°`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        computePreciseDistance(
          horizontal[0].lat,
          horizontal[0].lng,
          horizontal[1].lat,
          horizontal[1].lng,
        ).meters,
      ).toBeCloseTo(1, 3);
      expect(
        computePreciseDistance(
          vertical[0].lat,
          vertical[0].lng,
          vertical[1].lat,
          vertical[1].lng,
        ).meters,
      ).toBeCloseTo(1, 3);
    }
  });

  it("uses a stable default origin and correct WGS84 longitude scale at 45°", () => {
    const first = findSnap({ lat: 45, lng: 0 }, [], project, unproject, {
      modes: ["grid"],
      gridSizeMeters: 1,
      tolerancePx: 100,
    });
    const second = findSnap(
      { lat: 45, lng: 1 / 110_574 },
      [],
      project,
      unproject,
      { modes: ["grid"], gridSizeMeters: 1, tolerancePx: 100 },
    );

    expect(first?.latlng).toEqual(
      findSnap({ lat: 45, lng: 0 }, [], project, unproject, {
        modes: ["grid"],
        gridSizeMeters: 1,
        tolerancePx: 100,
      })?.latlng,
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(
      computePreciseDistance(
        first!.latlng.lat,
        first!.latlng.lng,
        second!.latlng.lat,
        second!.latlng.lng,
      ).meters,
    ).toBeCloseTo(1, 3);
  });

  it("targets guide layers only in guide mode and ignores hidden/measurement layers", () => {
    const guide = target("guide", "guide", [
      [0, 0],
      [1, 0],
    ]);
    const hidden = target(
      "hidden",
      "drawn",
      [
        [0, 0],
        [1, 0],
      ],
      false,
    );
    const measurement = target("measurement", "measurement", [
      [0, 0],
      [1, 0],
    ]);
    expect(
      findSnap({ lat: 0.01, lng: 0.5 }, [guide], project, unproject, {
        modes: ["edge"],
        tolerancePx: 3,
      }),
    ).toBeNull();
    expect(
      findSnap({ lat: 0.01, lng: 0.5 }, [guide], project, unproject, {
        modes: ["guide"],
        tolerancePx: 3,
      })?.mode,
    ).toBe("guide");
    expect(
      findSnap(
        { lat: 0, lng: 0.5 },
        [hidden, measurement],
        project,
        unproject,
        { modes: ["edge", "guide"], tolerancePx: 3 },
      ),
    ).toBeNull();
  });
});
