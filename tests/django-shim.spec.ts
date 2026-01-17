import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { initDjangoGeokit } from "@src/django/index";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Django shim", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a custom element and hides the textarea", () => {
    const textarea = document.createElement("textarea");
    textarea.className = "geokit-editor-widget";
    textarea.setAttribute("data-geokit-zoom", "12");
    textarea.setAttribute("data-geokit-draw-polygon", "");
    textarea.setAttribute("data-geokit-height", "480");
    document.body.appendChild(textarea);

    const [handle] = initDjangoGeokit();

    expect(handle).toBeTruthy();
    expect(handle!.element.tagName.toLowerCase()).toBe("leaflet-geokit");
    expect(handle!.element.getAttribute("zoom")).toBe("12");
    expect(handle!.element.hasAttribute("draw-polygon")).toBe(true);
    expect(handle!.element.style.height).toBe("480px");
    expect(textarea.style.display).toBe("none");
  });

  it("syncs GeoJSON back to the textarea on change events", async () => {
    const textarea = document.createElement("textarea");
    textarea.className = "geokit-editor-widget";
    document.body.appendChild(textarea);

    const [handle] = initDjangoGeokit();
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

    vi.spyOn(handle!.element, "getGeoJSON").mockResolvedValue(geoJSON);

    handle!.element.dispatchEvent(new CustomEvent("leaflet-draw:created"));
    await flushPromises();

    expect(textarea.value).toBe(JSON.stringify(geoJSON));
  });

  it("loads initial GeoJSON text after ready", async () => {
    const initial: FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    const textarea = document.createElement("textarea");
    textarea.className = "geokit-editor-widget";
    textarea.value = JSON.stringify(initial);
    document.body.appendChild(textarea);

    const [handle] = initDjangoGeokit();
    const loadSpy = vi
      .spyOn(handle!.element, "loadGeoJSONFromText")
      .mockResolvedValue();
    const getSpy = vi
      .spyOn(handle!.element, "getGeoJSON")
      .mockResolvedValue(initial);

    handle!.element.dispatchEvent(new CustomEvent("leaflet-draw:ready"));
    await flushPromises();

    expect(loadSpy).toHaveBeenCalledWith(JSON.stringify(initial));
    expect(getSpy).toHaveBeenCalled();
    expect(textarea.value).toBe(JSON.stringify(initial));
  });
});
