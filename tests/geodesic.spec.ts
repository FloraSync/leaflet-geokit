import { describe, it, expect } from "vitest";
import { computePreciseDistance } from "@src/utils/geodesic";

describe("utils/geodesic", () => {
  it("matches expected distance/bearing for Denver → NYC", () => {
    const result = computePreciseDistance(39.7392, -104.9903, 40.7128, -74.006);
    expect(result.algorithm).toBe("vincenty");
    expect(result.meters).toBeCloseTo(2625638.756, 3);
    expect(result.bearingDegrees).toBeCloseTo(77.5606, 3);
  });

  it("matches expected distance/bearing for Paris → London", () => {
    const result = computePreciseDistance(48.8566, 2.3522, 51.5074, -0.1278);
    expect(result.algorithm).toBe("vincenty");
    expect(result.meters).toBeCloseTo(343923.12, 3);
    expect(result.bearingDegrees).toBeCloseTo(329.9514, 3);
  });

  it("computes long-haul Sydney → Tokyo with correct heading", () => {
    const result = computePreciseDistance(
      -33.8688,
      151.2093,
      35.6762,
      139.6503,
    );
    expect(result.algorithm).toBe("vincenty");
    expect(result.meters).toBeCloseTo(7792174.827, 3);
    expect(result.bearingDegrees).toBeCloseTo(350 - 0.0025, 1);
  });

  it("falls back gracefully for nearly antipodal points", () => {
    const result = computePreciseDistance(0, 0, 0.0000001, 179.9999999);
    expect(result.meters).toBeGreaterThan(19_000_000);
    expect(result.algorithm).toBeTypeOf("string");
  });
});
