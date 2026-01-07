import { describe, it, expect, vi } from "vitest";
import * as L from "leaflet";
import { MapController } from "@src/lib/MapController";

describe("Leaflet.draw strict-mode patches", () => {
  it("patches circle resize to not throw (undeclared radius bug)", () => {
    const controller = new MapController({
      container: document.createElement("div"),
      map: {
        latitude: 0,
        longitude: 0,
        zoom: 2,
        tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      },
      controls: {},
    });

    // apply patches without initializing a real map
    (controller as any).patchLeafletDrawBugs();

    const resize = (L as any).Edit?.Circle?.prototype?._resize;
    expect(typeof resize).toBe("function");

    const setRadius = vi.fn();
    const fire = vi.fn();
    const fakeContext = {
      _moveMarker: { getLatLng: () => ({ distanceTo: () => 123 }) },
      _map: { distance: () => 123, fire },
      _shape: { setRadius },
      options: { feet: false, nautic: false },
    };

    expect(() => resize.call(fakeContext, {})).not.toThrow();
    expect(setRadius).toHaveBeenCalledWith(123);
  });
});

