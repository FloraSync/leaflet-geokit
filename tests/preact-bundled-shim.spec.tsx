import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render, waitFor } from "@testing-library/preact";

vi.mock("@src/lib/MapController", () => {
  class MapController {
    init = vi.fn(async () => {});
    destroy = vi.fn(async () => {});
    getGeoJSON = vi.fn(async () => ({
      type: "FeatureCollection",
      features: [],
    }));
    loadGeoJSON = vi.fn(async () => {});
    addFeatures = vi.fn(async () => []);
    updateFeature = vi.fn(async () => {});
    removeFeature = vi.fn(async () => {});
    clearLayers = vi.fn(async () => {});
    fitBoundsToData = vi.fn(async () => {});
    fitBounds = vi.fn(async () => {});
    setView = vi.fn(async () => {});
    mergeVisiblePolygons = vi.fn(async () => null);
    setRulerUnits = vi.fn(() => {});
  }

  return { MapController };
});

import { PreactLeafletGeoKit } from "@src/preact-bundled/index";

describe("Preact bundled shim", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts without external/additive attributes by default", async () => {
    const { container } = render(
      h(PreactLeafletGeoKit, {
        style: { width: "100%", height: "420px" },
        attributes: {
          zoom: 10,
          "draw-polygon": true,
        },
      }),
    );

    const element = container.querySelector("leaflet-geokit") as HTMLElement;
    await waitFor(() => {
      expect(element).toBeTruthy();
      expect(element.getAttribute("zoom")).toBe("10");
      expect(element.hasAttribute("draw-polygon")).toBe(true);
      expect(element.hasAttribute("use-external-leaflet")).toBe(false);
      expect(element.hasAttribute("skip-leaflet-styles")).toBe(false);
    });
  });
});
