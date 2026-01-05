import { describe, it, expect } from "vitest";
import { ensureCircleEditable } from "@src/lib/layer-cake/ensureCircleEditable";

describe("ensureCircleEditable", () => {
  it("ensures Leaflet.draw editing options exist", () => {
    const circle: any = { options: { color: "red" } };
    expect(circle.options.original).toBeUndefined();
    expect(circle.options.editing).toBeUndefined();

    ensureCircleEditable(circle);

    expect(circle.options.original).toBeTruthy();
    expect(circle.options.editing).toBeTruthy();
    expect(circle.options.original.color).toBe("red");
    expect(circle.options.editing.color).toBe("red");
  });
});

