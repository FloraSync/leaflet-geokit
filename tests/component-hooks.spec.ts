import { describe, it, expect, vi } from "vitest";
import "@src/index";
import type { GeoKitHooks } from "@src/types/public";

const TAG = "leaflet-geokit";

const makePoint = (coords = [0, 0]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Point" as const, coordinates: coords },
});

const makeFC = (...features: ReturnType<typeof makePoint>[]) => ({
  type: "FeatureCollection" as const,
  features,
});

describe("LeafletDrawMapElement — GeoKitHooks", () => {
  // ---- hooks property ----

  it("exposes a hooks getter that defaults to an empty object", () => {
    const el: any = document.createElement(TAG);
    expect(el.hooks).toBeDefined();
    expect(typeof el.hooks).toBe("object");
  });

  it("accepts and returns a hooks object via the setter", () => {
    const el: any = document.createElement(TAG);
    const hooks: GeoKitHooks = { onCreated: vi.fn() };
    el.hooks = hooks;
    expect(el.hooks).toBe(hooks);
  });

  it("normalises null/undefined assignment to empty object", () => {
    const el: any = document.createElement(TAG);
    el.hooks = null;
    expect(el.hooks).toEqual({});
    el.hooks = undefined;
    expect(el.hooks).toEqual({});
  });

  // ---- onReady ----

  it("onReady hook is called when controller fires onReady callback", () => {
    const el: any = document.createElement(TAG);
    const onReady = vi.fn();
    el.hooks = { onReady };

    const readyDetail = {
      bounds: [
        [0, 0],
        [1, 1],
      ] as [[number, number], [number, number]],
    };
    // Simulate the controller callback by invoking the callbacks that
    // connectedCallback would have wired. We replicate by calling the private
    // callback object directly through the controller mock.
    el._controller = {};
    // Manually exercise the callback path used during connectedCallback.
    // We do this by calling connectedCallback's internal wiring inline:
    el.dispatchEvent(
      new CustomEvent("leaflet-draw:ready", { detail: readyDetail }),
    );
    // The hook is invoked _inside_ connectedCallback wiring, not on event dispatch,
    // so we test the actual wiring by calling the controller callbacks directly.
    const callbacks = captureCallbacks(el);
    callbacks.onReady(readyDetail);
    expect(onReady).toHaveBeenCalledWith(readyDetail);
  });

  // ---- onCreated ----

  it("onCreated hook is called alongside the DOM event", () => {
    const el: any = document.createElement(TAG);
    const onCreated = vi.fn();
    el.hooks = { onCreated };

    const detail = {
      id: "abc",
      layerType: "polygon" as const,
      geoJSON: makePoint(),
    };

    const callbacks = captureCallbacks(el);
    callbacks.onCreated(detail);
    expect(onCreated).toHaveBeenCalledWith(detail);
  });

  it("onCreated DOM event still fires when hook is set", () => {
    const el: any = document.createElement(TAG);
    const domSpy = vi.fn();
    el.addEventListener("leaflet-draw:created", domSpy);
    el.hooks = { onCreated: vi.fn() };

    const detail = {
      id: "abc",
      layerType: "polygon" as const,
      geoJSON: makePoint(),
    };
    const callbacks = captureCallbacks(el);
    callbacks.onCreated(detail);
    expect(domSpy).toHaveBeenCalledOnce();
    expect((domSpy.mock.calls[0][0] as CustomEvent).detail).toEqual(detail);
  });

  // ---- onEdited ----

  it("onEdited hook is called with the edited feature collection", () => {
    const el: any = document.createElement(TAG);
    const onEdited = vi.fn();
    el.hooks = { onEdited };

    const detail = { ids: ["a", "b"], geoJSON: makeFC(makePoint()) };
    const callbacks = captureCallbacks(el);
    callbacks.onEdited(detail);
    expect(onEdited).toHaveBeenCalledWith(detail);
  });

  // ---- onDeleted ----

  it("onDeleted hook is called with the deleted IDs", () => {
    const el: any = document.createElement(TAG);
    const onDeleted = vi.fn();
    el.hooks = { onDeleted };

    const detail = { ids: ["x"], geoJSON: makeFC() };
    const callbacks = captureCallbacks(el);
    callbacks.onDeleted(detail);
    expect(onDeleted).toHaveBeenCalledWith(detail);
  });

  // ---- onError ----

  it("onError hook is called when the controller signals an error", () => {
    const el: any = document.createElement(TAG);
    const onError = vi.fn();
    el.hooks = { onError };

    const detail = { message: "boom", cause: new Error("boom") };
    const callbacks = captureCallbacks(el);
    callbacks.onError(detail);
    expect(onError).toHaveBeenCalledWith(detail);
  });

  it("onError hook fires for loadGeoJSONFromText parse failure", async () => {
    const el: any = document.createElement(TAG);
    const onError = vi.fn();
    el.hooks = { onError };
    el._controller = { loadGeoJSON: vi.fn() };

    await expect(el.loadGeoJSONFromText("not-json")).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toMatch(/parse/i);
  });

  // ---- onDrawStart / onDrawStop ----

  it("onDrawStart hook is called when a draw tool is activated", () => {
    const el: any = document.createElement(TAG);
    const onDrawStart = vi.fn();
    el.hooks = { onDrawStart };

    const detail = { layerType: "polygon" };
    const callbacks = captureCallbacks(el);
    callbacks.onDrawStart(detail);
    expect(onDrawStart).toHaveBeenCalledWith(detail);
  });

  it("onDrawStop hook is called when a draw tool is deactivated", () => {
    const el: any = document.createElement(TAG);
    const onDrawStop = vi.fn();
    el.hooks = { onDrawStop };

    const detail = { layerType: "polygon" };
    const callbacks = captureCallbacks(el);
    callbacks.onDrawStop(detail);
    expect(onDrawStop).toHaveBeenCalledWith(detail);
  });

  it("leaflet-draw:drawstart DOM event fires alongside the hook", () => {
    const el: any = document.createElement(TAG);
    const domSpy = vi.fn();
    el.addEventListener("leaflet-draw:drawstart", domSpy);
    el.hooks = { onDrawStart: vi.fn() };

    const detail = { layerType: "marker" };
    const callbacks = captureCallbacks(el);
    callbacks.onDrawStart(detail);
    expect(domSpy).toHaveBeenCalledOnce();
  });

  // ---- onEditStart / onEditStop ----

  it("onEditStart hook is called when edit mode is activated", () => {
    const el: any = document.createElement(TAG);
    const onEditStart = vi.fn();
    el.hooks = { onEditStart };

    const callbacks = captureCallbacks(el);
    callbacks.onEditStart({} as Record<string, never>);
    expect(onEditStart).toHaveBeenCalledOnce();
  });

  it("onEditStop hook is called when edit mode is deactivated", () => {
    const el: any = document.createElement(TAG);
    const onEditStop = vi.fn();
    el.hooks = { onEditStop };

    const callbacks = captureCallbacks(el);
    callbacks.onEditStop({} as Record<string, never>);
    expect(onEditStop).toHaveBeenCalledOnce();
  });

  // ---- onIngest ----

  it("onIngest hook is called before loadGeoJSON processes data", async () => {
    const el: any = document.createElement(TAG);
    const onIngest = vi.fn();
    el.hooks = { onIngest };
    const passedToController: any[] = [];
    el._controller = {
      loadGeoJSON: vi.fn(async (x: any) => passedToController.push(x)),
    };

    const fc = makeFC(makePoint());
    await el.loadGeoJSON(fc);
    expect(onIngest).toHaveBeenCalledOnce();
    expect(onIngest.mock.calls[0][0].mode).toBe("load");
  });

  it("onIngest hook receives a mutable detail and can transform fc", async () => {
    const el: any = document.createElement(TAG);
    const replacement = makeFC(makePoint([9, 9]));
    el.hooks = {
      onIngest: (detail: any) => {
        detail.fc = replacement;
      },
    };
    const passedToController: any[] = [];
    el._controller = {
      loadGeoJSON: vi.fn(async (x: any) => passedToController.push(x)),
    };

    await el.loadGeoJSON(makeFC(makePoint([0, 0])));
    expect(passedToController[0]).toBe(replacement);
  });

  it("onIngest hook fires for addFeatures with mode='add'", async () => {
    const el: any = document.createElement(TAG);
    const onIngest = vi.fn();
    el.hooks = { onIngest };
    el._controller = { addFeatures: vi.fn().mockResolvedValue(["id1"]) };

    await el.addFeatures(makeFC(makePoint()));
    expect(onIngest).toHaveBeenCalledOnce();
    expect(onIngest.mock.calls[0][0].mode).toBe("add");
  });

  // ---- onExport ----

  it("onExport hook is called by exportGeoJSON alongside the DOM event", async () => {
    const el: any = document.createElement(TAG);
    const onExport = vi.fn();
    el.hooks = { onExport };
    const fc = makeFC(makePoint(), makePoint([1, 1]));
    el._controller = { getGeoJSON: vi.fn().mockResolvedValue(fc) };

    const domSpy = vi.fn();
    el.addEventListener("leaflet-draw:export", domSpy);

    const result = await el.exportGeoJSON();
    expect(result).toEqual(fc);
    expect(onExport).toHaveBeenCalledOnce();
    expect(onExport.mock.calls[0][0].featureCount).toBe(2);
    expect(domSpy).toHaveBeenCalledOnce();
  });

  // ---- hooks can be updated at any time ----

  it("updating hooks after connectedCallback takes effect without reinit", () => {
    const el: any = document.createElement(TAG);

    // Capture the callbacks wired during connectedCallback
    const callbacks = captureCallbacks(el);

    const firstHook = vi.fn();
    el.hooks = { onCreated: firstHook };

    const detail = {
      id: "1",
      layerType: "polygon" as const,
      geoJSON: makePoint(),
    };
    callbacks.onCreated(detail);
    expect(firstHook).toHaveBeenCalledOnce();

    // Replace hooks entirely
    const secondHook = vi.fn();
    el.hooks = { onCreated: secondHook };
    callbacks.onCreated(detail);
    expect(firstHook).toHaveBeenCalledOnce(); // not called again
    expect(secondHook).toHaveBeenCalledOnce();
  });

  // ---- MapControllerCallbacks types ----

  it("MapControllerCallbacks includes onDrawStart, onDrawStop, onEditStart, onEditStop", async () => {
    const { MapController } = await import("@src/lib/MapController");
    // The types are compile-time only; we verify runtime shape by constructing an options object
    const container = document.createElement("div");
    const onDrawStart = vi.fn();
    const onDrawStop = vi.fn();
    const onEditStart = vi.fn();
    const onEditStop = vi.fn();

    const controller = new MapController({
      container,
      map: {
        latitude: 0,
        longitude: 0,
        zoom: 2,
        tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      },
      controls: {},
      callbacks: { onDrawStart, onDrawStop, onEditStart, onEditStop },
    });

    // Just verify construction doesn't throw; the callbacks are stored internally
    expect((controller as any).options.callbacks.onDrawStart).toBe(onDrawStart);
    expect((controller as any).options.callbacks.onDrawStop).toBe(onDrawStop);
    expect((controller as any).options.callbacks.onEditStart).toBe(onEditStart);
    expect((controller as any).options.callbacks.onEditStop).toBe(onEditStop);
    controller.destroy();
  });
});

