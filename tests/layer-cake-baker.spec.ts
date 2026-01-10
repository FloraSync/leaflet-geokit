import { describe, it, expect } from "vitest";
import { bakeLayerCake } from "@src/lib/layer-cake/CakeBaker";

type Position = [number, number];

function signedRingArea(coords: Position[]): number {
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function mockCircle(lat: number, lng: number, radius: number) {
  return {
    getLatLng: () => ({ lat, lng }),
    getRadius: () => radius,
  };
}

describe("bakeLayerCake", () => {
  it("creates concentric core + rings as donut polygons", () => {
    const circles = [
      mockCircle(10, 20, 300),
      mockCircle(10, 20, 100),
      mockCircle(10, 20, 200),
    ];

    const fc = bakeLayerCake({ circles, steps: 16 });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(3);

    const [core, ring1, ring2] = fc.features;
    expect(core.geometry?.type).toBe("Polygon");
    expect(ring1.geometry?.type).toBe("Polygon");
    expect(ring2.geometry?.type).toBe("Polygon");

    const coreCoords = (core.geometry as any).coordinates as Position[][];
    const ring1Coords = (ring1.geometry as any).coordinates as Position[][];
    const ring2Coords = (ring2.geometry as any).coordinates as Position[][];

    expect(coreCoords).toHaveLength(1);
    expect(ring1Coords).toHaveLength(2);
    expect(ring2Coords).toHaveLength(2);

    // Closed rings
    expect(coreCoords[0][0]).toEqual(coreCoords[0].at(-1));
    expect(ring1Coords[0][0]).toEqual(ring1Coords[0].at(-1));
    expect(ring1Coords[1][0]).toEqual(ring1Coords[1].at(-1));

    // Winding: outer CCW (+ area), hole CW (- area) in our implementation
    expect(signedRingArea(ring1Coords[0])).toBeGreaterThan(0);
    expect(signedRingArea(ring1Coords[1])).toBeLessThan(0);

    // Metadata sorted by radius, smallest first
    expect((core.properties as any).layer_index).toBe(0);
    expect((ring1.properties as any).layer_index).toBe(1);
    expect((ring2.properties as any).layer_index).toBe(2);

    expect((core.properties as any).radius_outer).toBe(100);
    expect((ring1.properties as any).radius_outer).toBe(200);
    expect((ring2.properties as any).radius_outer).toBe(300);

    // Stable shape editing metadata
    expect((core.properties as any)._meta).toEqual({
      lat: 10,
      lng: 20,
      radius: 100,
    });
  });
});
