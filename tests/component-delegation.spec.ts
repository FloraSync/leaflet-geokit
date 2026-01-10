import { describe, it, expect, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("LeafletDrawMapElement — delegation & reflection", () => {
  it("fitBounds delegates to controller with provided padding", async () => {
    const el: any = document.createElement(TAG);
    const fitSpy = vi.fn();
    el._controller = { fitBounds: fitSpy };

    const bounds: [[number, number], [number, number]] = [
      [1, 2],
      [3, 4],
    ];
    await el.fitBounds(bounds, 0.25);
    expect(fitSpy).toHaveBeenCalled();
    const last = fitSpy.mock.calls.at(-1)!;
    expect(last[0]).toEqual(bounds);
    expect(last[1]).toBe(0.25);

    // Default padding path
    await el.fitBounds(bounds);
    const last2 = fitSpy.mock.calls.at(-1)!;
    expect(last2[1]).toBe(0.05);
  });

  it("setView reflects attributes and calls controller.setView", async () => {
    const el: any = document.createElement(TAG);
    const setViewSpy = vi.fn();
    el._controller = { setView: setViewSpy };

    await el.setView(10, 20, 7);
    // Attributes reflected
    expect(el.latitude).toBe(10);
    expect(el.longitude).toBe(20);
    expect(el.zoom).toBe(7);
    expect(el.getAttribute("latitude")).toBe("10");
    expect(el.getAttribute("longitude")).toBe("20");
    expect(el.getAttribute("zoom")).toBe("7");

    // Spy likely called multiple times due to attributeChangedCallback; verify last call args
    expect(setViewSpy).toHaveBeenCalled();
    const last = setViewSpy.mock.calls.at(-1)!;
    expect(last).toEqual([10, 20, 7]);
  });
});
