import type {
  ToolButtonConfig,
  ToolButtonName,
  ToolToolbarGroupConfig,
  ToolToolbarPosition,
} from "@src/types/public";

interface ToolButtonTarget {
  selectors: readonly string[];
  dataTool: string;
}

export interface ToolButtonTriggerContext {
  source: "toolbar" | "leaflet-toolbar";
  groupId?: string;
  activate: boolean;
}

export interface ApplyToolButtonOptions {
  toolbarGroups?: ToolToolbarGroupConfig[] | null;
  onTrigger?: (tool: ToolButtonName, context: ToolButtonTriggerContext) => void;
}

const TOOL_BUTTON_TARGETS: Record<ToolButtonName, ToolButtonTarget> = {
  polygon: {
    selectors: ["a.leaflet-draw-draw-polygon"],
    dataTool: "polygon",
  },
  polyline: {
    selectors: ["a.leaflet-draw-draw-polyline"],
    dataTool: "polyline",
  },
  rectangle: {
    selectors: ["a.leaflet-draw-draw-rectangle"],
    dataTool: "rectangle",
  },
  circle: {
    selectors: ["a.leaflet-draw-draw-circle"],
    dataTool: "circle",
  },
  marker: {
    selectors: ["a.leaflet-draw-draw-marker"],
    dataTool: "marker",
  },
  layerCake: {
    selectors: ["a.leaflet-draw-draw-cake"],
    dataTool: "layer-cake",
  },
  move: {
    selectors: ["a.leaflet-draw-draw-move"],
    dataTool: "move",
  },
  select: {
    selectors: [],
    dataTool: "select",
  },
  edit: {
    selectors: ["a.leaflet-draw-edit-edit"],
    dataTool: "edit",
  },
  delete: {
    selectors: ["a.leaflet-draw-edit-remove"],
    dataTool: "delete",
  },
  ruler: {
    selectors: [".leaflet-ruler", "a.leaflet-ruler"],
    dataTool: "ruler",
  },
  measurementSettings: {
    selectors: [".leaflet-ruler-settings-button"],
    dataTool: "measurement-settings",
  },
  layerStyle: {
    selectors: [],
    dataTool: "layer-style",
  },
  save: {
    selectors: [],
    dataTool: "save",
  },
};

const TOOL_BUTTON_NAMES = Object.keys(TOOL_BUTTON_TARGETS) as ToolButtonName[];

const CUSTOM_ICON_CLASS = "leaflet-geokit-tool-button-icon";
const BUILT_IN_ICON_SELECTOR =
  ".leaflet-geokit-cake-icon, .leaflet-geokit-move-icon";
const CUSTOM_TOOLBAR_SELECTOR = "[data-geokit-managed-toolbar='true']";
const CUSTOM_POPOVER_SELECTOR = "[data-geokit-tool-popover='true']";
const EXPANDED_TOOL_BUTTON_SELECTOR =
  "[data-geokit-tool][aria-expanded='true']";
const triggerListeners = new WeakMap<HTMLElement, EventListener>();
const popoverCloseListeners = new WeakMap<
  HTMLElement,
  {
    keydown: EventListener;
    pointerdown: EventListener;
    pointerdownTimer: number;
  }
>();
const popoverContexts = new WeakMap<
  HTMLElement,
  {
    tool: ToolButtonName;
    groupId?: string;
    button: HTMLElement;
    config: NonNullable<ToolButtonConfig[ToolButtonName]>;
  }
>();

export function applyToolButtonConfig(
  container: HTMLElement,
  config: ToolButtonConfig | null | undefined,
  options: ApplyToolButtonOptions = {},
): void {
  closeToolPopover(container);
  for (const name of TOOL_BUTTON_NAMES) {
    const target = TOOL_BUTTON_TARGETS[name];
    for (const button of findButtons(container, target.selectors)) {
      button.setAttribute("data-geokit-tool", target.dataTool);
      resetManagedButton(button);

      const buttonConfig = config?.[name];
      if (buttonConfig) {
        applyButtonConfig(button, buttonConfig, name);
      }
      bindTrigger(button, name, {
        source: "leaflet-toolbar",
        activate: false,
        onTrigger: options.onTrigger,
      });
    }
  }

  renderToolbarGroups(container, config, options);
}

