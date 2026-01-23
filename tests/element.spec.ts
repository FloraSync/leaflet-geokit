import { describe, it, expect, beforeAll } from "vitest";

// Importing our custom element will register it with customElements
import "@src/index";

const TAG = "leaflet-geokit";

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

  it("observes the layer-cake draw attribute", () => {
    const ctor: any = customElements.get(TAG);
    expect(ctor.observedAttributes).toContain("draw-layer-cake");
    const el: any = document.createElement(TAG);
    el.setAttribute("draw-layer-cake", "");
    expect(el._controlsFromAttributes().cake).toBe(true);
  });

  it("reflects basic attributes to properties", () => {
    el.setAttribute("latitude", "51.5");
    el.setAttribute("longitude", "-0.12");
    el.setAttribute("zoom", "10");
    expect(el.latitude).toBe(51.5);
    expect(el.longitude).toBe(-0.12);
    expect(el.zoom).toBe(10);
  });

  it("applies theme url and theme css inside Shadow DOM", () => {
    el.setAttribute("theme-url", "https://example.com/theme.css");
    const themeLink = el.shadowRoot?.querySelector(
      "link[data-geokit-theme-url]",
    ) as HTMLLinkElement | null;
    expect(themeLink?.getAttribute("href")).toBe(
      "https://example.com/theme.css",
    );

    el.themeCss = ".leaflet-container { background: red; }";
    const themeStyle = el.shadowRoot?.querySelector(
      "style[data-geokit-theme-css]",
    ) as HTMLStyleElement | null;
    expect(themeStyle?.textContent).toContain("background: red");

    el.setAttribute("theme-url", "https://example.com/next.css");
    expect(themeLink?.getAttribute("href")).toBe(
      "https://example.com/next.css",
    );

    el.removeAttribute("theme-url");
    const themeLinkAfter = el.shadowRoot?.querySelector(
      "link[data-geokit-theme-url]",
    );
    expect(themeLinkAfter).toBeNull();

    el.themeCss = "";
    const themeStyleAfter = el.shadowRoot?.querySelector(
      "style[data-geokit-theme-css]",
    );
    expect(themeStyleAfter).toBeNull();
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

  it("handles loadGeoJSONFromText with invalid JSON", async () => {
    let errorEvent: CustomEvent | null = null;
    el.addEventListener("leaflet-draw:error", (e: CustomEvent) => {
      errorEvent = e;
    });

    // This should trigger the JSON parse error and line 546 (throw err)
    await expect(el.loadGeoJSONFromText("invalid json")).rejects.toThrow(
      "Failed to parse GeoJSON text",
    );
    expect(errorEvent).not.toBeNull();
    expect(errorEvent!.detail.message).toBe("Failed to parse GeoJSON text");
  });

  it("handles loadGeoJSONFromText with valid JSON", async () => {
    let ingestEvent: CustomEvent | null = null;
    el.addEventListener("leaflet-draw:ingest", (e: CustomEvent) => {
      ingestEvent = e;
    });

    const validGeoJSON = { type: "FeatureCollection", features: [] };

    // This should trigger line 550 (const finalFc = ...)
    await el.loadGeoJSONFromText(JSON.stringify(validGeoJSON));
    expect(ingestEvent).not.toBeNull();
    expect(ingestEvent!.detail.fc).toEqual(validGeoJSON);
    expect(ingestEvent!.detail.mode).toBe("load");
  });

  it("tests _reflect method with null value", () => {
    // Set an attribute first
    el.setAttribute("test-attr", "value");
    expect(el.getAttribute("test-attr")).toBe("value");

    // This should trigger line 609 (this.removeAttribute(name))
    el._reflect("test-attr", null);
    expect(el.hasAttribute("test-attr")).toBe(false);
  });

  it("tests _booleanReflect method branches", () => {
    // Test setting attribute when present=true and attribute doesn't exist
    // This should trigger line 619 (if (!this.hasAttribute(name)) this.setAttribute(name, ""))
    expect(el.hasAttribute("test-bool")).toBe(false);
    el._booleanReflect("test-bool", true);
    expect(el.hasAttribute("test-bool")).toBe(true);

    // Test removing attribute when present=false and attribute exists
    // This should trigger line 621 (if (this.hasAttribute(name)) this.removeAttribute(name))
    el._booleanReflect("test-bool", false);
    expect(el.hasAttribute("test-bool")).toBe(false);

    // Test no-op cases for coverage completeness
    el._booleanReflect("test-bool", true); // Set it again
    el._booleanReflect("test-bool", true); // No-op: already set
    el._booleanReflect("test-bool2", false); // No-op: doesn't exist
  });

  it("tests property setters that call reflection methods", () => {
    // Test minZoom setter with null (should trigger removeAttribute path)
    el.minZoom = undefined;
    expect(el.hasAttribute("min-zoom")).toBe(false);

    // Test maxZoom setter with null (should trigger removeAttribute path)
    el.maxZoom = undefined;
    expect(el.hasAttribute("max-zoom")).toBe(false);

    // Test tileAttribution setter with null
    el.tileAttribution = undefined;
    expect(el.hasAttribute("tile-attribution")).toBe(false);
  });
});
