import { describe, it, expect, beforeAll } from "vitest";

// Importing our custom element will register it with customElements
import "@src/index";

const TAG = "leaflet-draw-map";

describe("LeafletDrawMapElement (scaffold)", () => {
  let el: any;

  beforeAll(() => {
    el = document.createElement(TAG) as any;
    document.body.appendChild(el);
  });

  it("is defined as a custom element", () => {
    const ctor = customElements.get(TAG);
    expect(ctor).toBeInstanceOf(Function);
  });

  it("reflects basic attributes to properties", () => {
    el.setAttribute("latitude", "51.5");
    el.setAttribute("longitude", "-0.12");
    el.setAttribute("zoom", "10");
    expect(el.latitude).toBe(51.5);
    expect(el.longitude).toBe(-0.12);
    expect(el.zoom).toBe(10);
  });

  it("boolean attributes toggle correctly", () => {
    el.setAttribute("read-only", "");
    expect(el.readOnly).toBe(true);
    el.removeAttribute("read-only");
    expect(el.readOnly).toBe(false);

    el.setAttribute("dev-overlay", "");
    expect(el.devOverlay).toBe(true);
  });

  it("exposes minimal public API methods", async () => {
    const fc = await el.getGeoJSON();
    expect(fc).toEqual({ type: "FeatureCollection", features: [] });

    await el.clearLayers();
    await el.loadGeoJSON({ type: "FeatureCollection", features: [] });
    await el.addFeatures({ type: "FeatureCollection", features: [] });
    await el.updateFeature("id", {
      type: "Feature",
      properties: {},
      geometry: null,
    });
    await el.removeFeature("id");
    await el.fitBoundsToData(0.1);
    await el.setView(1, 2, 3);
  });
});
