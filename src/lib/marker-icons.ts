import type { MarkerIconConfig, MarkerIconPoint } from "@src/types/public";

export const DEFAULT_MARKER_ICON_SIZE: MarkerIconPoint = [25, 41];
export const DEFAULT_MARKER_ICON_ANCHOR: MarkerIconPoint = [12, 41];
export const DEFAULT_MARKER_POPUP_ANCHOR: MarkerIconPoint = [1, -34];

export interface NormalizedMarkerIconConfig {
  iconUrl: string;
  iconRetinaUrl: string;
  shadowUrl?: string;
  iconSize: MarkerIconPoint;
  iconAnchor: MarkerIconPoint;
  popupAnchor: MarkerIconPoint;
}

interface NormalizationOptions {
  baseUrl?: string;
  reportError?: (message: string, cause?: unknown) => void;
}

interface MarkerIconAttributeValues {
  iconUrl?: string | null;
  iconRetinaUrl?: string | null;
  shadowUrl?: string | null;
  iconSize?: string | null;
  iconAnchor?: string | null;
  popupAnchor?: string | null;
}

function normalizeUrl(
  value: string | null | undefined,
  options: NormalizationOptions & {
    errorMessage: string;
    cause?: unknown;
  },
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    options.reportError?.(options.errorMessage, options.cause);
    return null;
  }

  try {
    return new URL(trimmed, options.baseUrl ?? document.baseURI).toString();
  } catch (error) {
    options.reportError?.(options.errorMessage, options.cause ?? error);
    return null;
  }
}

function normalizePointInput(
  value: unknown,
  defaults: MarkerIconPoint,
  options: NormalizationOptions & {
    errorMessage: string;
    cause?: unknown;
    positiveOnly?: boolean;
  },
): MarkerIconPoint {
  if (value == null) {
    return [...defaults] as MarkerIconPoint;
  }

  if (!Array.isArray(value) || value.length !== 2) {
    options.reportError?.(options.errorMessage, options.cause);
    return [...defaults] as MarkerIconPoint;
  }

  const [rawX, rawY] = value;
  const x = Number(rawX);
  const y = Number(rawY);
  const valid =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    (!options.positiveOnly || (x > 0 && y > 0));

  if (!valid) {
    options.reportError?.(options.errorMessage, options.cause);
    return [...defaults] as MarkerIconPoint;
  }

  return [x, y];
}

function parsePointAttribute(
  value: string | null | undefined,
  defaults: MarkerIconPoint,
  options: NormalizationOptions & {
    errorMessage: string;
    cause?: unknown;
    positiveOnly?: boolean;
  },
): MarkerIconPoint {
  if (value == null) {
    return [...defaults] as MarkerIconPoint;
  }

  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    options.reportError?.(options.errorMessage, options.cause);
    return [...defaults] as MarkerIconPoint;
  }

  const parts = trimmed.split(",");
  if (parts.length !== 2) {
    options.reportError?.(options.errorMessage, options.cause);
    return [...defaults] as MarkerIconPoint;
  }

  const x = Number(parts[0]?.trim());
  const y = Number(parts[1]?.trim());
  const valid =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    (!options.positiveOnly || (x > 0 && y > 0));

  if (!valid) {
    options.reportError?.(options.errorMessage, options.cause);
    return [...defaults] as MarkerIconPoint;
  }

  return [x, y];
}

