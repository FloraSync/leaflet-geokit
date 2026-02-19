import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render, waitFor } from "@testing-library/preact";
import "@src/index";

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
      expect(element.getAttribute("style")).toContain("height: 420px;");
    });
  });

  it("supports forcing bundled mode in external entrypoint", async () => {
    const { container } = render(
      h(PreactLeafletGeoKit, {
        externalLeaflet: false,
      }),
    );

    const element = container.querySelector("leaflet-geokit") as HTMLElement;
    await waitFor(() => {
      expect(element).toBeTruthy();
      expect(element.hasAttribute("use-external-leaflet")).toBe(false);
      expect(element.hasAttribute("skip-leaflet-styles")).toBe(false);
    });
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
    await waitFor(() => {
      expect(typeof element.loadGeoJSONFromText).toBe("function");
      expect(typeof element.getGeoJSON).toBe("function");
    });

    const loadSpy = vi
      .spyOn(element, "loadGeoJSONFromText")
      .mockResolvedValue(undefined);
    const getSpy = vi.spyOn(element, "getGeoJSON").mockResolvedValue(initial);

    element.dispatchEvent(new CustomEvent("leaflet-draw:ready"));
    await flushPromises();

    expect(loadSpy).toHaveBeenCalledWith(JSON.stringify(initial));
    expect(getSpy).toHaveBeenCalled();
  });

  it("reports sync errors through onError", async () => {
    const onError = vi.fn();
    const { container } = render(
      h(PreactLeafletGeoKit, {
        onError,
      }),
    );

    const element = container.querySelector("leaflet-geokit") as any;
    await waitFor(() => {
      expect(typeof element.getGeoJSON).toBe("function");
    });

    vi.spyOn(element, "getGeoJSON").mockRejectedValue("sync failed");
    element.dispatchEvent(new CustomEvent("leaflet-draw:created"));
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("sync failed");
  });

  it("emits parsed geojson through onChangeGeoJSON", async () => {
    const onChangeGeoJSON = vi.fn();
    const { container } = render(
      h(PreactLeafletGeoKit, {
        onChangeGeoJSON,
      }),
    );

    const element = container.querySelector("leaflet-geokit") as any;
    await waitFor(() => {
      expect(typeof element.getGeoJSON).toBe("function");
    });

    const geoJSON: FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    vi.spyOn(element, "getGeoJSON").mockResolvedValue(geoJSON);
    element.dispatchEvent(new CustomEvent("leaflet-draw:edited"));
    await flushPromises();

    expect(onChangeGeoJSON).toHaveBeenCalledWith(geoJSON);
  });

  it("calls onReady with the underlying custom element", async () => {
    const onReady = vi.fn();
    const { container } = render(h(PreactLeafletGeoKit, { onReady }));

    const element = container.querySelector("leaflet-geokit") as HTMLElement;
    await flushPromises();

    element.dispatchEvent(new CustomEvent("leaflet-draw:ready"));
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(element);
    });
  });
});
