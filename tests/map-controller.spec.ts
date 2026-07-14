import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as L from "leaflet";
import { MapController } from "@src/lib/MapController";

// Mock Leaflet.draw if needed, though it should be available in happy-dom via imports
if (!(L.Control as any).Draw) {
  (L.Control as any).Draw = class MockDraw extends L.Control {
    initialize(options: any) {
      (this as any).options = options;
    }
    onAdd() {
      return document.createElement("div");
    }
  };
}

describe("MapController", () => {
  let container: HTMLDivElement;
  let opts: any;

  beforeEach(() => {
    container = document.createElement("div");
    // Leaflet needs the container to have some dimensions to not complain in some environments
    container.style.width = "400px";
    container.style.height = "400px";
    document.body.appendChild(container);

    opts = {
      container,
      map: {
        latitude: 0,
        longitude: 0,
        zoom: 2,
        tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      },
      controls: {
        polygon: true,
        polyline: true,
        rectangle: true,
        circle: true,
        cake: true,
        marker: true,
        move: true,
        edit: true,
        delete: true,
        ruler: true,
      },
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("initializes correctly with full controls", async () => {
    const controller = new MapController(opts);
    await controller.init();
    expect((controller as any).map).toBeDefined();

    // Check if draw control was added
    const drawControl = (controller as any).drawControl;
    expect(drawControl).toBeDefined();
    controller.destroy();
  });

  it("handles read-only mode", async () => {
    opts.readOnly = true;
    const controller = new MapController(opts);
    await controller.init();

    const options = (controller as any).buildDrawOptions(opts.controls, true);
    expect(options.draw).toBe(false);
    expect(options.edit).toBe(false);
    controller.destroy();
  });

  it("disables delete when requested", async () => {
    opts.controls.delete = false;
    const controller = new MapController(opts);
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.edit.remove).toBe(false);
    controller.destroy();
  });

  it("enables move tool draw options when requested", () => {
    const controller = new MapController(opts);
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.draw.move).toBeTruthy();
    expect(options.draw.move.featureGroup).toBe((controller as any).drawnItems);

    controller.destroy();
  });

  it("adds a configured marker icon to draw marker options", () => {
    const controller = new MapController({
      ...opts,
      markerIconConfig: {
        iconUrl: "https://example.com/custom-pin.svg",
        iconRetinaUrl: "https://example.com/custom-pin@2x.svg",
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -34],
      },
    });
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.draw.marker).toHaveProperty("icon");

    controller.destroy();
  });

  it("keeps visible layers synchronized when a feature is updated", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const [id] = await controller.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "bed-1",
          properties: { name: "Original bed" },
          geometry: {
            type: "Point",
            coordinates: [0, 0],
          },
        },
      ],
    });

    expect(id).toBe("bed-1");
    expect((controller as any).drawnItems.getLayers()).toHaveLength(1);

    await controller.updateFeature("bed-1", {
      type: "Feature",
      properties: { name: "Moved bed" },
      geometry: {
        type: "Point",
        coordinates: [1, 2],
      },
    });

    const layers = (controller as any).drawnItems.getLayers() as any[];
    expect(layers).toHaveLength(1);
    expect(layers[0]._fid).toBe("bed-1");
    expect(layers[0].getLatLng()).toMatchObject({ lat: 2, lng: 1 });

    const geoJSON = await controller.getGeoJSON();
    expect(geoJSON.features[0]).toMatchObject({
      id: "bed-1",
      properties: { name: "Moved bed" },
      geometry: { type: "Point", coordinates: [1, 2] },
    });

    controller.destroy();
  });

  it("derives stable child ids when ingesting a multi-geometry feature", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const ids = await controller.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "bed-1",
          properties: { name: "Bed cluster" },
          geometry: {
            type: "MultiPoint",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    });

    expect(ids).toEqual(["bed-1::0", "bed-1::1"]);

    const layers = (controller as any).drawnItems.getLayers() as any[];
    expect(layers).toHaveLength(2);
    expect(layers.map((layer) => layer._fid)).toEqual(ids);

    const geoJSON = await controller.getGeoJSON();
    expect(geoJSON.features).toHaveLength(2);
    expect(geoJSON.features.map((feature) => feature.id)).toEqual(ids);
    expect(
      geoJSON.features.map((feature) => (feature.properties as any)?.id),
    ).toEqual(ids);

    controller.destroy();
  });

  it("restores store-backed layers after destroy and re-init", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const ids = await controller.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "bed-1",
          properties: { name: "Bed 1" },
          geometry: {
            type: "Point",
            coordinates: [0, 0],
          },
        },
        {
          type: "Feature",
          id: "bed-2",
          properties: { name: "Bed 2" },
          geometry: {
            type: "Point",
            coordinates: [2, 3],
          },
        },
      ],
    });

    const before = await controller.getGeoJSON();
    expect((controller as any).drawnItems.getLayers()).toHaveLength(2);

    await controller.destroy();
    await controller.init();

    const after = await controller.getGeoJSON();
    const restoredLayers = (controller as any).drawnItems.getLayers() as any[];
    expect(after).toEqual(before);
    expect(restoredLayers).toHaveLength(2);
    expect(restoredLayers.map((layer) => layer._fid)).toEqual(ids);

    controller.destroy();
  });

  it("decorates toolbar buttons with stable tool hooks and custom icons", () => {
    container.innerHTML = `
      <a class="leaflet-draw-draw-polygon" title="Draw a polygon"></a>
      <a class="leaflet-draw-draw-cake" title="Draw Layer Cake">
        <span class="leaflet-geokit-cake-icon"></span>
      </a>
    `;

    const controller = new MapController({
      ...opts,
      toolButtonConfig: {
        polygon: {
          iconUrl: "https://example.com/bed-boundary.svg",
          iconSize: [20, 22],
          title: "Draw bed boundary",
          ariaLabel: "Draw bed boundary tool",
          className: "fs-map-tool fs-map-tool--primary",
        },
        layerCake: {
          iconUrl: "https://example.com/layer-cake.svg",
        },
      },
    });

    (controller as any).applyToolButtonCustomizations();

    const polygonButton = container.querySelector(
      ".leaflet-draw-draw-polygon",
    ) as HTMLElement;
    expect(polygonButton.dataset.geokitTool).toBe("polygon");
    expect(polygonButton.dataset.geokitCustomToolButton).toBe("true");
    expect(polygonButton.title).toBe("Draw bed boundary");
    expect(polygonButton.getAttribute("aria-label")).toBe(
      "Draw bed boundary tool",
    );
    expect(polygonButton.classList.contains("fs-map-tool")).toBe(true);
    expect(polygonButton.classList.contains("fs-map-tool--primary")).toBe(true);

    const icon = polygonButton.querySelector(
      ".leaflet-geokit-tool-button-icon img",
    ) as HTMLImageElement;
    expect(icon.src).toBe("https://example.com/bed-boundary.svg");
    expect(icon.parentElement?.style.width).toBe("20px");
    expect(icon.parentElement?.style.height).toBe("22px");

    const cakeBuiltInIcon = container.querySelector(
      ".leaflet-geokit-cake-icon",
    ) as HTMLElement;
    expect(cakeBuiltInIcon.hidden).toBe(true);

    controller.destroy();
  });

  it("clears managed toolbar button classes and icons when config is removed", () => {
    container.innerHTML =
      '<a class="leaflet-draw-draw-marker" title="Draw a marker"></a>';

    const controller = new MapController({
      ...opts,
      toolButtonConfig: {
        marker: {
          iconUrl: "https://example.com/marker.svg",
          title: "Place crop marker",
          className: "fs-map-tool",
        },
      },
    });

    (controller as any).applyToolButtonCustomizations();
    controller.setToolButtonConfig(null);

    const markerButton = container.querySelector(
      ".leaflet-draw-draw-marker",
    ) as HTMLElement;
    expect(markerButton.style.getPropertyValue("background-image")).toBe("");
    expect(markerButton.style.getPropertyValue("position")).toBe("");
    expect(markerButton.dataset.geokitTool).toBe("marker");
    expect(markerButton.dataset.geokitCustomToolButton).toBeUndefined();
    expect(markerButton.classList.contains("fs-map-tool")).toBe(false);
    expect(markerButton.querySelector(".leaflet-geokit-tool-button-icon")).toBe(
      null,
    );
    expect(markerButton.title).toBe("Draw a marker");

    controller.destroy();
  });

  it("emits public trigger events for default Leaflet toolbar buttons", () => {
    container.innerHTML =
      '<a class="leaflet-draw-draw-polygon" title="Draw a polygon"></a>';

    const onToolTrigger = vi.fn();
    const controller = new MapController({
      ...opts,
      callbacks: { onToolTrigger },
    });

    (controller as any).applyToolButtonCustomizations();

    const polygonButton = container.querySelector(
      ".leaflet-draw-draw-polygon",
    ) as HTMLElement;
    polygonButton.click();

    expect(onToolTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "leaflet-toolbar",
        handled: true,
      }),
    );

    controller.destroy();
  });

  it("renders independent toolbar groups with popovers and real draw activation", () => {
    const onToolTrigger = vi.fn();
    const onPopoverClose = vi.fn();
    const polygonEnable = vi.fn();
    const controller = new MapController({
      ...opts,
      callbacks: { onToolTrigger },
      toolButtonConfig: {
        polygon: {
          title: "Draw irrigation zone",
          ariaLabel: "Draw irrigation zone",
          iconHtml:
            '<svg viewBox="0 0 20 20" role="img"><path d="M3 15h14L10 4z"/></svg>',
          popover: {
            title: "Irrigation boundary",
            body: "Draw the wetted zone, then close on the first point.",
            onClose: onPopoverClose,
          },
        },
        layerStyle: {
          title: "Zone style",
        },
      },
      toolbarGroups: [
        {
          id: "irrigation-draw",
          position: "bottomright",
          tools: ["polygon"],
          ariaLabel: "Irrigation drawing tools",
        },
        {
          id: "irrigation-style",
          position: "topright",
          tools: ["layerStyle"],
          ariaLabel: "Irrigation style tools",
        },
      ],
    });
    (controller as any).drawControl = {
      _toolbars: {
        draw: {
          _modes: {
            polygon: {
              handler: {
                enable: polygonEnable,
              },
            },
          },
        },
      },
    };

    (controller as any).applyToolButtonCustomizations();

    const drawGroup = container.querySelector(
      '[data-geokit-toolbar-group="irrigation-draw"]',
    ) as HTMLElement;
    const styleGroup = container.querySelector(
      '[data-geokit-toolbar-group="irrigation-style"]',
    ) as HTMLElement;
    expect(drawGroup).toBeInstanceOf(HTMLElement);
    expect(styleGroup).toBeInstanceOf(HTMLElement);
    expect(drawGroup).not.toBe(styleGroup);

    const polygonButton = drawGroup.querySelector(
      '[data-geokit-tool="polygon"]',
    ) as HTMLButtonElement;
    polygonButton.click();

    expect(polygonEnable).toHaveBeenCalledTimes(1);
    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "toolbar",
        groupId: "irrigation-draw",
        handled: true,
      }),
    );
    expect(
      container.querySelector('[data-geokit-tool-popover="true"]')?.textContent,
    ).toContain("Draw the wetted zone");
    expect(polygonButton.getAttribute("aria-expanded")).toBe("true");

    const layerStyleButton = styleGroup.querySelector(
      '[data-geokit-tool="layer-style"]',
    ) as HTMLButtonElement;
    layerStyleButton.click();
    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "layerStyle",
        source: "toolbar",
        groupId: "irrigation-style",
        handled: true,
      }),
    );
    expect(
      container.querySelector('[data-geokit-tool-popover="true"]'),
    ).toBeNull();
    expect(polygonButton.getAttribute("aria-expanded")).toBeNull();
    expect(onPopoverClose).toHaveBeenCalledTimes(1);

    polygonButton.click();
    expect(polygonEnable).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(
      container.querySelector('[data-geokit-tool-popover="true"]'),
    ).toBeNull();
    expect(polygonButton.getAttribute("aria-expanded")).toBeNull();
    expect(onPopoverClose).toHaveBeenCalledTimes(2);

    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "toolbar",
        groupId: "irrigation-draw",
        handled: true,
      }),
    );

    controller.destroy();
  });

  it("keeps duplicate tool buttons independent across toolbar placements", () => {
    const onToolTrigger = vi.fn();
    const polygonEnable = vi.fn();
    const controller = new MapController({
      ...opts,
      callbacks: { onToolTrigger },
      toolButtonConfig: {
        polygon: {
          title: "Draw irrigation zone",
          popover: {
            title: "Irrigation boundary",
            body: "Trace the active irrigation placement.",
          },
        },
      },
      toolbarGroups: [
        {
          id: "irrigation-primary",
          position: "bottomright",
          tools: ["polygon"],
        },
        {
          id: "irrigation-secondary",
          position: "topleft",
          tools: ["polygon"],
        },
      ],
    });
    (controller as any).drawControl = {
      _toolbars: {
        draw: {
          _modes: {
            polygon: {
              handler: {
                enable: polygonEnable,
              },
            },
          },
        },
      },
    };

    (controller as any).applyToolButtonCustomizations();

    const primaryGroup = container.querySelector(
      '[data-geokit-toolbar-group="irrigation-primary"]',
    ) as HTMLElement;
    const secondaryGroup = container.querySelector(
      '[data-geokit-toolbar-group="irrigation-secondary"]',
    ) as HTMLElement;
    const primaryButton = primaryGroup.querySelector(
      '[data-geokit-tool="polygon"]',
    ) as HTMLButtonElement;
    const secondaryButton = secondaryGroup.querySelector(
      '[data-geokit-tool="polygon"]',
    ) as HTMLButtonElement;

    expect(primaryButton.dataset.geokitToolbarPosition).toBe("bottomright");
    expect(secondaryButton.dataset.geokitToolbarPosition).toBe("topleft");
    expect(primaryButton.dataset.geokitToolInstance).not.toBe(
      secondaryButton.dataset.geokitToolInstance,
    );

    primaryButton.click();

    expect(polygonEnable).toHaveBeenCalledTimes(1);
    expect(primaryButton.getAttribute("aria-expanded")).toBe("true");
    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "toolbar",
        groupId: "irrigation-primary",
        handled: true,
      }),
    );
    expect(
      container.querySelector<HTMLElement>('[data-geokit-tool-popover="true"]')
        ?.dataset.geokitToolbarGroup,
    ).toBe("irrigation-primary");

    secondaryButton.click();

    expect(polygonEnable).toHaveBeenCalledTimes(2);
    expect(primaryButton.getAttribute("aria-expanded")).toBeNull();
    expect(secondaryButton.getAttribute("aria-expanded")).toBe("true");
    expect(
      container.querySelectorAll('[data-geokit-tool-popover="true"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector<HTMLElement>('[data-geokit-tool-popover="true"]')
        ?.dataset.geokitToolbarGroup,
    ).toBe("irrigation-secondary");
    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "toolbar",
        groupId: "irrigation-secondary",
        handled: true,
      }),
    );

    controller.destroy();
  });

  it("reports failed external triggers when a requested tool is unavailable", () => {
    const onToolTrigger = vi.fn();
    const controller = new MapController({
      ...opts,
      callbacks: { onToolTrigger },
    });

    const handled = controller.triggerTool("polygon", {
      source: "api",
    });

    expect(handled).toBe(false);
    expect(onToolTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "api",
        handled: false,
        error: expect.stringContaining("not available"),
      }),
    );

    controller.destroy();
  });

  it("activates and deactivates draw handlers through the public controller API", () => {
    const onToolTrigger = vi.fn();
    const polygonEnable = vi.fn();
    const polygonDisable = vi.fn();
    const editDisable = vi.fn();
    const controller = new MapController({
      ...opts,
      callbacks: { onToolTrigger },
    });
    (controller as any).drawControl = {
      _toolbars: {
        draw: {
          _modes: {
            polygon: {
              handler: {
                enable: polygonEnable,
                disable: polygonDisable,
              },
            },
          },
        },
        edit: {
          _modes: {
            edit: {
              handler: {
                disable: editDisable,
              },
            },
          },
        },
      },
    };

    expect(
      controller.activateTool("polygon", {
        source: "api",
        groupId: "external-panel",
      }),
    ).toBe(true);
    expect(polygonEnable).toHaveBeenCalledTimes(1);
    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "polygon",
        source: "api",
        groupId: "external-panel",
        handled: true,
      }),
    );

    expect(
      controller.deactivateTool({
        source: "api",
        groupId: "external-panel",
      }),
    ).toBe(true);
    expect(polygonDisable).toHaveBeenCalledTimes(1);
    expect(editDisable).toHaveBeenCalledTimes(1);
    expect(onToolTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tool: "select",
        source: "api",
        groupId: "external-panel",
        handled: true,
      }),
    );

    controller.destroy();
  });

  it("disables move tool draw options when not requested", () => {
    opts.controls.move = false;
    const controller = new MapController(opts);
    const options = (controller as any).buildDrawOptions(opts.controls, false);

    expect(options.draw.move).toBe(false);

    controller.destroy();
  });

  it("clears layers via store", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const storeSpy = vi.spyOn((controller as any).store, "clear");
    controller.clearLayers();
    expect(storeSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("adds features to store", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const storeSpy = vi.spyOn((controller as any).store, "add");
    controller.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: {},
        },
      ],
    });
    expect(storeSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("renders loaded points and expanded multipoints through the same custom icon factory", async () => {
    const controller = new MapController({
      ...opts,
      markerIconConfig: {
        iconUrl: "https://example.com/custom-pin.svg",
        iconRetinaUrl: "https://example.com/custom-pin@2x.svg",
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -34],
      },
    });
    await controller.init();
    await controller.loadGeoJSON({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: {},
        },
        {
          type: "Feature",
          geometry: {
            type: "MultiPoint",
            coordinates: [
              [1, 1],
              [2, 2],
            ],
          },
          properties: {},
        },
      ],
    });

    const pointLayers = (
      (controller as any).drawnItems.getLayers() as any[]
    ).filter((layer) => typeof layer?.getLatLng === "function");
    expect(pointLayers).toHaveLength(3);
    const firstIcon = (pointLayers[0] as any).options.icon;
    expect(firstIcon).toBeTruthy();
    pointLayers.forEach((layer) => {
      expect((layer as any).options.icon).toBe(firstIcon);
    });

    controller.destroy();
  });

  it("sets view on map", async () => {
    const controller = new MapController(opts);
    await controller.init();

    const mapSpy = vi.spyOn((controller as any).map, "setView");
    controller.setView(10, 20, 5);
    expect(mapSpy).toHaveBeenCalledWith(expect.anything(), 5);
    controller.destroy();
  });

  it("fits bounds to data", async () => {
    const controller = new MapController(opts);
    await controller.init();

    vi.spyOn((controller as any).store, "bounds").mockReturnValue([
      [0, 0],
      [1, 1],
    ]);
    const mapSpy = vi.spyOn((controller as any).map, "fitBounds");

    controller.fitBoundsToData(0.1);
    expect(mapSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("falls back to bundled Leaflet when external mode is requested but Draw is missing", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => logger),
      setLevel: vi.fn(),
    } as any;

    const originalGlobalL = (globalThis as any).L;
    (globalThis as any).L = {
      map: vi.fn(),
      Control: {},
      draw: undefined,
    };

    const controller = new MapController({
      ...opts,
      logger,
      useExternalLeaflet: true,
      leaflet: {
        map: vi.fn(),
        Control: {},
        draw: undefined,
      } as any,
    });

    try {
      expect((controller as any).L).toBe(L);
      expect(logger.warn).toHaveBeenCalledWith(
        "leaflet-runtime:external-fallback-bundled",
        expect.objectContaining({
          message: expect.stringContaining("falling back to bundled"),
        }),
      );
    } finally {
      (globalThis as any).L = originalGlobalL;
      controller.destroy();
    }
  });

  it("uses the injected external Leaflet namespace to create marker icons", () => {
    const iconSpy = vi.fn((options: any) => L.icon(options));
    const externalLeaflet = Object.assign({}, L as any, {
      icon: iconSpy,
      Control: L.Control,
      draw: {},
    });

    const controller = new MapController({
      ...opts,
      useExternalLeaflet: true,
      leaflet: externalLeaflet,
    });

    expect((controller as any).L).toBe(externalLeaflet);
    controller.setMarkerIconConfig({
      iconUrl: "https://example.com/external-pin.svg",
      iconRetinaUrl: "https://example.com/external-pin@2x.svg",
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -34],
    });
    expect(iconSpy).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("emits integrated tool events to hooks and emitter", () => {
    const hook = vi.fn();
    const emit = vi.fn();
    const controller = new MapController({
      ...opts,
      toolHooks: { "tool:move:pending": hook },
      toolEventEmitter: { emit },
    });

    (controller as any).emitToolEvent("tool:move:pending", { fid: "abc" });

    expect(hook).toHaveBeenCalledWith({ fid: "abc" });
    expect(emit).toHaveBeenCalledWith("tool:move:pending", { fid: "abc" });
    controller.destroy();
  });

  it("emits integrated tool events through dispatchEvent emitter", () => {
    const dispatchEvent = vi.fn();
    const controller = new MapController({
      ...opts,
      toolEventEmitter: { dispatchEvent },
    });

    (controller as any).emitToolEvent("tool:move:confirmed", { fid: "xyz" });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const evt = dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(evt.type).toBe("tool:move:confirmed");
    expect(evt.detail).toEqual({ fid: "xyz" });
    controller.destroy();
  });

  it("updates tool observers at runtime", () => {
    const hookA = vi.fn();
    const hookB = vi.fn();
    const emitA = vi.fn();
    const emitB = vi.fn();

    const controller = new MapController({
      ...opts,
      toolHooks: { "tool:move:pending": hookA },
      toolEventEmitter: { emit: emitA },
    });

    (controller as any).emitToolEvent("tool:move:pending", { seq: 1 });
    expect(hookA).toHaveBeenCalledWith({ seq: 1 });
    expect(emitA).toHaveBeenCalledWith("tool:move:pending", { seq: 1 });

    controller.setToolObservers({
      toolHooks: { "tool:move:pending": hookB },
      toolEventEmitter: { emit: emitB },
    });

    (controller as any).emitToolEvent("tool:move:pending", { seq: 2 });
    expect(hookA).toHaveBeenCalledTimes(1);
    expect(emitA).toHaveBeenCalledTimes(1);
    expect(hookB).toHaveBeenCalledWith({ seq: 2 });
    expect(emitB).toHaveBeenCalledWith("tool:move:pending", { seq: 2 });

    controller.destroy();
  });

  it("emits ruler units changed tool event", () => {
    const emit = vi.fn();
    const controller = new MapController({
      ...opts,
      toolEventEmitter: { emit },
    });

    controller.setRulerUnits("imperial");

    expect(emit).toHaveBeenCalledWith("tool:ruler:units-changed", {
      previous: "metric",
      current: "imperial",
    });
    controller.destroy();
  });

  describe("mergeVisiblePolygons", () => {
    it("returns null when no polygons exist", async () => {
      const controller = new MapController(opts);
      await controller.init();

      // Mock getGeoJSON to return no features
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [],
      });

      const result = await controller.mergeVisiblePolygons();
      expect(result).toBeNull();
      controller.destroy();
    });

    it("returns existing ID when only one polygon exists", async () => {
      const controller = new MapController(opts);
      await controller.init();

      const polygonFeature = {
        type: "Feature" as const,
        id: "test-polygon-id",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {},
      };

      // Mock getGeoJSON to return one polygon
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [polygonFeature],
      });

      const result = await controller.mergeVisiblePolygons();
      expect(result).toBe("test-polygon-id");
      controller.destroy();
    });

    it("merges multiple polygons", async () => {
      const controller = new MapController(opts);
      await controller.init();

      const polygon1 = {
        type: "Feature" as const,
        id: "poly1",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: { name: "first" },
      };

      const polygon2 = {
        type: "Feature" as const,
        id: "poly2",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        },
        properties: { name: "second" },
      };

      // Mock getGeoJSON to return multiple polygons
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [polygon1, polygon2],
      });

      // Mock removeFeature and addFeatures
      const removeSpy = vi
        .spyOn(controller, "removeFeature")
        .mockResolvedValue();
      const addSpy = vi
        .spyOn(controller, "addFeatures")
        .mockResolvedValue(["merged-id"]);

      const result = await controller.mergeVisiblePolygons({
        properties: { merged: true },
      });

      expect(result).toBe("merged-id");
      expect(removeSpy).toHaveBeenCalledWith("poly1");
      expect(removeSpy).toHaveBeenCalledWith("poly2");
      expect(addSpy).toHaveBeenCalled();
      controller.destroy();
    });

    it("handles merge failure gracefully", async () => {
      const controller = new MapController(opts);
      await controller.init();

      const polygon1 = {
        type: "Feature" as const,
        id: "poly1",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {},
      };

      const polygon2 = {
        type: "Feature" as const,
        id: "poly2",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        },
        properties: {},
      };

      // Mock getGeoJSON to return polygons
      vi.spyOn(controller, "getGeoJSON").mockResolvedValue({
        type: "FeatureCollection",
        features: [polygon1, polygon2],
      });

      // Mock the geojson utilities directly on the imported module
      const geojsonModule = await import("@src/utils/geojson");
      const mergePolygonsSpy = vi
        .spyOn(geojsonModule, "mergePolygons")
        .mockReturnValue(null);
      const isPolygonSpy = vi
        .spyOn(geojsonModule, "isPolygon")
        .mockReturnValue(true);
      const isMultiPolygonSpy = vi
        .spyOn(geojsonModule, "isMultiPolygon")
        .mockReturnValue(false);

      const result = await controller.mergeVisiblePolygons();
      expect(result).toBeNull();

      // Verify the mocked functions were called
      expect(isPolygonSpy).toHaveBeenCalled();
      expect(mergePolygonsSpy).toHaveBeenCalled();

      // Restore the spies
      mergePolygonsSpy.mockRestore();
      isPolygonSpy.mockRestore();
      isMultiPolygonSpy.mockRestore();

      controller.destroy();
    });
  });

  describe("setRulerUnits", () => {
    it("updates measurement system", async () => {
      const controller = new MapController(opts);
      await controller.init();

      // Mock the internal methods that setRulerUnits calls
      const syncSpy = vi
        .spyOn(controller as any, "syncMeasurementModalState")
        .mockImplementation(() => {});
      const rebuildSpy = vi
        .spyOn(controller as any, "rebuildRulerControl")
        .mockImplementation(() => {});

      controller.setRulerUnits("imperial");

      expect((controller as any).measurementSystem).toBe("imperial");
      expect(syncSpy).toHaveBeenCalled();
      expect(rebuildSpy).toHaveBeenCalled();
      controller.destroy();
    });

    it("does nothing when system is already set", async () => {
      const controller = new MapController(opts);
      await controller.init();

      // Set initial system
      (controller as any).measurementSystem = "imperial";

      const syncSpy = vi
        .spyOn(controller as any, "syncMeasurementModalState")
        .mockImplementation(() => {});
      const rebuildSpy = vi
        .spyOn(controller as any, "rebuildRulerControl")
        .mockImplementation(() => {});

      // Try to set the same system
      controller.setRulerUnits("imperial");

      expect(syncSpy).not.toHaveBeenCalled();
      expect(rebuildSpy).not.toHaveBeenCalled();
      controller.destroy();
    });
  });
});
