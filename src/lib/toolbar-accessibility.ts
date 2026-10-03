/** Keyboard support shared by native Leaflet anchors and managed toolbars. */
const installed = new WeakSet<HTMLElement>();
const controlSelector = "button, a[href], [role='button']";

export function installToolbarAccessibility(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(".leaflet-draw-toolbar")
    .forEach((toolbar, index) => {
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute(
        "aria-label",
        index === 0 ? "Draw tools" : "Edit tools",
      );
      toolbar.setAttribute("aria-orientation", "vertical");
    });
  container
    .querySelectorAll<HTMLElement>("[data-geokit-tool]")
    .forEach((button) => {
      if (!button.matches(controlSelector) && !button.matches(".leaflet-ruler"))
        return;
      if (button.tagName !== "BUTTON") {
        button.setAttribute("role", "button");
        button.tabIndex = 0;
      }
      if (!button.hasAttribute("aria-label")) {
        button.setAttribute(
          "aria-label",
          button.title || button.dataset.geokitTool || "Map tool",
        );
      }
    });
  if (installed.has(container)) return;
  installed.add(container);
  container.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLElement>(controlSelector);
    if (!button || !container.contains(button)) return;
    if (
      (event.key === " " || event.key === "Enter") &&
      button.tagName !== "BUTTON" &&
      button.getAttribute("role") === "button"
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && button.getAttribute("aria-disabled") !== "true")
        button.click();
      return;
    }
    const toolbar = button.closest<HTMLElement>("[role='toolbar']");
    if (!toolbar) return;
    const vertical = toolbar.getAttribute("aria-orientation") === "vertical";
    const next = vertical ? "ArrowDown" : "ArrowRight";
    const previous = vertical ? "ArrowUp" : "ArrowLeft";
    if (![next, previous, "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      toolbar.querySelectorAll<HTMLElement>(controlSelector),
    ).filter(
      (candidate) =>
        !candidate.matches(":disabled, [aria-disabled='true'], [hidden]") &&
        !candidate.closest("[hidden]") &&
        getComputedStyle(candidate).display !== "none",
    );
    const index = buttons.indexOf(button);
    if (index < 0 || !buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    const destination =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === next ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[destination].focus();
  });
}

/** Persistent live regions: never inject HTML from tool errors or host labels. */
export function announceToolStatus(
  container: HTMLElement,
  message: string,
  error = false,
): void {
  const role = error ? "alert" : "status";
  let region = container.querySelector<HTMLElement>(
    `[data-geokit-announcement='${role}']`,
  );
  if (!region) {
    region = document.createElement("div");
    region.dataset.geokitAnnouncement = role;
    region.setAttribute("role", role);
    region.setAttribute("aria-live", error ? "assertive" : "polite");
    region.setAttribute("aria-atomic", "true");
    region.className = "leaflet-geokit-sr-only";
    container.append(region);
  }
  region.textContent = message;
}