function findButtons(
  container: HTMLElement,
  selectors: readonly string[],
): HTMLElement[] {
  const buttons = new Set<HTMLElement>();
  for (const selector of selectors) {
    container.querySelectorAll<HTMLElement>(selector).forEach((button) => {
      buttons.add(button);
    });
  }
  return [...buttons];
}

function resetManagedButton(button: HTMLElement): void {
  const triggerListener = triggerListeners.get(button);
  if (triggerListener) {
    button.removeEventListener("click", triggerListener);
    triggerListeners.delete(button);
  }
  delete (
    button as HTMLElement & {
      __geokitToolButtonConfig?: NonNullable<ToolButtonConfig[ToolButtonName]>;
    }
  ).__geokitToolButtonConfig;

  const previousClasses = splitClasses(button.dataset.geokitToolButtonClass);
  if (previousClasses.length > 0) {
    button.classList.remove(...previousClasses);
  }
  delete button.dataset.geokitToolButtonClass;
  button.removeAttribute("data-geokit-custom-tool-button");

  if (button.dataset.geokitOriginalTitle !== undefined) {
    restoreStringAttribute(button, "title", button.dataset.geokitOriginalTitle);
  }
  if (button.dataset.geokitOriginalAriaLabel !== undefined) {
    restoreStringAttribute(
      button,
      "aria-label",
      button.dataset.geokitOriginalAriaLabel,
    );
  }
  if (button.dataset.geokitOriginalStyleBackgroundImage !== undefined) {
    restoreStyleProperty(
      button,
      "background-image",
      button.dataset.geokitOriginalStyleBackgroundImage,
      button.dataset.geokitOriginalStyleBackgroundImagePriority,
    );
  }
  if (button.dataset.geokitOriginalStylePosition !== undefined) {
    restoreStyleProperty(
      button,
      "position",
      button.dataset.geokitOriginalStylePosition,
      button.dataset.geokitOriginalStylePositionPriority,
    );
  }

  Array.from(button.children).forEach((child) => {
    if (
      child instanceof HTMLElement &&
      child.dataset.geokitToolButtonIcon === "true"
    ) {
      child.remove();
    }
  });

  button
    .querySelectorAll<HTMLElement>(BUILT_IN_ICON_SELECTOR)
    .forEach((icon) => {
      icon.hidden = false;
    });

  button.removeAttribute("aria-expanded");
}

function restoreStringAttribute(
  element: HTMLElement,
  name: string,
  value: string | undefined,
): void {
  if (value) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}

function restoreStyleProperty(
  element: HTMLElement,
  name: string,
  value: string | undefined,
  priority: string | undefined,
): void {
  if (value) {
    element.style.setProperty(name, value, priority);
  } else {
    element.style.removeProperty(name);
  }
}

function applyButtonConfig(
  button: HTMLElement,
  config: NonNullable<ToolButtonConfig[ToolButtonName]>,
  tool: ToolButtonName,
): void {
  captureOriginalAttributes(button);
  (
    button as HTMLElement & {
      __geokitToolButtonConfig?: NonNullable<ToolButtonConfig[ToolButtonName]>;
    }
  ).__geokitToolButtonConfig = config;
  button.setAttribute("data-geokit-custom-tool-button", "true");

  if (config.title) {
    button.setAttribute("title", config.title);
  }

  const ariaLabel = config.ariaLabel ?? config.title;
  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
  }

  const classes = splitClasses(config.className);
  if (classes.length > 0) {
    button.classList.add(...classes);
    button.dataset.geokitToolButtonClass = classes.join(" ");
  }

  if (config.iconUrl) {
    applyButtonIcon(button, config, { tool });
  } else if (config.iconHtml || config.renderIcon) {
    applyButtonIcon(button, config, { tool });
  }
}

function captureOriginalAttributes(button: HTMLElement): void {
  if (button.dataset.geokitOriginalTitle === undefined) {
    button.dataset.geokitOriginalTitle = button.getAttribute("title") ?? "";
  }
  if (button.dataset.geokitOriginalAriaLabel === undefined) {
    button.dataset.geokitOriginalAriaLabel =
      button.getAttribute("aria-label") ?? "";
  }
  if (button.dataset.geokitOriginalStyleBackgroundImage === undefined) {
    button.dataset.geokitOriginalStyleBackgroundImage =
      button.style.getPropertyValue("background-image");
    button.dataset.geokitOriginalStyleBackgroundImagePriority =
      button.style.getPropertyPriority("background-image");
  }
  if (button.dataset.geokitOriginalStylePosition === undefined) {
    button.dataset.geokitOriginalStylePosition =
      button.style.getPropertyValue("position");
    button.dataset.geokitOriginalStylePositionPriority =
      button.style.getPropertyPriority("position");
  }
}

