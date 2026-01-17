import "@src/index";

import type { LeafletDrawMapElement } from "@src/components/LeafletDrawMapElement";

const DEFAULT_SELECTOR = ".geokit-editor-widget";
const DEFAULT_HEIGHT = "400px";
const DEFAULT_ATTRIBUTE_PREFIX = "data-geokit-";

const CHANGE_EVENTS = [
  "leaflet-draw:created",
  "leaflet-draw:edited",
  "leaflet-draw:deleted",
  "leaflet-draw:merged",
] as const;

export type DjangoShimPhase = "mount" | "parse" | "sync";

export interface DjangoShimErrorContext {
  phase: DjangoShimPhase;
  textarea: HTMLTextAreaElement;
  element?: LeafletDrawMapElement;
}

export interface DjangoShimHandle {
  textarea: HTMLTextAreaElement;
  element: LeafletDrawMapElement;
  container: HTMLDivElement;
  sync: () => Promise<void>;
  destroy: () => void;
}

export interface DjangoShimOptions {
  selector?: string;
  height?: number | string;
  attributePrefix?: string;
  onError?: (error: Error, context: DjangoShimErrorContext) => void;
  onInit?: (handle: DjangoShimHandle) => void;
}

export function initDjangoGeokit(
  selectorOrOptions: string | DjangoShimOptions = DEFAULT_SELECTOR,
  maybeOptions?: DjangoShimOptions,
): DjangoShimHandle[] {
  const options = normalizeOptions(selectorOrOptions, maybeOptions);
  const selector = options.selector ?? DEFAULT_SELECTOR;
  const handles: DjangoShimHandle[] = [];

  const textareas = document.querySelectorAll<HTMLTextAreaElement>(selector);
  textareas.forEach((textarea) => {
    const handle = bindTextarea(textarea, options);
    if (handle) {
      handles.push(handle);
      options.onInit?.(handle);
    }
  });

  return handles;
}

function normalizeOptions(
  selectorOrOptions: string | DjangoShimOptions,
  maybeOptions?: DjangoShimOptions,
): DjangoShimOptions {
  if (typeof selectorOrOptions === "string") {
    return {
      selector: selectorOrOptions,
      ...maybeOptions,
    };
  }

  return selectorOrOptions ?? {};
}

function bindTextarea(
  textarea: HTMLTextAreaElement,
  options: DjangoShimOptions,
): DjangoShimHandle | null {
  if (textarea.dataset.geokitBound === "true") {
    return null;
  }

  const parent = textarea.parentElement;
  if (!parent) {
    options.onError?.(new Error("Textarea has no parent element"), {
      phase: "mount",
      textarea,
    });
    return null;
  }

  textarea.dataset.geokitBound = "true";

  const container = document.createElement("div");
  container.className = "geokit-editor-container";
  container.style.width = "100%";

  const element = document.createElement(
    "leaflet-geokit",
  ) as LeafletDrawMapElement;
  element.style.display = "block";
  element.style.width = "100%";
  element.style.height = resolveHeight(textarea, options);

  const attributePrefix = options.attributePrefix ?? DEFAULT_ATTRIBUTE_PREFIX;
  copyDataAttributes(textarea, element, attributePrefix);

  parent.insertBefore(container, textarea);
  container.appendChild(element);

  textarea.style.display = "none";
  textarea.setAttribute("aria-hidden", "true");

  const sync = async (): Promise<void> => {
    try {
      const geoJSON = await element.getGeoJSON();
      textarea.value = JSON.stringify(geoJSON);
    } catch (error) {
      options.onError?.(toError(error), {
        phase: "sync",
        textarea,
        element,
      });
    }
  };

  const onChange = () => {
    void sync();
  };

  CHANGE_EVENTS.forEach((eventName) => {
    element.addEventListener(eventName, onChange);
  });

  const initialValue = textarea.value.trim();
  let onReady: (() => void) | null = null;
  if (initialValue) {
    onReady = () => {
      void element
        .loadGeoJSONFromText(initialValue)
        .then(() => sync())
        .catch((error) => {
          options.onError?.(toError(error), {
            phase: "parse",
            textarea,
            element,
          });
        });
    };
    element.addEventListener("leaflet-draw:ready", onReady, { once: true });
  }

  const destroy = (): void => {
    CHANGE_EVENTS.forEach((eventName) => {
      element.removeEventListener(eventName, onChange);
    });
    if (onReady) {
      element.removeEventListener("leaflet-draw:ready", onReady);
    }
    textarea.style.display = "";
    textarea.removeAttribute("aria-hidden");
    delete textarea.dataset.geokitBound;
    container.remove();
  };

  return {
    textarea,
    element,
    container,
    sync,
    destroy,
  };
}

function resolveHeight(
  textarea: HTMLTextAreaElement,
  options: DjangoShimOptions,
): string {
  const attributePrefix = options.attributePrefix ?? DEFAULT_ATTRIBUTE_PREFIX;
  const rawHeight = textarea.getAttribute(`${attributePrefix}height`);
  const preferredHeight = rawHeight ?? options.height ?? DEFAULT_HEIGHT;

  if (typeof preferredHeight === "number") {
    return `${preferredHeight}px`;
  }

  const trimmed = preferredHeight.trim();
  if (!trimmed) {
    return DEFAULT_HEIGHT;
  }

  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  return trimmed;
}

function copyDataAttributes(
  textarea: HTMLTextAreaElement,
  element: HTMLElement,
  prefix: string,
): void {
  Array.from(textarea.attributes).forEach((attr) => {
    if (!attr.name.startsWith(prefix)) return;
    const name = attr.name.slice(prefix.length);
    if (!name || name === "height" || name === "bound") return;
    applyAttribute(element, name, attr.value);
  });
}

function applyAttribute(
  element: HTMLElement,
  name: string,
  value: string,
): void {
  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") {
    return;
  }

  if (!normalized || normalized === "true" || normalized === "1") {
    element.setAttribute(name, "");
    return;
  }

  element.setAttribute(name, value);
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(
    typeof error === "string" ? error : "Unknown GeoKit Django shim error",
  );
}

declare global {
  interface Window {
    GeoKitDjango?: {
      init: typeof initDjangoGeokit;
    };
  }
}

if (typeof window !== "undefined") {
  window.GeoKitDjango = {
    init: initDjangoGeokit,
  };
}
