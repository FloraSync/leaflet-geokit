import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DrawCake,
  ensureDrawCakeRegistered,
} from "../src/lib/draw/L.Draw.Cake";
import * as L from "leaflet";

// Mock Leaflet's Draw.Circle
const mockAddHooks = vi.fn();
const mockUpdateContent = vi.fn();

vi.mock("leaflet", async () => {
  const actual = await vi.importActual<typeof L>("leaflet");

  class MockCircle {
    type: string = "";
    _tooltip: any;

    constructor(_map: L.Map, _options?: L.DrawOptions.CircleOptions) {
      this._tooltip = {
        updateContent: mockUpdateContent,
      };
    }

    addHooks() {
      mockAddHooks();
    }
  }

  return {
    ...actual,
    Draw: {
      Circle: MockCircle,
    },
  } as any;
});

describe("DrawCake", () => {
  let map: L.Map;
  let drawCake: DrawCake;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a minimal map mock
    map = {
      getContainer: () => document.createElement("div"),
    } as any;
    drawCake = new DrawCake(map);
  });

  it("should have the correct TYPE", () => {
    expect(DrawCake.TYPE).toBe("cake");
  });

  it("should set the type property in constructor", () => {
    expect(drawCake.type).toBe("cake");
  });

  it("should call super.addHooks() when addHooks is called", () => {
    drawCake.addHooks();
    expect(mockAddHooks).toHaveBeenCalled();
  });

  it("should update tooltip content when addHooks is called and tooltip exists", () => {
    drawCake.addHooks();
    expect(mockUpdateContent).toHaveBeenCalledWith({
      text: "Click and drag to draw the Layer Cake base",
      subtext: "Release mouse to finish base layer",
    });
  });

  it("should handle missing tooltip gracefully", () => {
    // Create instance without tooltip
    const drawCakeNoTooltip = new DrawCake(map);
    (drawCakeNoTooltip as any)._tooltip = null;

    expect(() => drawCakeNoTooltip.addHooks()).not.toThrow();
  });

  it("should handle tooltip without updateContent method", () => {
    const drawCakeNoUpdate = new DrawCake(map);
    (drawCakeNoUpdate as any)._tooltip = {};

    expect(() => drawCakeNoUpdate.addHooks()).not.toThrow();
  });

  it("should extend L.Draw namespace with Cake class", () => {
    expect((L as any).Draw.Cake).toBe(DrawCake);
  });

  it("ensureDrawCakeRegistered is a no-op when Draw namespace is missing", () => {
    const lns = {} as any;

    expect(() => ensureDrawCakeRegistered(lns)).not.toThrow();
    expect((lns as any).Draw).toBeUndefined();
  });

  it("ensureDrawCakeRegistered does not overwrite existing Draw.Cake", () => {
    const existingCake = class ExistingCake {};
    const lns = {
      Draw: {
        Circle: class {
          addHooks() {}
        },
        Cake: existingCake,
      },
    } as any;

    ensureDrawCakeRegistered(lns);
    expect(lns.Draw.Cake).toBe(existingCake);
  });

  it("ensureDrawCakeRegistered registers runtime Draw.Cake with constructor and hooks", () => {
    const runtimeAddHooks = vi.fn();
    const runtimeUpdateContent = vi.fn();

    class RuntimeCircle {
      public type = "";
      public _tooltip: { updateContent: (payload: unknown) => void } | null = {
        updateContent: runtimeUpdateContent,
      };

      constructor(_map: unknown, _options?: unknown) {}

      addHooks() {
        runtimeAddHooks();
      }
    }

    const lns = {
      Draw: {
        Circle: RuntimeCircle,
      },
    } as any;

    ensureDrawCakeRegistered(lns);

    const RuntimeCake = lns.Draw.Cake;
    expect(RuntimeCake).toBeInstanceOf(Function);
    expect(RuntimeCake.TYPE).toBe("cake");

    const runtimeCake = new RuntimeCake({} as any);
    expect(runtimeCake.type).toBe("cake");

    runtimeCake.addHooks();

    expect(runtimeAddHooks).toHaveBeenCalled();
    expect(runtimeUpdateContent).toHaveBeenCalledWith({
      text: "Click and drag to draw the Layer Cake base",
      subtext: "Release mouse to finish base layer",
    });
  });
});