function splitClasses(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasButtonIcon(
  config: NonNullable<ToolButtonConfig[ToolButtonName]>,
): boolean {
  return Boolean(config.iconUrl || config.iconHtml || config.renderIcon);
}

function applyButtonIcon(
  button: HTMLElement,
  config: NonNullable<ToolButtonConfig[ToolButtonName]>,
  context: { tool?: ToolButtonName; groupId?: string } = {},
): void {
  const [width, height] = resolveIconSize(config.iconSize);

  button.style.setProperty("background-image", "none", "important");
  button.style.setProperty("position", "relative", "important");

  button
    .querySelectorAll<HTMLElement>(BUILT_IN_ICON_SELECTOR)
    .forEach((icon) => {
      icon.hidden = true;
    });

  const icon = document.createElement("span");
  icon.className = CUSTOM_ICON_CLASS;
  icon.dataset.geokitToolButtonIcon = "true";
  icon.setAttribute("aria-hidden", "true");
  icon.style.setProperty("position", "absolute", "important");
  icon.style.setProperty("display", "block", "important");
  icon.style.setProperty("left", "50%", "important");
  icon.style.setProperty("top", "50%", "important");
  icon.style.setProperty("width", `${width}px`, "important");
  icon.style.setProperty("height", `${height}px`, "important");
  icon.style.setProperty("transform", "translate(-50%, -50%)", "important");
  icon.style.setProperty("pointer-events", "none", "important");

  const rendered = config.renderIcon?.({
    tool: context.tool ?? "polygon",
    groupId: context.groupId,
    button,
  });

  const isElement =
    rendered instanceof HTMLElement ||
    (typeof SVGElement !== "undefined" && rendered instanceof SVGElement);
  if (isElement) {
    icon.appendChild(rendered);
  } else if (typeof rendered === "string" && rendered.trim()) {
    icon.innerHTML = rendered;
    styleInlineIconChild(icon);
  } else if (config.iconHtml) {
    icon.innerHTML = config.iconHtml;
    styleInlineIconChild(icon);
  } else if (config.iconUrl) {
    const img = document.createElement("img");
    img.src = config.iconUrl;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.style.setProperty("display", "block", "important");
    img.style.setProperty("width", "100%", "important");
    img.style.setProperty("height", "100%", "important");
    img.style.setProperty("object-fit", "contain", "important");
    icon.appendChild(img);
  }

  button.appendChild(icon);
}

function styleInlineIconChild(icon: HTMLElement): void {
  const child = icon.firstElementChild as HTMLElement | SVGElement | null;
  if (!child) return;
  child.style.setProperty("display", "block", "important");
  child.style.setProperty("width", "100%", "important");
  child.style.setProperty("height", "100%", "important");
  child.style.setProperty("color", "currentColor", "important");
}

function resolveIconSize(
  iconSize: readonly [number, number] | undefined,
): [number, number] {
  const width = iconSize?.[0];
  const height = iconSize?.[1];
  if (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return [width, height];
  }

  return [18, 18];
}

function bindTrigger(
  button: HTMLElement,
  tool: ToolButtonName,
  options: {
    source: ToolButtonTriggerContext["source"];
    activate: boolean;
    groupId?: string;
    onTrigger?: ApplyToolButtonOptions["onTrigger"];
  },
): void {
  const listener: EventListener = (event) => {
    const config = resolveButtonConfig(button);
    const container = closestManagedContainer(button);
    if (config?.popover) {
      showToolPopover(button, tool, config, {
        container,
        groupId: options.groupId,
      });
    } else {
      closeToolPopover(container);
    }

    options.onTrigger?.(tool, {
      source: options.source,
      groupId: options.groupId,
      activate: options.activate,
    });

    if (options.activate) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  button.addEventListener("click", listener);
  triggerListeners.set(button, listener);
}

function resolveButtonConfig(
  button: HTMLElement,
): NonNullable<ToolButtonConfig[ToolButtonName]> | null {
  const registry = (
    button as HTMLElement & {
      __geokitToolButtonConfig?: NonNullable<ToolButtonConfig[ToolButtonName]>;
    }
  ).__geokitToolButtonConfig;
  if (registry) return registry;
  const json = button.dataset.geokitToolButtonConfig;
  if (!json) return null;
  try {
    return JSON.parse(json) as NonNullable<ToolButtonConfig[ToolButtonName]>;
  } catch {
    return null;
  }
}

function closestManagedContainer(button: HTMLElement): HTMLElement {
  const container = button.closest<HTMLElement>("[data-geokit-map-container]");
  return container ?? (button.parentElement as HTMLElement) ?? button;
}

function renderToolbarGroups(
  container: HTMLElement,
  config: ToolButtonConfig | null | undefined,
  options: ApplyToolButtonOptions,
): void {
  container.setAttribute("data-geokit-map-container", "true");
  container
    .querySelectorAll<HTMLElement>(CUSTOM_TOOLBAR_SELECTOR)
    .forEach((toolbar) => toolbar.remove());

  const groups = options.toolbarGroups ?? [];
  const shouldHideDefaultToolbar = groups.some(
    (group) => group?.hideDefaultToolbar !== false,
  );
  setDefaultToolbarsHidden(container, shouldHideDefaultToolbar);

  groups.forEach((group) => {
    if (!group?.id || !Array.isArray(group.tools) || group.tools.length === 0) {
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.dataset.geokitManagedToolbar = "true";
    toolbar.dataset.geokitToolbarGroup = group.id;
    toolbar.className = "leaflet-geokit-toolbar-group leaflet-bar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", group.ariaLabel ?? group.id);
    applyToolbarPosition(toolbar, group.position, group.offset);

    const classes = splitClasses(group.className);
    if (classes.length > 0) {
      toolbar.classList.add(...classes);
    }

    group.tools.forEach((tool, index) => {
      const button = createToolbarButton(tool, group, index, config?.[tool]);
      bindTrigger(button, tool, {
        source: "toolbar",
        activate: true,
        groupId: group.id,
        onTrigger: options.onTrigger,
      });
      toolbar.appendChild(button);
    });

    container.appendChild(toolbar);
  });
}

function setDefaultToolbarsHidden(
  container: HTMLElement,
  hidden: boolean,
): void {
  container.toggleAttribute("data-geokit-default-toolbar-hidden", hidden);
  container
    .querySelectorAll<HTMLElement>(
      ".leaflet-draw-toolbar, .leaflet-ruler, .leaflet-ruler-settings-control",
    )
    .forEach((toolbar) => {
      if (hidden) {
        if (toolbar.dataset.geokitOriginalDisplay === undefined) {
          toolbar.dataset.geokitOriginalDisplay = toolbar.style.display;
          toolbar.dataset.geokitOriginalDisplayPriority =
            toolbar.style.getPropertyPriority("display");
        }
        toolbar.style.setProperty("display", "none", "important");
      } else if (toolbar.dataset.geokitOriginalDisplay !== undefined) {
        restoreStyleProperty(
          toolbar,
          "display",
          toolbar.dataset.geokitOriginalDisplay,
          toolbar.dataset.geokitOriginalDisplayPriority,
        );
        delete toolbar.dataset.geokitOriginalDisplay;
        delete toolbar.dataset.geokitOriginalDisplayPriority;
      }
    });
}

function createToolbarButton(
  tool: ToolButtonName,
  group: ToolToolbarGroupConfig,
  index: number,
  config: ToolButtonConfig[ToolButtonName] | undefined,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.geokitTool = TOOL_BUTTON_TARGETS[tool]?.dataTool ?? tool;
  button.dataset.geokitToolbarGroup = group.id;
  button.dataset.geokitToolbarPosition = group.position ?? "topright";
  button.dataset.geokitToolInstance = buildToolInstanceId(
    group.id,
    tool,
    index,
  );
  button.className = "leaflet-geokit-toolbar-button";
  button.style.setProperty("display", "block", "important");
  button.style.setProperty("width", "34px", "important");
  button.style.setProperty("height", "34px", "important");
  button.style.setProperty("padding", "0", "important");
  button.style.setProperty("border", "0", "important");
  button.style.setProperty("border-bottom", "1px solid #ccc", "important");
  button.style.setProperty("background", "#fff", "important");
  button.style.setProperty("cursor", "pointer", "important");
  button.style.setProperty("position", "relative", "important");

  const title = config?.title ?? defaultToolTitle(tool);
  button.title = title;
  button.setAttribute("aria-label", config?.ariaLabel ?? title);

  const classes = splitClasses(config?.className);
  if (classes.length > 0) {
    button.classList.add(...classes);
  }

  if (config) {
    (
      button as HTMLButtonElement & {
        __geokitToolButtonConfig?: NonNullable<
          ToolButtonConfig[ToolButtonName]
        >;
      }
    ).__geokitToolButtonConfig = config;
    if (hasButtonIcon(config)) {
      applyButtonIcon(button, config, { tool, groupId: group.id });
    }
  }

  if (!button.querySelector(`.${CUSTOM_ICON_CLASS}`)) {
    const fallbackConfig: NonNullable<ToolButtonConfig[ToolButtonName]> = {
      iconHtml: defaultToolIcon(tool),
      iconSize: [20, 20],
    };
    applyButtonIcon(button, fallbackConfig, { tool, groupId: group.id });
  }

  return button;
}

function applyToolbarPosition(
  toolbar: HTMLElement,
  position: ToolToolbarPosition = "topright",
  offset: readonly [number, number] | undefined,
): void {
  const [x, y] = resolveOffset(offset);
  toolbar.style.setProperty("position", "absolute", "important");
  toolbar.style.setProperty("z-index", "1000", "important");
  toolbar.style.setProperty("background", "#fff", "important");
  toolbar.style.setProperty(
    "box-shadow",
    "0 1px 5px rgba(0,0,0,0.35)",
    "important",
  );

  const [vertical, horizontal] = position.startsWith("bottom")
    ? ["bottom", position.endsWith("right") ? "right" : "left"]
    : ["top", position.endsWith("right") ? "right" : "left"];
  toolbar.style.setProperty(vertical, `${y}px`, "important");
  toolbar.style.setProperty(horizontal, `${x}px`, "important");
}

function showToolPopover(
  button: HTMLElement,
  tool: ToolButtonName,
  config: NonNullable<ToolButtonConfig[ToolButtonName]>,
  options: {
    container: HTMLElement;
    groupId?: string;
  },
): void {
  if (!config.popover) return;
  closeToolPopover(options.container);

  const popover = document.createElement("div");
  popover.dataset.geokitToolPopover = "true";
  popover.dataset.geokitTool = TOOL_BUTTON_TARGETS[tool]?.dataTool ?? tool;
  if (button.dataset.geokitToolInstance) {
    popover.dataset.geokitToolInstance = button.dataset.geokitToolInstance;
  }
  if (options.groupId) {
    popover.dataset.geokitToolbarGroup = options.groupId;
  }
  popover.setAttribute("role", "dialog");
  popover.setAttribute(
    "aria-label",
    config.popover.ariaLabel ?? config.popover.title ?? defaultToolTitle(tool),
  );
  popover.style.setProperty("position", "absolute", "important");
  popover.style.setProperty("z-index", "10001", "important");
  popover.style.setProperty("max-width", "260px", "important");
  popover.style.setProperty("padding", "10px 12px", "important");
  popover.style.setProperty(
    "border",
    "1px solid rgba(0,0,0,0.22)",
    "important",
  );
  popover.style.setProperty("border-radius", "8px", "important");
  popover.style.setProperty("background", "#fff", "important");
  popover.style.setProperty(
    "box-shadow",
    "0 8px 24px rgba(0,0,0,0.24)",
    "important",
  );
  popover.style.setProperty("font", "13px system-ui, sans-serif", "important");
  popover.style.setProperty("line-height", "1.35", "important");

  if (config.popover.title) {
    const title = document.createElement("strong");
    title.textContent = config.popover.title;
    title.style.setProperty("display", "block", "important");
    title.style.setProperty("margin-bottom", "4px", "important");
    popover.appendChild(title);
  }

  if (config.popover.body) {
    const body = document.createElement("div");
    body.textContent = config.popover.body;
    popover.appendChild(body);
  }

  if (config.popover.html) {
    const html = document.createElement("div");
    html.innerHTML = config.popover.html;
    popover.appendChild(html);
  }

  const rendered = config.popover.render?.({
    tool,
    groupId: options.groupId,
    button,
    popover,
  });
  const isFragment =
    typeof DocumentFragment !== "undefined" &&
    rendered instanceof DocumentFragment;
  if (rendered instanceof HTMLElement || isFragment) {
    popover.appendChild(rendered);
  } else if (typeof rendered === "string" && rendered.trim()) {
    const html = document.createElement("div");
    html.innerHTML = rendered;
    popover.appendChild(html);
  }

  options.container.appendChild(popover);
  placePopover(options.container, button, popover);
  button.setAttribute("aria-expanded", "true");
  popoverContexts.set(popover, {
    tool,
    groupId: options.groupId,
    button,
    config,
  });
  bindPopoverCloseEvents(options.container, button, popover);

  config.popover.onOpen?.({
    tool,
    groupId: options.groupId,
    button,
    popover,
  });
}

function placePopover(
  container: HTMLElement,
  button: HTMLElement,
  popover: HTMLElement,
): void {
  const containerRect = container.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(
      buttonRect.left - containerRect.left,
      containerRect.width - popover.offsetWidth - 8,
    ),
  );
  const top = Math.max(
    8,
    Math.min(
      buttonRect.bottom - containerRect.top + 8,
      containerRect.height - popover.offsetHeight - 8,
    ),
  );
  popover.style.setProperty("left", `${left}px`, "important");
  popover.style.setProperty("top", `${top}px`, "important");
}

function bindPopoverCloseEvents(
  container: HTMLElement,
  button: HTMLElement,
  popover: HTMLElement,
): void {
  const keydown: EventListener = (event) => {
    if ((event as KeyboardEvent).key === "Escape") {
      closeToolPopover(container);
    }
  };
  const pointerdown: EventListener = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (popover.contains(target) || button.contains(target)) {
      return;
    }

    closeToolPopover(container);
  };

  document.addEventListener("keydown", keydown, true);
  const pointerdownTimer = window.setTimeout(() => {
    if (popover.isConnected) {
      document.addEventListener("pointerdown", pointerdown, true);
    }
  }, 0);
  popoverCloseListeners.set(popover, {
    keydown,
    pointerdown,
    pointerdownTimer,
  });
}

