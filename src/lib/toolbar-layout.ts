import type { ToolToolbarGroupConfig, ToolToolbarPosition, ToolToolbarZone } from "@src/types/public";

const zones: ToolToolbarZone[] = ["top-start", "top-end", "center-end", "bottom-start", "bottom-end"];
const aliases: Record<string, ToolToolbarZone> = {
  topleft: "top-start", topright: "top-end", bottomleft: "bottom-start", bottomright: "bottom-end",
};

export function toolbarZone(position: string = "topright"): ToolToolbarZone {
  return Object.prototype.hasOwnProperty.call(aliases, position)
    ? aliases[position]
    : (zones.includes(position as ToolToolbarZone) ? position as ToolToolbarZone : "top-end");
}

export function usesToolbarLayout(group: ToolToolbarGroupConfig): boolean {
  return Boolean(group.preset || group.responsive || zones.includes(group.position as ToolToolbarZone));
}

export function resolveToolbarPlacement(group: ToolToolbarGroupConfig, width: number) {
  const narrow = width < (group.responsive?.breakpoint ?? 600);
  const mobile = narrow && (group.preset === "responsive" || group.responsive)
    ? { position: "bottom-end" as ToolToolbarPosition, orientation: "horizontal" as const, ...group.responsive }
    : {};
  return { position: group.position ?? "topright", orientation: group.orientation ?? "vertical", order: group.order ?? 0, overflow: group.overflow ?? "wrap", offset: group.offset ?? [10, 10], ...mobile };
}

/** A light-DOM layout owner: removing it tears down all observers/listeners. */
class ToolbarLayout extends HTMLElement {
  entries: { element: HTMLElement; config: ToolToolbarGroupConfig }[] = [];
  private resize?: ResizeObserver;
  private mutations?: MutationObserver;
  private frame = 0;
  private revealFocusedTool = (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches("button")) {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };
  private schedule = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.arrange(); });
  };

  connectedCallback() {
    this.resize = new ResizeObserver(this.schedule);
    this.resize.observe(this.parentElement!);
    this.parentElement!.querySelectorAll<HTMLElement>(".leaflet-control").forEach(control => this.resize!.observe(control));
    this.entries.forEach(({ element }) => this.resize!.observe(element));
    // Host/class/theme changes may alter CSS order/zone without changing map size.
    this.mutations = new MutationObserver(records => {
      if (records.some(record => !this.contains(record.target) || record.attributeName === "class")) this.schedule();
    });
    const root = this.getRootNode();
    this.mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"], characterData: true });
    if (root instanceof ShadowRoot) this.mutations.observe(root.host, { attributes: true, attributeFilter: ["class", "style"] });
    if (root instanceof ShadowRoot) this.mutations.observe(this.ownerDocument.head, { subtree: true, childList: true, characterData: true, attributes: true });
    window.addEventListener("resize", this.schedule);
    this.addEventListener("focusin", this.revealFocusedTool);
    this.arrange();
  }

  disconnectedCallback() {
    this.resize?.disconnect();
    this.mutations?.disconnect();
    window.removeEventListener("resize", this.schedule);
    this.removeEventListener("focusin", this.revealFocusedTool);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private arrange() {
    const container = this.parentElement;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Reserve full strips for native chrome. This is deliberately conservative:
    // no zone can cross zoom, attribution or visible native toolbars.
    let top = 0, bottom = 0;
    container.querySelectorAll<HTMLElement>(".leaflet-control-container .leaflet-control").forEach(control => {
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (control.closest(".leaflet-top")) top = Math.max(top, rect.bottom - bounds.top);
      if (control.closest(".leaflet-bottom")) bottom = Math.max(bottom, bounds.bottom - rect.top);
    });
    this.style.setProperty("--_geokit-native-top", `${top}px`);
    this.style.setProperty("--_geokit-native-bottom", `${bottom}px`);
    this.dataset.narrow = String(bounds.width < 600);
    this.dataset.dense = String(bounds.width < 600 && bounds.height - top - bottom < this.entries.length * 100);
    this.entries.forEach(({ element, config }) => {
      const placement = resolveToolbarPlacement(config, bounds.width);
      const css = getComputedStyle(element);
      const zone = toolbarZone(css.getPropertyValue("--geokit-toolbar-zone").trim() || placement.position);
      const target = this.querySelector<HTMLElement>(`[data-geokit-zone="${zone}"]`)!;
      if (element.parentElement !== target) {
        const focus = element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).activeElement : document.activeElement;
        target.appendChild(element);
        if (focus instanceof HTMLElement && element.contains(focus)) focus.focus({ preventScroll: true });
      }
      element.dataset.geokitToolbarPosition = zone;
      element.style.setProperty("--_geokit-direction", placement.orientation === "horizontal" ? "row" : "column");
      element.style.setProperty("--_geokit-order", String(Number.isFinite(placement.order) ? placement.order : 0));
      element.style.setProperty("--_geokit-wrap", placement.overflow === "scroll" ? "nowrap" : "wrap");
      const [x, y] = placement.offset;
      element.style.setProperty("--_geokit-layout-x", `${Number.isFinite(x) ? Math.max(0, x) : 10}px`);
      element.style.setProperty("--_geokit-layout-y", `${Number.isFinite(y) ? Math.max(0, y) : 10}px`);
      const horizontal = getComputedStyle(element).flexDirection.startsWith("row");
      element.setAttribute("aria-orientation", horizontal ? "horizontal" : "vertical");
    });
    const occupied = zones.filter(zone => this.querySelector(`[data-geokit-zone="${zone}"]`)!.childElementCount);
    for (const zone of zones) this.querySelector<HTMLElement>(`[data-geokit-zone="${zone}"]`)!.hidden = !occupied.includes(zone);
    // Only occupied rows consume space; narrow maps use one column, preventing
    // opposing corners from colliding even when both groups contain wide tools.
    const rows = bounds.width < 600 ? occupied.map(zone => `"${zone}"`) : [
      occupied.some(z => z.startsWith("top")) ? '"top-start top-end"' : "",
      occupied.includes("center-end") ? '". center-end"' : "",
      occupied.some(z => z.startsWith("bottom")) ? '"bottom-start bottom-end"' : "",
    ].filter(Boolean);
    this.style.gridTemplateAreas = rows.join(" ");
    this.style.gridTemplateRows = bounds.width < 600
      ? occupied.map(zone => `minmax(0, ${this.querySelector(`[data-geokit-zone="${zone}"]`)!.childElementCount}fr)`).join(" ")
      : `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))`;
  }
}

export function createToolbarLayout(entries: { element: HTMLElement; config: ToolToolbarGroupConfig }[]): HTMLElement {
  if (!customElements.get("geokit-toolbar-layout")) customElements.define("geokit-toolbar-layout", ToolbarLayout);
  const layout = document.createElement("geokit-toolbar-layout") as ToolbarLayout;
  layout.setAttribute("part", "toolbar-layout");
  layout.entries = entries;
  zones.forEach(zone => {
    const rail = document.createElement("div");
    rail.dataset.geokitZone = zone;
    rail.setAttribute("part", `toolbar-zone zone-${zone}`);
    rail.style.gridArea = zone;
    layout.appendChild(rail);
  });
  // Attach before connect so measured placement never sees empty toolbars.
  entries.forEach(({ element }) => layout.querySelector('[data-geokit-zone="top-end"]')!.appendChild(element));
  return layout;
}
