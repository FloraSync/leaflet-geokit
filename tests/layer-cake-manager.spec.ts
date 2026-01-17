import { describe, it, expect, vi, beforeEach } from "vitest";
import * as L from "leaflet";
import { LayerCakeManager } from "@src/lib/layer-cake/LayerCakeManager";

// Ensure Leaflet.draw events exist for testing
const anyL = L as any;
if (typeof anyL.Draw === "undefined") {
  // If we can't assign to L.Draw directly, we might need to mock the import
  // But let's try to just define it on the prototype or similar if it's a class
  try {
    anyL.Draw = {
      Event: {
        EDITMOVE: "draw:editmove",
        EDITRESIZE: "draw:editresize",
        EDITSTART: "draw:editstart",
        EDITSTOP: "draw:editstop",
      },
    };
  } catch (e) {
    console.warn("Could not mock L.Draw directly", e);
  }
}

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
});
