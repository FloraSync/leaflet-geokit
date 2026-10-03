import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyToolButtonConfig,
  setActiveToolbarTool,
} from "@src/lib/tool-buttons";

const container = document.createElement("div");
afterEach(() => {
  applyToolButtonConfig(container, null);
  container.replaceChildren();
  container.remove();
});

describe("public toolbar styling contract", () => {
  it("renders parts, slots and placement defaults without important visual declarations", () => {
    applyToolButtonConfig(
      container,
      { save: { badge: "2", tooltip: "Save zones" } },
      {
        toolbarGroups: [
          {
            id: "care",
            tools: ["save"],
            position: "bottomleft",
            offset: [24, 32],
            orientation: "horizontal",
            gap: 12,
            hideDefaultToolbar: false,
          },
        ],
      },
    );
    const group = container.querySelector<HTMLElement>(
      '[part~="toolbar-group"]',
    )!;
    expect(group.dataset.geokitToolbarPosition).toBe("bottomleft");
    expect(group.dataset.geokitToolbarOrientation).toBe("horizontal");
    expect(group.style.getPropertyValue("--_geokit-offset-x")).toBe("24px");
    expect(group.style.getPropertyValue("--_geokit-gap")).toBe("12px");
    for (const part of ["toolbar-button", "icon", "badge", "tooltip"]) {
      expect(group.querySelector(`[part~="${part}"]`)).not.toBeNull();
    }
    expect(group.querySelector('slot[name="care-save-0-icon"]')).not.toBeNull();
    expect(
      group.querySelector('slot[name="care-save-0-badge"]')?.textContent,
    ).toBe("2");
    expect(
      group.querySelector('slot[name="care-save-0-tooltip"]')?.textContent,
    ).toBe("Save zones");
    expect(group.outerHTML).not.toContain("!important");
    expect(container.hasAttribute("data-geokit-default-toolbar-hidden")).toBe(
      false,
    );
  });

  it("keeps active and disabled parts across rerenders and blocks disabled actions", () => {
    const onTrigger = vi.fn();
    const options = {
      toolbarGroups: [{ id: "care", tools: ["polygon", "save"] as const }],
      onTrigger,
    };
    // Mutable tool arrays are the existing public API.
    const groups = options.toolbarGroups.map((group) => ({
      ...group,
      tools: [...group.tools],
    }));
    applyToolButtonConfig(
      container,
      { save: { disabled: true } },
      { ...options, toolbarGroups: groups },
    );
    setActiveToolbarTool(container, "polygon");
    expect(
      container.querySelector('[part~="active"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    const disabled =
      container.querySelector<HTMLButtonElement>('[part~="disabled"]')!;
    expect(disabled.disabled).toBe(true);
    disabled.click();
    disabled.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onTrigger).not.toHaveBeenCalled();
    applyToolButtonConfig(container, null, { toolbarGroups: groups });
    expect(
      container
        .querySelector('[part~="active"]')
        ?.getAttribute("data-geokit-tool"),
    ).toBe("polygon");
    expect(container.querySelector('[part~="disabled"]')).toBeNull();
    setActiveToolbarTool(container, null);
    expect(container.querySelector('[part~="active"]')).toBeNull();
  });

  it("exposes popovers and keeps configured icon dimensions as overridable fallbacks", () => {
    document.body.append(container);
    applyToolButtonConfig(
      container,
      {
        save: {
          iconSize: [26, 28],
          iconHtml: "<svg></svg>",
          popover: { title: "Save" },
        },
      },
      {
        toolbarGroups: [{ id: "care", tools: ["save"] }],
      },
    );
    const icon = container.querySelector<HTMLElement>('[part~="icon"]')!;
    expect(icon.style.getPropertyValue("--_geokit-icon-width")).toBe("26px");
    container.querySelector<HTMLButtonElement>("button")!.click();
    expect(container.querySelector('[part~="popover"]')).not.toBeNull();
    expect(
      container.querySelector('[part~="popover"]')?.getAttribute("style"),
    ).not.toContain("!important");
    container.querySelector('[part~="popover"]')!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
      }),
    );
    expect(container.querySelector('[part~="popover"]')).toBeNull();
  });
});
