import { describe, it, expect, beforeAll } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("Move Tool", () => {
  let el: any;

  beforeAll(() => {
    el = document.createElement(TAG) as any;
    el.setAttribute("draw-move", "");
    document.body.appendChild(el);
  });

  it("observes the draw-move attribute", () => {
    const ctor: any = customElements.get(TAG);
    expect(ctor.observedAttributes).toContain("draw-move");
  });

  it("enables move tool when draw-move attribute is present", () => {
    const testEl: any = document.createElement(TAG);
    testEl.setAttribute("draw-move", "");
    const controls = testEl._controlsFromAttributes();
    expect(controls.move).toBe(true);
  });

  it("disables move tool when draw-move attribute is absent", () => {
    const testEl: any = document.createElement(TAG);
    const controls = testEl._controlsFromAttributes();
    expect(controls.move).toBe(false);
  });
});
