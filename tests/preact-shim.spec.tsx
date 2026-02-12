import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render } from "@testing-library/preact";

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

import type { FeatureCollection } from "geojson";
import { PreactLeafletGeoKit } from "@src/preact/index";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Preact shim", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts leaflet-geokit and enables external/additive attributes by default", async () => {
    const { container } = render(
      h(PreactLeafletGeoKit, {
        className: "test-map",
        style: { height: "420px", width: "100%" },
        attributes: {
          zoom: 10,
          "draw-polygon": true,
        },
      }),
    );

    await flushPromises();

    const element = container.querySelector("leaflet-geokit") as HTMLElement;
    expect(element).toBeTruthy();
    expect(element.className).toBe("test-map");
    expect(element.getAttribute("zoom")).toBe("10");
    expect(element.hasAttribute("draw-polygon")).toBe(true);
    expect(element.hasAttribute("use-external-leaflet")).toBe(true);
    expect(element.hasAttribute("skip-leaflet-styles")).toBe(true);
  });

  it("syncs serialized GeoJSON on draw/edit events", async () => {
    const onChangeText = vi.fn();
    const { container } = render(
      h(PreactLeafletGeoKit, {
        onChangeText,
      }),
    );

    const element = container.querySelector("leaflet-geokit") as any;
    const geoJSON: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "a" },
          geometry: { type: "Point", coordinates: [-105, 39.7] },
        },
      ],
    };

    vi.spyOn(element, "getGeoJSON").mockResolvedValue(geoJSON);
    element.dispatchEvent(new CustomEvent("leaflet-draw:created"));
    await flushPromises();

    expect(onChangeText).toHaveBeenCalledWith(JSON.stringify(geoJSON));
  });

  it("loads initial GeoJSON text on ready", async () => {
    const initial: FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    const { container } = render(
      h(PreactLeafletGeoKit, {
        initialGeoJSONText: JSON.stringify(initial),
      }),
    );

    const element = container.querySelector("leaflet-geokit") as any;
    const loadSpy = vi
      .spyOn(element, "loadGeoJSONFromText")
      .mockResolvedValue(undefined);
    const getSpy = vi.spyOn(element, "getGeoJSON").mockResolvedValue(initial);

    element.dispatchEvent(new CustomEvent("leaflet-draw:ready"));
    await flushPromises();

    expect(loadSpy).toHaveBeenCalledWith(JSON.stringify(initial));
    expect(getSpy).toHaveBeenCalled();
  });

  it("handles concurrent mounts without race conditions", async () => {
    const first = render(h(PreactLeafletGeoKit, { className: "first" }));
    const second = render(h(PreactLeafletGeoKit, { className: "second" }));

    await flushPromises();

    const firstElement = first.container.querySelector(
      "leaflet-geokit",
    ) as HTMLElement;
    const secondElement = second.container.querySelector(
      "leaflet-geokit",
    ) as HTMLElement;

    expect(firstElement).toBeTruthy();
    expect(secondElement).toBeTruthy();
    expect(firstElement.className).toBe("first");
    expect(secondElement.className).toBe("second");
    expect(firstElement.hasAttribute("use-external-leaflet")).toBe(true);
    expect(secondElement.hasAttribute("use-external-leaflet")).toBe(true);
  });
});