function closeToolPopover(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(CUSTOM_POPOVER_SELECTOR)
    .forEach((popover) => {
      const context = popoverContexts.get(popover);
      context?.button.removeAttribute("aria-expanded");
      if (!context) {
        findPopoverTrigger(container, popover)?.removeAttribute(
          "aria-expanded",
        );
      }

      const listeners = popoverCloseListeners.get(popover);
      if (listeners) {
        window.clearTimeout(listeners.pointerdownTimer);
        document.removeEventListener("keydown", listeners.keydown, true);
        document.removeEventListener(
          "pointerdown",
          listeners.pointerdown,
          true,
        );
        popoverCloseListeners.delete(popover);
      }

      popover.remove();
      if (context) {
        context.config.popover?.onClose?.({
          tool: context.tool,
          groupId: context.groupId,
          button: context.button,
          popover,
        });
        popoverContexts.delete(popover);
      }
    });
}

function findPopoverTrigger(
  container: HTMLElement,
  popover: HTMLElement,
): HTMLElement | null {
  const buttons = container.querySelectorAll<HTMLElement>(
    EXPANDED_TOOL_BUTTON_SELECTOR,
  );

  for (const button of buttons) {
    if (
      popover.dataset.geokitToolInstance &&
      button.dataset.geokitToolInstance === popover.dataset.geokitToolInstance
    ) {
      return button;
    }

    if (
      button.dataset.geokitTool === popover.dataset.geokitTool &&
      button.dataset.geokitToolbarGroup === popover.dataset.geokitToolbarGroup
    ) {
      return button;
    }
  }

  return null;
}

