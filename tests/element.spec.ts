import { describe, it, expect, beforeAll, vi } from "vitest";

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

  it("reflects external Leaflet-related properties", () => {
    el.useExternalLeaflet = true;
    expect(el.useExternalLeaflet).toBe(true);
    expect(el.hasAttribute("use-external-leaflet")).toBe(true);

    el.skipLeafletStyles = true;
    expect(el.skipLeafletStyles).toBe(true);
    expect(el.hasAttribute("skip-leaflet-styles")).toBe(true);

    const fakeLeaflet = { marker: () => null } as any;
    el.leafletInstance = fakeLeaflet;
    expect(el.leafletInstance).toBe(fakeLeaflet);

    const hooks = { "tool:move:pending": () => {} } as any;
    const emitter = { emit: () => {} } as any;
    el.toolHooks = hooks;
    el.toolEventEmitter = emitter;
    expect(el.toolHooks).toBe(hooks);
    expect(el.toolEventEmitter).toBe(emitter);
  });

  it("observes marker icon customization attributes", () => {
    const ctor: any = customElements.get(TAG);
    expect(ctor.observedAttributes).toContain("marker-icon-url");
    expect(ctor.observedAttributes).toContain("marker-icon-size");
    expect(ctor.observedAttributes).toContain("marker-popup-anchor");
  });

  it("observes tool button customization attributes", () => {
    const ctor: any = customElements.get(TAG);
    expect(ctor.observedAttributes).toContain("tool-button-config");
    expect(ctor.observedAttributes).toContain("toolbar-groups");
  });

  it("prioritizes markerIconConfig over attributes and can return to attributes", () => {
    const localEl: any = document.createElement(TAG);
    const setMarkerIconConfig = vi.fn();
    localEl._controller = { setMarkerIconConfig };

    localEl.setAttribute("marker-icon-url", "https://example.com/attr-pin.svg");
    expect(setMarkerIconConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconUrl: "https://example.com/attr-pin.svg",
      }),
    );

    localEl.markerIconConfig = {
      iconUrl: "https://example.com/property-pin.svg",
      iconSize: [32, 40],
      iconAnchor: [16, 40],
    };
    expect(setMarkerIconConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconUrl: "https://example.com/property-pin.svg",
        iconSize: [32, 40],
        iconAnchor: [16, 40],
      }),
    );

    localEl.markerIconConfig = null;
    expect(setMarkerIconConfig).toHaveBeenLastCalledWith(null);

    localEl.markerIconConfig = undefined;
    expect(setMarkerIconConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconUrl: "https://example.com/attr-pin.svg",
      }),
    );
  });

  it("emits a non-fatal error and falls back to default markers for invalid marker-icon-url", () => {
    const localEl: any = document.createElement(TAG);
    const setMarkerIconConfig = vi.fn();
    const errorSpy = vi.fn();
    localEl._controller = { setMarkerIconConfig };
    localEl.addEventListener("leaflet-draw:error", errorSpy);

    localEl.setAttribute("marker-icon-url", "http://[");

    expect(setMarkerIconConfig).toHaveBeenLastCalledWith(null);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0].detail.message).toContain(
      "marker-icon-url",
    );
  });

  it("keeps marker icon customization active when skipLeafletStyles is true", () => {
    const localEl: any = document.createElement(TAG);
    const setMarkerIconConfig = vi.fn();
    localEl._controller = {
      setMarkerIconConfig,
      destroy: vi.fn(() => Promise.resolve()),
      init: vi.fn(() => Promise.resolve()),
    };
    localEl.skipLeafletStyles = true;

    localEl.setAttribute("marker-icon-url", "https://example.com/host-pin.svg");

    expect(setMarkerIconConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconUrl: "https://example.com/host-pin.svg",
      }),
    );
  });

  it("syncs tool button config from attributes and property overrides", () => {
    const localEl: any = document.createElement(TAG);
    const setToolButtonConfig = vi.fn();
    localEl._controller = { setToolButtonConfig };

    localEl.setAttribute(
      "tool-button-config",
      JSON.stringify({
        polygon: {
          iconUrl: "https://example.com/polygon.svg",
          title: "Draw bed boundary",
        },
      }),
    );
    expect(setToolButtonConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        polygon: expect.objectContaining({
          iconUrl: "https://example.com/polygon.svg",
          title: "Draw bed boundary",
        }),
      }),
    );

    localEl.toolButtonConfig = {
      marker: {
        iconUrl: "https://example.com/marker.svg",
        ariaLabel: "Place field marker",
      },
    };
    expect(setToolButtonConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        marker: expect.objectContaining({
          iconUrl: "https://example.com/marker.svg",
          ariaLabel: "Place field marker",
        }),
      }),
    );

    localEl.toolButtonConfig = null;
    expect(setToolButtonConfig).toHaveBeenLastCalledWith(null);

    localEl.toolButtonConfig = undefined;
    expect(setToolButtonConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        polygon: expect.objectContaining({
          iconUrl: "https://example.com/polygon.svg",
        }),
      }),
    );
  });

  it("syncs toolbar groups from attributes and property overrides", () => {
    const localEl: any = document.createElement(TAG);
    const setToolbarGroups = vi.fn();
    localEl._controller = { setToolbarGroups };

    localEl.setAttribute(
      "toolbar-groups",
      JSON.stringify([
        {
          id: "irrigation-draw",
          position: "bottomright",
          tools: ["polygon", "select"],
        },
      ]),
    );
    expect(setToolbarGroups).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "irrigation-draw",
        position: "bottomright",
        tools: ["polygon", "select"],
      }),
    ]);

    localEl.toolbarGroups = [
      {
        id: "irrigation-style",
        position: "topright",
        tools: ["layerStyle"],
      },
    ];
    expect(setToolbarGroups).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "irrigation-style",
        tools: ["layerStyle"],
      }),
    ]);

    localEl.toolbarGroups = null;
    expect(setToolbarGroups).toHaveBeenLastCalledWith(null);

    localEl.toolbarGroups = undefined;
    expect(setToolbarGroups).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "irrigation-draw",
      }),
    ]);
  });

  it("emits a non-fatal error and clears toolbar groups for invalid JSON attributes", () => {
    const localEl: any = document.createElement(TAG);
    const setToolbarGroups = vi.fn();
    const errorSpy = vi.fn();
    localEl._controller = { setToolbarGroups };
    localEl.addEventListener("leaflet-draw:error", errorSpy);

    localEl.setAttribute("toolbar-groups", "{not-json");

    expect(setToolbarGroups).toHaveBeenLastCalledWith(null);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0].detail.message).toContain(
      "toolbar-groups",
    );
  });

  it("exposes activateTool through public request/result events", async () => {
    const localEl: any = document.createElement(TAG);
    const activateTool = vi.fn((tool, options) => {
      localEl._emitToolTriggerResult({
        tool,
        source: options.source,
        groupId: options.groupId,
        handled: true,
        timestamp: 123,
      });
      return true;
    });
    localEl._controller = { activateTool };

    const requested = vi.fn();
    const triggered = vi.fn();
    localEl.addEventListener(
      "leaflet-geokit:tool-trigger-requested",
      requested,
    );
    localEl.addEventListener("leaflet-geokit:tool-triggered", triggered);

    const handled = await localEl.activateTool("polygon", {
      source: "api",
      groupId: "external-irrigation-button",
    });

    expect(handled).toBe(true);
    expect(activateTool).toHaveBeenCalledWith("polygon", {
      source: "api",
      groupId: "external-irrigation-button",
    });
    expect(requested).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          tool: "polygon",
          source: "api",
          groupId: "external-irrigation-button",
          handled: false,
        }),
      }),
    );
    expect(triggered).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          tool: "polygon",
          source: "api",
          groupId: "external-irrigation-button",
          handled: true,
        }),
      }),
    );
  });

  it("keeps triggerTool as an alias and exposes deactivateTool", async () => {
    const localEl: any = document.createElement(TAG);
    const activateTool = vi.fn((tool, options) => {
      localEl._emitToolTriggerResult({
        tool,
        source: options.source,
        groupId: options.groupId,
        handled: true,
        timestamp: 123,
      });
      return true;
    });
    const deactivateTool = vi.fn((options) => {
      localEl._emitToolTriggerResult({
        tool: "select",
        source: options.source,
        groupId: options.groupId,
        handled: true,
        timestamp: 124,
      });
      return true;
    });
    localEl._controller = { activateTool, deactivateTool };

    const handled = await localEl.triggerTool("polygon", {
      source: "api",
      groupId: "alias-panel",
    });
    expect(handled).toBe(true);
    expect(activateTool).toHaveBeenCalledWith("polygon", {
      source: "api",
      groupId: "alias-panel",
    });

    const deactivated = await localEl.deactivateTool({
      source: "api",
      groupId: "alias-panel",
    });
    expect(deactivated).toBe(true);
    expect(deactivateTool).toHaveBeenCalledWith({
      source: "api",
      groupId: "alias-panel",
    });
  });

  it("emits a non-fatal error and clears tool button config for invalid JSON attributes", () => {
    const localEl: any = document.createElement(TAG);
    const setToolButtonConfig = vi.fn();
    const errorSpy = vi.fn();
    localEl._controller = { setToolButtonConfig };
    localEl.addEventListener("leaflet-draw:error", errorSpy);

    localEl.setAttribute("tool-button-config", "{not-json");

    expect(setToolButtonConfig).toHaveBeenLastCalledWith(null);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0].detail.message).toContain(
      "tool-button-config",
    );
  });

  it("updates active controller tool observers when hook props change", () => {
    const originalController = el._controller;
    const setToolObservers = vi.fn();
    el._controller = { setToolObservers };

    const hooks = { "tool:move:pending": vi.fn() } as any;
    const emitter = { emit: vi.fn() } as any;

    el.toolEventEmitter = undefined;
    el.toolHooks = hooks;
    expect(setToolObservers).toHaveBeenLastCalledWith({
      toolHooks: hooks,
      toolEventEmitter: undefined,
    });

    el.toolEventEmitter = emitter;
    expect(setToolObservers).toHaveBeenLastCalledWith({
      toolHooks: hooks,
      toolEventEmitter: emitter,
    });

    el.toolHooks = undefined;
    expect(setToolObservers).toHaveBeenLastCalledWith({
      toolHooks: undefined,
      toolEventEmitter: emitter,
    });

    el._controller = originalController;
  });

  it("exposes themeCss getter and normalizes non-string values", () => {
    el.themeCss = ".leaflet-container { color: blue; }";
    expect(el.themeCss).toContain("color: blue");

    (el as any).themeCss = 42;
    expect(el.themeCss).toBe("");
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
