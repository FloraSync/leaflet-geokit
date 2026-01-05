import { describe, it, expect } from "vitest";
import {
  getRulerOptions,
  measurementSystemDescriptions,
} from "@src/utils/ruler";

describe("utils/ruler", () => {
  it("returns metric options by default", () => {
    const metric = getRulerOptions("metric");
    expect(metric.lengthUnit.display).toBe("km");
    expect(metric.lengthUnit.factor).toBeNull();
    expect(metric.lengthUnit.label).toContain("km");
  });

  it("returns imperial options when requested", () => {
    const imperial = getRulerOptions("imperial");
    expect(imperial.lengthUnit.display).toBe("mi");
    expect(imperial.lengthUnit.factor).toBeCloseTo(0.621371);
    expect(imperial.lengthUnit.label).toContain("mi");
  });

  it("exposes human descriptions for supported systems", () => {
    expect(measurementSystemDescriptions.metric).toMatch(/Meters/);
    expect(measurementSystemDescriptions.imperial).toMatch(/Miles/);
  });
});