function buildToolInstanceId(
  groupId: string,
  tool: ToolButtonName,
  index: number,
): string {
  return `${groupId}:${tool}:${index}`;
}

function defaultToolTitle(tool: ToolButtonName): string {
  return (
    {
      polygon: "Draw polygon",
      polyline: "Draw line",
      rectangle: "Draw rectangle",
      circle: "Draw circle",
      marker: "Place marker",
      layerCake: "Draw layer cake",
      move: "Move feature",
      select: "Select feature",
      edit: "Edit features",
      delete: "Delete features",
      ruler: "Measure distance",
      measurementSettings: "Measurement settings",
      layerStyle: "Layer style",
      save: "Save map geometry",
    } satisfies Record<ToolButtonName, string>
  )[tool];
}

function defaultToolIcon(tool: ToolButtonName): string {
  const stroke = "currentColor";
  const fill = "none";
  return (
    {
      polygon: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"><path d="M5.5 7.2 9.2 4.8 18.5 8.3 16.1 18.2 6.3 15.7Z"/><circle cx="5.5" cy="7.2" r="1.2" fill="currentColor"/><circle cx="18.5" cy="8.3" r="1.2" fill="currentColor"/><circle cx="16.1" cy="18.2" r="1.2" fill="currentColor"/></svg>`,
      polyline: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 16.7 9.2 9.5 14.4 13.1 19 6.1"/><circle cx="4.8" cy="16.7" r="1.3" fill="currentColor"/><circle cx="14.4" cy="13.1" r="1.3" fill="currentColor"/><circle cx="19" cy="6.1" r="1.3" fill="currentColor"/></svg>`,
      rectangle: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.8"><rect x="5.5" y="6.5" width="13" height="11" rx="2"/><path d="M8.5 10h7"/></svg>`,
      circle: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.8"><circle cx="12" cy="12" r="6.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
      marker: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.4a6 6 0 0 0-6 6c0 4.2 4.5 9.4 5.6 10.5a.6.6 0 0 0 .8 0C13.5 18.8 18 13.6 18 9.4a6 6 0 0 0-6-6Z"/><circle cx="12" cy="9.5" r="2.1" fill="currentColor" stroke="none"/></svg>`,
      layerCake: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round"><ellipse cx="12" cy="7.6" rx="6.8" ry="2.7"/><path d="M5.2 11c1.3 1.2 3.8 2 6.8 2s5.5-.8 6.8-2M6.3 15c1.3.9 3.3 1.5 5.7 1.5s4.4-.6 5.7-1.5"/></svg>`,
      move: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M4 12h16M12 4l-2 2M12 4l2 2M20 12l-2-2M20 12l-2 2M12 20l-2-2M12 20l2-2M4 12l2-2M4 12l2 2"/></svg>`,
      select: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"><path d="M6 4.8 18.5 12 13 13.4 10.2 19Z"/></svg>`,
      edit: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"><path d="m6 17.8 3.5-.7 7.7-7.7-2.8-2.8-7.7 7.7Z"/><path d="m12.9 7.9 2.8 2.8"/></svg>`,
      delete: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 8.2h9l-.8 10a1.7 1.7 0 0 1-1.7 1.5h-4a1.7 1.7 0 0 1-1.7-1.5Z"/><path d="M9.5 8.2V6.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.4M10.5 11.5v4.8M13.5 11.5v4.8"/></svg>`,
      ruler: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"><path d="M5.2 17.8 17.8 5.2l1.7 1.7L6.9 19.5H5.2Z"/><path d="m12.2 8 1.5 1.5M9.9 10.3l1.5 1.5M7.6 12.6l1.5 1.5"/></svg>`,
      measurementSettings: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 4.8v2M12 17.2v2M4.8 12h2M17.2 12h2M7 7l1.4 1.4M15.6 15.6 17 17M17 7l-1.4 1.4M8.4 15.6 7 17"/></svg>`,
      layerStyle: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 6h14v3H5z" fill="currentColor" opacity=".9"/><path d="M5 11h14v3H5z" fill="currentColor" opacity=".65"/><path d="M5 16h14v3H5z" fill="currentColor" opacity=".4"/></svg>`,
      save: `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M5.5 4.8h11.2l1.8 1.8v12.6h-13Z"/><path d="M8 4.8v5h7v-5M8.2 19.2v-5.4h7.6v5.4"/><path d="M10 16.4h4"/></svg>`,
    } satisfies Record<ToolButtonName, string>
  )[tool];
}

function resolveOffset(
  offset: readonly [number, number] | undefined,
): [number, number] {
  const x = offset?.[0];
  const y = offset?.[1];
  if (
    typeof x === "number" &&
    Number.isFinite(x) &&
    x >= 0 &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    y >= 0
  ) {
    return [x, y];
  }

  return [10, 10];
}
