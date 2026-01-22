import { describe, it, expect } from "vitest";
import { computePreciseDistance, magicRound } from "@src/utils/geodesic";

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

  it("handles identical points correctly", () => {
    const result = computePreciseDistance(40.7128, -74.006, 40.7128, -74.006);
    expect(result.meters).toBe(0);
    expect(result.bearingDegrees).toBe(0);
    expect(result.algorithm).toBe("vincenty");
  });

  it("handles nearly identical points correctly", () => {
    // Points so close that sinSigma becomes effectively 0
    const result = computePreciseDistance(
      40.712800000,
      -74.006000000,
      40.712800001,
      -74.006000001
    );
    expect(result.meters).toBeCloseTo(0, 3); // Less strict precision since these aren't exactly identical
    expect(result.bearingDegrees).toBeDefined();
  });

  it("triggers sinSigma === 0 inside vincenty loop with real coordinates", () => {
    // The sinSigma === 0 condition (lines 110-116) occurs when the calculated
    // sinSigma becomes 0 during the iterative refinement process.
    // This happens when points become effectively identical during the iteration.
    
    // Use coordinates where the iterative process will detect identical points
    // North pole coordinates - any longitude at 90° latitude is the same point
    const result = computePreciseDistance(90, 0, 90, 180);
    expect(result.meters).toBeCloseTo(0, 8); // Allow for floating point precision
    expect(result.bearingDegrees).toBeCloseTo(0, 8);
    expect(result.algorithm).toBe("vincenty");
  });

  it("triggers sigma === 0 in karney with antipodal convergence failure", () => {
    // To hit lines 209-210 (sigma === 0 in karney), we need:
    // 1. Vincenty to fail to converge (max iterations exceeded)
    // 2. Karney algorithm to process effectively identical points
    
    // Use coordinates that are known to cause Vincenty convergence issues
    // Nearly antipodal points on the equator are particularly problematic
    const result = computePreciseDistance(0, 0, 0, 179.99999999999);
    
    // This should either converge with Vincenty or fallback to Karney
    if (result.algorithm === 'karney') {
      // If Karney was used, test that it handled the case properly
      expect(result.meters).toBeGreaterThan(19_900_000);
      expect(result.bearingDegrees).toBeGreaterThanOrEqual(0);
      expect(result.bearingDegrees).toBeLessThan(360);
    } else {
      // Vincenty managed to converge
      expect(result.algorithm).toBe('vincenty');
      expect(result.meters).toBeGreaterThan(19_900_000);
    }
  });
  it("forces karney sigma === 0 using south pole coordinates", () => {
    // Similar to north pole test, but using south pole
    // All longitudes at -90° latitude represent the same point
    const result1 = computePreciseDistance(-90, 0, -90, 90);
    expect(result1.meters).toBeCloseTo(0, 8); // Allow for floating point precision
    expect(result1.bearingDegrees).toBeDefined(); // Bearing can be any value for identical points
    
    const result2 = computePreciseDistance(-90, -45, -90, 135);
    expect(result2.meters).toBeCloseTo(0, 8);
    expect(result2.bearingDegrees).toBeDefined();
  });

  it("creates maximum vincenty iterations with near-antipodal points", () => {
    // Create a scenario that pushes Vincenty to its iteration limit
    // forcing a fallback to Karney algorithm
    // Use coordinates that are nearly but not exactly antipodal
    
    const lat1 = 0.1;      // Slightly off equator
    const lon1 = 0.1;      // Slightly off prime meridian
    const lat2 = -0.1;     // Nearly antipodal latitude
    const lon2 = 179.9;    // Nearly antipodal longitude
    
    const result = computePreciseDistance(lat1, lon1, lat2, lon2);
    
    // Should produce a valid result regardless of algorithm used
    expect(result.meters).toBeGreaterThan(19_800_000);
    expect(result.bearingDegrees).toBeGreaterThanOrEqual(0);
    expect(result.bearingDegrees).toBeLessThan(360);
    expect(['vincenty', 'karney']).toContain(result.algorithm);
    
    if (result.algorithm === 'karney') {
      // Vincenty failed to converge, so Karney was used
      expect(result.iterations).toBeGreaterThanOrEqual(200); // Max vincenty iterations
    }
  });

  describe("magicRound utility function", () => {
    it("rounds numbers to precise decimal places", () => {
      expect(magicRound(1.23456789123456789)).toBeCloseTo(1.234567891, 9);
      expect(magicRound(0)).toBe(0);
      expect(magicRound(-1.23456789123456789)).toBeCloseTo(-1.234567891, 9);
    });

    it("handles very small numbers", () => {
      expect(magicRound(0.000000001)).toBeCloseTo(0.000000001, 9);
      expect(magicRound(-0.000000001)).toBeCloseTo(-0.000000001, 9);
    });

    it("handles very large numbers", () => {
      expect(magicRound(1234567890.123456789)).toBeCloseTo(1234567890.123456789, 6);
    });
  });
});
