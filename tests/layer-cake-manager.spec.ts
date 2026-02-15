import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as L from "leaflet";
import { LayerCakeManager } from "@src/lib/layer-cake/LayerCakeManager";

// Ensure Leaflet.draw events exist for tests in a descriptor-safe way.
// Some environments expose `L.Draw` as a non-configurable property.
function ensureDrawEvents(): boolean {
  const anyL = L as any;

  try {
    // Do not blindly reassign `L.Draw` — that can throw in CI depending on descriptors.
    if (typeof anyL.Draw === "undefined") {
      Object.defineProperty(anyL, "Draw", {
        value: {},
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }

    if (!anyL.Draw || typeof anyL.Draw !== "object") {
      return false;
    }

    if (!anyL.Draw.Event || typeof anyL.Draw.Event !== "object") {
      anyL.Draw.Event = {};
    }

    anyL.Draw.Event.EDITMOVE ??= "draw:editmove";
    anyL.Draw.Event.EDITRESIZE ??= "draw:editresize";
    anyL.Draw.Event.EDITSTART ??= "draw:editstart";
    anyL.Draw.Event.EDITSTOP ??= "draw:editstop";

    return Boolean(anyL.Draw.Event.EDITMOVE && anyL.Draw.Event.EDITRESIZE);
  } catch {
    return false;
  }
}

const hasDrawEvents = ensureDrawEvents();

describe("LayerCakeManager", () => {
  let map: L.Map;
  let container: HTMLDivElement;
  let initialCircle: L.Circle;
  let onSave: any;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "400px";
    container.style.height = "400px";
    document.body.appendChild(container);

    map = L.map(container).setView([0, 0], 10);
    initialCircle = L.circle([0, 0], { radius: 100 });
    onSave = vi.fn();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("initializes with a base circle and renders controls", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    expect(manager).toBeDefined();

    // Check if initial circle was added to map
    expect(map.hasLayer(initialCircle)).toBe(true);

    // Check if tooltip was bound
    expect(initialCircle.getTooltip()).toBeDefined();
    expect(initialCircle.getTooltip()?.getContent()).toBe("100 m");

    manager.destroy();
  });

  it("adds a ring when addRing is called", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    manager.addRing();

    // Should now have 2 layers in the manager (internal state is private but we can check the map)
    // Actually we can check the map's layers
    let circleCount = 0;
    map.eachLayer((l) => {
      if (l instanceof L.Circle) circleCount++;
    });
    expect(circleCount).toBe(2);

    manager.destroy();
  });

  it("stops adding rings at 10", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    for (let i = 0; i < 15; i++) {
      manager.addRing();
    }

    let circleCount = 0;
    map.eachLayer((l) => {
      if (l instanceof L.Circle) circleCount++;
    });
    expect(circleCount).toBe(10);

    manager.destroy();
  });

  it("saves and destroys itself", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    manager.save();

    expect(onSave).toHaveBeenCalled();
    // After save, it calls destroy, so circles should be removed from map
    let circleCount = 0;
    map.eachLayer((l) => {
      if (l instanceof L.Circle) circleCount++;
    });
    expect(circleCount).toBe(0);
  });

  it("updates labels correctly during resize", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    manager.addRing(); // Adds a second ring with 150m radius (100 * 1.5)

    // Find the second circle
    const circles: L.Circle[] = [];
    map.eachLayer((l) => {
      if (l instanceof L.Circle) circles.push(l as L.Circle);
    });

    const largerCircle = circles.find((c) => c.getRadius() > 100);
    expect(largerCircle).toBeDefined();

    // Manually trigger the resize logic via private method (using any to bypass)
    (manager as any).updateLabels(largerCircle!);

    expect(largerCircle!.getTooltip()?.getContent()).toContain("150 m (+50 m)");

    manager.destroy();
  });

  it("formats distances in imperial system if configured", () => {
    const manager = new LayerCakeManager(
      map,
      initialCircle,
      onSave,
      "imperial",
    );
    // 100 meters is approx 328 feet
    expect(initialCircle.getTooltip()?.getContent()).toBe("328 ft");

    manager.destroy();
  });

  it("syncs centers when one circle moves", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    manager.addRing();

    const newCenter = L.latLng(1, 1);
    initialCircle.setLatLng(newCenter);

    // Trigger syncCenters
    (manager as any).syncCenters(initialCircle);

    map.eachLayer((l) => {
      if (l instanceof L.Circle) {
        expect(l.getLatLng().lat).toBe(1);
        expect(l.getLatLng().lng).toBe(1);
      }
    });

    manager.destroy();
  });

  it("cleans up listeners on destroy", () => {
    const offSpy = vi.spyOn(map, "off");
    const manager = new LayerCakeManager(map, initialCircle, onSave);
    manager.destroy();

    expect(offSpy).toHaveBeenCalled();
  });

  it("handles editing setup failures gracefully", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);

    // Mock a circle with problematic editing property
    const problematicCircle = L.circle([0, 0], { radius: 200 });
    const mockEditing = {
      enabled: vi.fn(() => false),
      enable: vi.fn(() => {
        throw new Error("Editing failed");
      }),
      updateMarkers: vi.fn(),
    };
    (problematicCircle as any).editing = mockEditing;

    // This should not throw even if editing setup fails (it's done in addLayer method)
    expect(() => {
      (manager as any).addLayer(problematicCircle);
    }).not.toThrow();

    manager.destroy();
  });

  it("calculates delta labels correctly with inner neighbors", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);

    // Add multiple rings to create inner neighbors
    manager.addRing(); // 150m
    manager.addRing(); // 225m

    const circles: L.Circle[] = [];
    map.eachLayer((l) => {
      if (l instanceof L.Circle) circles.push(l as L.Circle);
    });

    // Find the largest circle (should be 225m)
    const largestCircle = circles.reduce((prev, curr) =>
      prev.getRadius() > curr.getRadius() ? prev : curr,
    );

    // Update labels for the largest circle - this should trigger the delta calculation
    (manager as any).updateLabels(largestCircle);

    // The tooltip should show both total and delta
    const content = largestCircle.getTooltip()?.getContent();
    expect(content).toContain("+");
    expect(content).toContain("75 m"); // Delta from 150m to 225m

    manager.destroy();
  });

  it("handles listener cleanup errors during destroy", () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);

    // Add a problematic detach function that throws
    (manager as any).detachMapListeners.push(() => {
      throw new Error("Cleanup failed");
    });

    // Destroy should not throw even if listener cleanup fails
    expect(() => manager.destroy()).not.toThrow();
  });

  it("renders controls asynchronously with setTimeout", async () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);

    // The controls are rendered with setTimeout, so we need to wait
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check that controls group exists on the map
    let hasControlsGroup = false;
    map.eachLayer((layer) => {
      if (layer === (manager as any).controlsGroup) {
        hasControlsGroup = true;
      }
    });
    expect(hasControlsGroup).toBe(true);

    manager.destroy();
  });

  it.runIf(hasDrawEvents)(
    "tests event listener detachment with existing L.Draw setup",
    () => {
      // Since L.Draw is already set up from the top of the file,
      // this should create listeners that need to be detached
      const manager = new LayerCakeManager(map, initialCircle, onSave);

      // The constructor should have set up event listeners if L.Draw.Event exists
      // This covers the listener setup including line 124 (the EDITRESIZE detachment)
      expect(() => {
        manager.destroy();
      }).not.toThrow();
    },
  );

  it("uses setTimeout fallback when requestAnimationFrame is not available", async () => {
    // Mock requestAnimationFrame to be undefined to trigger line 134
    const originalRAF = global.requestAnimationFrame;
    delete (global as any).requestAnimationFrame;

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const manager = new LayerCakeManager(map, initialCircle, onSave);

    // Trigger requestRenderControls to exercise the setTimeout fallback
    (manager as any).requestRenderControls();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);

    // Restore requestAnimationFrame
    global.requestAnimationFrame = originalRAF;

    // Wait for setTimeout to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    manager.destroy();
  });

  it("handles already-enabled editing state in addLayer", async () => {
    const manager = new LayerCakeManager(map, initialCircle, onSave);

    // Create a circle with editing already enabled (lines 165-169)
    const circle = L.circle([0, 0], { radius: 200 });
    const mockEditing = {
      enabled: vi.fn(() => true), // Return true to trigger early return on line 166
      updateMarkers: vi.fn(),
      enable: vi.fn(),
    };
    (circle as any).editing = mockEditing;

    // Mock requestRenderControls to verify it gets called (line 167)
    const requestRenderSpy = vi.spyOn(manager as any, "requestRenderControls");

    (manager as any).addLayer(circle);

    // Wait for setTimeout to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockEditing.enabled).toHaveBeenCalled();
    expect(mockEditing.updateMarkers).toHaveBeenCalled();
    expect(requestRenderSpy).toHaveBeenCalled();
    // Should not call enable() since editing is already enabled
    expect(mockEditing.enable).not.toHaveBeenCalled();

    manager.destroy();
  });

  it("formats imperial distances with miles for large distances", () => {
    // Test the imperial miles formatting path (line 16-18)
    const largeCircle = L.circle([0, 0], { radius: 2000 }); // ~6562 feet > 5280
    const manager = new LayerCakeManager(map, largeCircle, onSave, "imperial");

    // 2000 meters = ~6562 feet = ~1.24 miles
    const content = largeCircle.getTooltip()?.getContent() as string;
    expect(content).toMatch(/\d+\.\d+ mi$/);

    manager.destroy();
  });
});
