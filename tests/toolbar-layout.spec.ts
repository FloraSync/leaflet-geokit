import { afterEach, describe, expect, it, vi } from "vitest";
import { applyToolButtonConfig } from "@src/lib/tool-buttons";
import {
  resolveToolbarPlacement,
  toolbarZone,
  usesToolbarLayout,
} from "@src/lib/toolbar-layout";
import type { ToolToolbarGroupConfig } from "@src/types/public";

const container = document.createElement("div");
afterEach(() => {
  applyToolButtonConfig(container, null);
  container.remove();
  vi.restoreAllMocks();
});

describe("responsive toolbar layout", () => {
  it("disconnects observers on teardown and reconnects without retaining an old owner", () => {
    const resizeDisconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const mutationDisconnect = vi.spyOn(
      MutationObserver.prototype,
      "disconnect",
    );
    document.body.appendChild(container);
    applyToolButtonConfig(container, null, {
      toolbarGroups: [{ id: "care", tools: ["save"], preset: "zones" }],
    });
    const layout = container.querySelector("geokit-toolbar-layout")!;
    layout.remove();
    expect(resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(mutationDisconnect).toHaveBeenCalledTimes(1);
    container.appendChild(layout);
    layout.remove();
    expect(resizeDisconnect).toHaveBeenCalledTimes(2);
    expect(mutationDisconnect).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["topleft", "top-start"],
    ["topright", "top-end"],
    ["bottomleft", "bottom-start"],
    ["bottomright", "bottom-end"],
    ["center-end", "center-end"],
    ["invalid", "top-end"],
    ["constructor", "top-end"],
    ["__proto__", "top-end"],
  ])("normalizes %s to %s", (position, zone) =>
    expect(toolbarZone(position)).toBe(zone),
  );

  it("keeps legacy placement opt-in and resolves responsive map-width boundaries", () => {
    const group: ToolToolbarGroupConfig = {
      id: "care",
      tools: ["save"],
      position: "topright",
    };
    expect(usesToolbarLayout(group)).toBe(false);
    group.preset = "responsive";
    expect(usesToolbarLayout(group)).toBe(true);
    expect(resolveToolbarPlacement(group, 600).position).toBe("topright");
    expect(resolveToolbarPlacement(group, 599)).toMatchObject({
      position: "bottom-end",
      orientation: "horizontal",
    });
    group.responsive = {
      breakpoint: 700,
      position: "bottom-start",
      overflow: "scroll",
      order: -1,
      offset: [12, 20],
    };
    expect(resolveToolbarPlacement(group, 650)).toMatchObject(group.responsive);
  });

  it("renders a single layout owner, stable instance ids and one callback after rerender", () => {
    document.body.appendChild(container);
    const onTrigger = vi.fn();
    const toolbarGroups: ToolToolbarGroupConfig[] = [
      { id: "care", tools: ["save"], preset: "responsive" },
    ];
    applyToolButtonConfig(container, null, { toolbarGroups, onTrigger });
    const id =
      container.querySelector<HTMLButtonElement>("button")!.dataset
        .geokitToolInstance;
    applyToolButtonConfig(container, null, { toolbarGroups, onTrigger });
    expect(container.querySelectorAll("geokit-toolbar-layout")).toHaveLength(1);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.dataset.geokitToolInstance).toBe(id);
    button.click();
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith("save", {
      source: "toolbar",
      activate: true,
      groupId: "care",
    });
    applyToolButtonConfig(container, null);
    expect(container.querySelector("geokit-toolbar-layout")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
