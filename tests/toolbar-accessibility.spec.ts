import { afterEach, describe, expect, it, vi } from "vitest";
import { applyToolButtonConfig } from "@src/lib/tool-buttons";
import { announceToolStatus, installToolbarAccessibility } from "@src/lib/toolbar-accessibility";

const container = document.createElement("div");
afterEach(() => {
  applyToolButtonConfig(container, null);
  container.replaceChildren();
  container.remove();
});
const key = (element: HTMLElement, value: string) => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, composed: true, cancelable: true }));

describe("toolbar accessibility", () => {
  it("navigates orientation, wraps, and skips disabled tools without removing Tab access", () => {
    document.body.append(container);
    applyToolButtonConfig(container, { marker: { disabled: true } }, { toolbarGroups: [{ id: "tools", tools: ["polygon", "marker", "save"], orientation: "horizontal" }] });
    const [first, disabled, last] = Array.from(container.querySelectorAll("button"));
    first.focus();
    key(first, "ArrowRight");
    expect(document.activeElement).toBe(last);
    key(last, "ArrowRight");
    expect(document.activeElement).toBe(first);
    key(first, "End");
    expect(document.activeElement).toBe(last);
    key(last, "Home");
    expect(document.activeElement).toBe(first);
    expect(disabled.disabled).toBe(true);
    expect(last.tabIndex).toBe(0);
  });

  it("activates native anchor buttons once with Space and Enter after repeated installation", () => {
    container.innerHTML = '<div class="leaflet-draw-toolbar"><a href="#" data-geokit-tool="polygon" title="Draw polygon"></a></div>';
    const button = container.querySelector("a")!;
    const click = vi.fn(event => event.preventDefault());
    button.addEventListener("click", click);
    installToolbarAccessibility(container);
    installToolbarAccessibility(container);
    key(button, " ");
    key(button, "Enter");
    expect(click).toHaveBeenCalledTimes(2);
    expect(button.getAttribute("aria-label")).toBe("Draw polygon");
    button.setAttribute("aria-disabled", "true");
    key(button, " ");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("focuses popovers, keeps inside clicks open across shadow DOM, and restores focus on Escape", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.append(container);
    applyToolButtonConfig(container, { save: { popover: { title: "Save options", html: '<button type="button">Confirm</button>' } } }, { toolbarGroups: [{ id: "tools", tools: ["save"] }] });
    const button = container.querySelector<HTMLButtonElement>(".leaflet-geokit-toolbar-button")!;
    button.click();
    const dialog = container.querySelector<HTMLElement>("[role='dialog']")!;
    expect(root.activeElement).toBe(dialog.querySelector("button"));
    key(dialog.querySelector("button")!, "Escape");
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(root.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    host.remove();
  });

  it("announces status and errors as text in distinct persistent live regions", () => {
    announceToolStatus(container, "polygon: started");
    announceToolStatus(container, "<error>", true);
    expect(container.querySelector("[role='status']")?.textContent).toBe("polygon: started");
    expect(container.querySelector("[role='alert']")?.textContent).toBe("<error>");
    expect(container.querySelector("error")).toBeNull();
    announceToolStatus(container, "polygon: completed");
    expect(container.querySelectorAll("[role='status']")).toHaveLength(1);
  });
});
