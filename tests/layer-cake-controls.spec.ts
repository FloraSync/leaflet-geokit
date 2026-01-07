import { describe, it, expect, vi } from "vitest";
import { bindCakeControls } from "@src/lib/layer-cake/bindCakeControls";

describe("bindCakeControls", () => {
  it("binds buttons inside an arbitrary root (e.g. Shadow DOM)", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <div>
        <button id="cake-add-abc">Add</button>
        <button id="cake-save-abc">Save</button>
      </div>
    `;

    const onAddRing = vi.fn();
    const onSave = vi.fn();

    bindCakeControls({
      root: shadow,
      addButtonId: "cake-add-abc",
      saveButtonId: "cake-save-abc",
      onAddRing,
      onSave,
    });

    const addBtn = shadow.querySelector("#cake-add-abc")!;
    const saveBtn = shadow.querySelector("#cake-save-abc")!;

    addBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onAddRing).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("stops pointerdown/mousedown from bubbling (prevents Leaflet drags)", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div id="wrap">
        <button id="cake-add-xyz">Add</button>
        <button id="cake-save-xyz">Save</button>
      </div>
    `;

    const parentSpy = vi.fn();
    root.addEventListener("mousedown", parentSpy);
    root.addEventListener("pointerdown", parentSpy);

    bindCakeControls({
      root,
      addButtonId: "cake-add-xyz",
      saveButtonId: "cake-save-xyz",
      onAddRing: vi.fn(),
      onSave: vi.fn(),
    });

    const addBtn = root.querySelector("#cake-add-xyz")!;
    addBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    addBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(parentSpy).not.toHaveBeenCalled();
  });
});

