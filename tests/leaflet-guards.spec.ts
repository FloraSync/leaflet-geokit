import { describe, expect, it, vi } from "vitest";
import { assertDrawPresent } from "@src/utils/leaflet-guards";

describe("leaflet guards", () => {
  it("returns true when Draw APIs are present", () => {
    const result = assertDrawPresent({
      Control: { Draw: class MockDraw {} },
      draw: {},
    } as any);

    expect(result).toBe(true);
  });

  it("returns false and reports an error when Draw APIs are missing", () => {
    const onError = vi.fn();

    const result = assertDrawPresent(
      {
        Control: {},
        draw: undefined,
      } as any,
      { onError },
    );

    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      "Leaflet.draw is not available on the provided Leaflet instance",
    );
  });
});
