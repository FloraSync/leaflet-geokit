import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

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

import { ReactLeafletGeoKit } from "@src/react-bundled/index";

describe("React bundled shim", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts without external/additive attributes by default", () => {
    const { container } = render(
      React.createElement(ReactLeafletGeoKit, {
        style: { width: "100%", height: "420px" },
        attributes: {
          zoom: 10,
          "draw-polygon": true,
        },
      }),
    );

    const element = container.querySelector("leaflet-geokit") as HTMLElement;
    expect(element).toBeTruthy();
    expect(element.getAttribute("zoom")).toBe("10");
    expect(element.hasAttribute("draw-polygon")).toBe(true);
    expect(element.hasAttribute("use-external-leaflet")).toBe(false);
    expect(element.hasAttribute("skip-leaflet-styles")).toBe(false);
    expect(element.getAttribute("style")).toContain("height: 420px;");
  });
});