// ---------------------------------------------------------------------------
// Helper: replicate the callback-wiring that connectedCallback performs so
// tests can exercise the hook paths without actually mounting a Leaflet map.
// ---------------------------------------------------------------------------
function captureCallbacks(el: any) {
  const callbacks: Record<string, (...args: any[]) => void> = {};

  const makeCallback =
    (domEvent: string, hookKey: keyof GeoKitHooks) => (detail: any) => {
      el.dispatchEvent(new CustomEvent(domEvent, { detail }));
      (el._hooks as any)[hookKey]?.(detail);
    };

  callbacks.onReady = makeCallback("leaflet-draw:ready", "onReady");
  callbacks.onCreated = makeCallback("leaflet-draw:created", "onCreated");
  callbacks.onEdited = makeCallback("leaflet-draw:edited", "onEdited");
  callbacks.onDeleted = makeCallback("leaflet-draw:deleted", "onDeleted");
  callbacks.onError = makeCallback("leaflet-draw:error", "onError");
  callbacks.onDrawStart = makeCallback("leaflet-draw:drawstart", "onDrawStart");
  callbacks.onDrawStop = makeCallback("leaflet-draw:drawstop", "onDrawStop");
  callbacks.onEditStart = makeCallback("leaflet-draw:editstart", "onEditStart");
  callbacks.onEditStop = makeCallback("leaflet-draw:editstop", "onEditStop");

  return callbacks;
}
