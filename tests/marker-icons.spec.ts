import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  LeafletDrawMapElementAPI,
  MarkerIconConfig,
  ToolButtonConfig,
  ToolToolbarGroupConfig,
} from "@src/types/public";
import type { MarkerIconConfig as EntryMarkerIconConfig } from "@src/index";
import type { MarkerIconConfig as ExternalEntryMarkerIconConfig } from "@src/external";
import {
  DEFAULT_MARKER_ICON_ANCHOR,
  DEFAULT_MARKER_ICON_SIZE,
  DEFAULT_MARKER_POPUP_ANCHOR,
  normalizeMarkerIconAttributes,
} from "@src/lib/marker-icons";

describe("marker icon helpers", () => {
  it("parses attribute tuples with optional whitespace", () => {
    const reportError = vi.fn();
    const config = normalizeMarkerIconAttributes(
      {
        iconUrl: "https://example.com/pin.svg",
        iconSize: "32, 40",
        iconAnchor: "16,40",
        popupAnchor: "0, -34",
      },
      { reportError },
    );

    expect(config).toEqual(
      expect.objectContaining({
        iconUrl: "https://example.com/pin.svg",
        iconRetinaUrl: "https://example.com/pin.svg",
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -34],
      }),
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("falls back to defaults for invalid attribute tuples", () => {
    const reportError = vi.fn();
    const config = normalizeMarkerIconAttributes(
      {
        iconUrl: "https://example.com/pin.svg",
        iconSize: "32px,40px",
        iconAnchor: "[16,40]",
        popupAnchor: "",
      },
      { reportError },
    );

    expect(config).toEqual(
      expect.objectContaining({
        iconSize: DEFAULT_MARKER_ICON_SIZE,
        iconAnchor: DEFAULT_MARKER_ICON_ANCHOR,
        popupAnchor: DEFAULT_MARKER_POPUP_ANCHOR,
      }),
    );
    expect(reportError).toHaveBeenCalledTimes(3);
  });

  it("exports marker icon types from bundled and external public entrypoints", () => {
    expectTypeOf<LeafletDrawMapElementAPI["markerIconConfig"]>().toEqualTypeOf<
      MarkerIconConfig | null | undefined
    >();
    expectTypeOf<LeafletDrawMapElementAPI["toolButtonConfig"]>().toEqualTypeOf<
      ToolButtonConfig | null | undefined
    >();
    expectTypeOf<LeafletDrawMapElementAPI["toolbarGroups"]>().toEqualTypeOf<
      ToolToolbarGroupConfig[] | null | undefined
    >();
    expectTypeOf<EntryMarkerIconConfig>().toEqualTypeOf<MarkerIconConfig>();
    expectTypeOf<ExternalEntryMarkerIconConfig>().toEqualTypeOf<MarkerIconConfig>();
  });
});
