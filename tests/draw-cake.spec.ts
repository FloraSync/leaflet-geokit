import { describe, it, expect, beforeEach, vi } from "vitest";
import { DrawCake } from "../src/lib/draw/L.Draw.Cake";
import * as L from "leaflet";

// Mock Leaflet's Draw.Circle
const mockAddHooks = vi.fn();
const mockUpdateContent = vi.fn();

vi.mock("leaflet", async () => {
  const actual = await vi.importActual<typeof import("leaflet")>("leaflet");
  
  class MockCircle {
    type: string = "";
    _tooltip: any;
    
    constructor(map: L.Map, options?: L.DrawOptions.CircleOptions) {
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
});