import { h } from "preact";
import { useEffect, useMemo, useRef } from "preact/hooks";

import type { LeafletDrawMapElement } from "@src/components/LeafletDrawMapElement";
import { ensureLeafletGeoKitRegistered } from "@src/shims/ensure-element";

type Primitive = string | number | boolean | null | undefined;
type LeafletMode = "external" | "bundled";

const CHANGE_EVENTS = [
  "leaflet-draw:created",
  "leaflet-draw:edited",
  "leaflet-draw:deleted",
  "leaflet-draw:merged",
] as const;

export interface PreactLeafletGeoKitProps {
  className?: string;
  style?: string | Record<string, string | number>;

  /**
   * HTML attributes to apply to <leaflet-geokit>.
   * Boolean true => present attribute, false => removed.
   */
  attributes?: Record<string, Primitive>;

  /**
   * Override the default entrypoint mode:
   * - /preact defaults to external
   * - /preact-bundled defaults to bundled
   */
  externalLeaflet?: boolean;

  /** Optional explicit Leaflet namespace (window.L equivalent). */
  leafletInstance?: any;

  /** Initial GeoJSON text to load once on ready. */
  initialGeoJSONText?: string;

  /** Called whenever draw/edit/delete/merge occurs, with latest serialized FeatureCollection. */
  onChangeText?: (text: string) => void;
  /** Called with parsed FeatureCollection after sync, if parsing is desired by host. */
  onChangeGeoJSON?: (geoJSON: unknown) => void;
  /** Called if sync/load operations fail. */
  onError?: (error: Error) => void;

  /** Access underlying custom element instance. */
  onReady?: (element: LeafletDrawMapElement) => void;
}

function toStyleString(
  style?: string | Record<string, string | number>,
): string {
  if (!style) return "";
  if (typeof style === "string") return style;
  return Object.entries(style)
    .map(([key, value]) => `${key}: ${String(value)};`)
    .join(" ");
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown GeoKit Preact shim error");
}

function applyAttributes(
  element: LeafletDrawMapElement,
  attrs: Record<string, Primitive>,
): void {
  Object.entries(attrs).forEach(([name, value]) => {
    if (value === false || value === null || value === undefined) {
      element.removeAttribute(name);
      return;
    }
    if (value === true) {
      element.setAttribute(name, "");
      return;
    }
    element.setAttribute(name, String(value));
  });
}

function applyModeDefaults(
  element: LeafletDrawMapElement,
  mode: LeafletMode,
): void {
  if (mode === "external") {
    element.useExternalLeaflet = true;
    element.skipLeafletStyles = true;
    element.setAttribute("use-external-leaflet", "");
    element.setAttribute("skip-leaflet-styles", "");
    return;
  }

  element.useExternalLeaflet = false;
  element.skipLeafletStyles = false;
  element.removeAttribute("use-external-leaflet");
  element.removeAttribute("skip-leaflet-styles");
}

export function createPreactLeafletGeoKit(defaultMode: LeafletMode) {
  return function PreactLeafletGeoKit(props: PreactLeafletGeoKitProps) {
    const ref = useRef<LeafletDrawMapElement | null>(null);
    const styleText = useMemo(() => toStyleString(props.style), [props.style]);

    useEffect(() => {
      let disposed = false;
      let cleanup: (() => void) | undefined;

      void ensureLeafletGeoKitRegistered()
        .then(() => {
          if (disposed) return;

          const element = ref.current;
          if (!element) return;

          const mode =
            props.externalLeaflet != null
              ? props.externalLeaflet
                ? "external"
                : "bundled"
              : defaultMode;

          applyModeDefaults(element, mode);

          if (props.leafletInstance) {
            element.leafletInstance = props.leafletInstance;
          }

          if (props.attributes) {
            applyAttributes(element, props.attributes);
          }

          const sync = async () => {
            try {
              const geoJSON = await element.getGeoJSON();
              const text = JSON.stringify(geoJSON);
              props.onChangeText?.(text);
              props.onChangeGeoJSON?.(geoJSON);
            } catch (error) {
              props.onError?.(toError(error));
            }
          };

          const onReady = () => {
            props.onReady?.(element);
            if (props.initialGeoJSONText?.trim()) {
              void element
                .loadGeoJSONFromText(props.initialGeoJSONText)
                .then(() => sync())
                .catch((error: unknown) => props.onError?.(toError(error)));
            } else {
              void sync();
            }
          };

          const onChange = () => {
            void sync();
          };

          element.addEventListener("leaflet-draw:ready", onReady);
          CHANGE_EVENTS.forEach((eventName) => {
            element.addEventListener(eventName, onChange);
          });

          cleanup = () => {
            element.removeEventListener("leaflet-draw:ready", onReady);
            CHANGE_EVENTS.forEach((eventName) => {
              element.removeEventListener(eventName, onChange);
            });
          };
        })
        .catch((error: unknown) => {
          if (disposed) return;
          props.onError?.(toError(error));
        });

      return () => {
        disposed = true;
        cleanup?.();
      };
    }, [
      defaultMode,
      props.externalLeaflet,
      props.leafletInstance,
      props.attributes,
      props.initialGeoJSONText,
      props.onChangeText,
      props.onChangeGeoJSON,
      props.onError,
      props.onReady,
    ]);

    return h("leaflet-geokit", {
      ref,
      className: props.className,
      style: styleText,
    });
  };
}
