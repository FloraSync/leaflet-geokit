import { describe, expect, it } from "vitest";
import {
  buildTileURL,
  validateProviderConfig,
} from "@src/lib/TileProviderFactory";

describe("TileProviderFactory", () => {
  it("normalizes provider/style/api key inputs for HERE", () => {
    const out = buildTileURL({
      provider: " HERE ",
      style: " satellite.day ",
      apiKey: "  test-key  ",
    });

    expect(out.urlTemplate).toContain("style=satellite.day");
    expect(out.urlTemplate).toContain("apiKey=test-key");
    expect(out.maxZoom).toBe(20);
  });

  it("uses the HERE default style when style is omitted or invalid", () => {
    const out = buildTileURL({
      provider: "here",
      style: "not-a-style",
      apiKey: "abc",
    });

    expect(out.urlTemplate).toContain("style=lite.day");
  });

  it("rejects HERE when api key is empty or whitespace", () => {
    expect(validateProviderConfig({ provider: "here", apiKey: "   " })).toEqual(
      {
        valid: false,
        error: "HERE Maps requires an API key",
      },
    );
  });

  it("throws unknown provider errors with original provider text", () => {
    expect(() =>
      buildTileURL({
        provider: "mystery-provider",
      }),
    ).toThrow("Unknown tile provider: mystery-provider");
  });
});