export function normalizeMarkerIconConfig(
  config: MarkerIconConfig | null | undefined,
  options: NormalizationOptions = {},
): NormalizedMarkerIconConfig | null {
  if (!config || typeof config !== "object") {
    return null;
  }

  const iconUrl = normalizeUrl(config.iconUrl, {
    ...options,
    errorMessage: "Invalid marker icon config: iconUrl must be a valid URL",
    cause: { field: "iconUrl", value: (config as any).iconUrl },
  });
  if (!iconUrl) {
    return null;
  }

  const iconRetinaUrl =
    normalizeUrl(config.iconRetinaUrl, {
      ...options,
      errorMessage:
        "Invalid marker icon config: iconRetinaUrl must be a valid URL",
      cause: { field: "iconRetinaUrl", value: (config as any).iconRetinaUrl },
    }) ?? iconUrl;

  const shadowUrl =
    normalizeUrl(config.shadowUrl, {
      ...options,
      errorMessage: "Invalid marker icon config: shadowUrl must be a valid URL",
      cause: { field: "shadowUrl", value: (config as any).shadowUrl },
    }) ?? undefined;

  return {
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: normalizePointInput(config.iconSize, DEFAULT_MARKER_ICON_SIZE, {
      ...options,
      positiveOnly: true,
      errorMessage:
        "Invalid marker icon config: iconSize must be a [width, height] tuple of positive finite numbers",
      cause: { field: "iconSize", value: (config as any).iconSize },
    }),
    iconAnchor: normalizePointInput(
      config.iconAnchor,
      DEFAULT_MARKER_ICON_ANCHOR,
      {
        ...options,
        errorMessage:
          "Invalid marker icon config: iconAnchor must be a [x, y] tuple of finite numbers",
        cause: { field: "iconAnchor", value: (config as any).iconAnchor },
      },
    ),
    popupAnchor: normalizePointInput(
      config.popupAnchor,
      DEFAULT_MARKER_POPUP_ANCHOR,
      {
        ...options,
        errorMessage:
          "Invalid marker icon config: popupAnchor must be a [x, y] tuple of finite numbers",
        cause: { field: "popupAnchor", value: (config as any).popupAnchor },
      },
    ),
  };
}

export function normalizeMarkerIconAttributes(
  attributes: MarkerIconAttributeValues,
  options: NormalizationOptions = {},
): NormalizedMarkerIconConfig | null {
  const iconUrl = normalizeUrl(attributes.iconUrl, {
    ...options,
    errorMessage:
      'Invalid "marker-icon-url" attribute; falling back to default markers',
    cause: { attribute: "marker-icon-url", value: attributes.iconUrl },
  });
  if (!iconUrl) {
    return null;
  }

  const iconRetinaUrl =
    normalizeUrl(attributes.iconRetinaUrl, {
      ...options,
      errorMessage:
        'Invalid "marker-icon-retina-url" attribute; using "marker-icon-url" instead',
      cause: {
        attribute: "marker-icon-retina-url",
        value: attributes.iconRetinaUrl,
      },
    }) ?? iconUrl;

  const shadowUrl =
    normalizeUrl(attributes.shadowUrl, {
      ...options,
      errorMessage:
        'Invalid "marker-shadow-url" attribute; dropping the custom marker shadow',
      cause: { attribute: "marker-shadow-url", value: attributes.shadowUrl },
    }) ?? undefined;

  return {
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: parsePointAttribute(
      attributes.iconSize,
      DEFAULT_MARKER_ICON_SIZE,
      {
        ...options,
        positiveOnly: true,
        errorMessage:
          'Invalid "marker-icon-size" attribute; using the default marker size',
        cause: {
          attribute: "marker-icon-size",
          value: attributes.iconSize,
        },
      },
    ),
    iconAnchor: parsePointAttribute(
      attributes.iconAnchor,
      DEFAULT_MARKER_ICON_ANCHOR,
      {
        ...options,
        errorMessage:
          'Invalid "marker-icon-anchor" attribute; using the default marker anchor',
        cause: {
          attribute: "marker-icon-anchor",
          value: attributes.iconAnchor,
        },
      },
    ),
    popupAnchor: parsePointAttribute(
      attributes.popupAnchor,
      DEFAULT_MARKER_POPUP_ANCHOR,
      {
        ...options,
        errorMessage:
          'Invalid "marker-popup-anchor" attribute; using the default popup anchor',
        cause: {
          attribute: "marker-popup-anchor",
          value: attributes.popupAnchor,
        },
      },
    ),
  };
}
