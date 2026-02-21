/**
 * Configuration for selecting and customizing a tile provider.
 */
export interface TileProviderConfig {
  /** Tile provider identifier (e.g., "osm", "here"). */
  provider: "osm" | "here" | string;
  /** Optional visual style name (used by style-capable providers like HERE). */
  style?: string;
  /** Optional API key used by authenticated providers like HERE Maps. */
  apiKey?: string;
  /** Optional attribution override for the selected provider. */
  attribution?: string;
}

/**
 * Resolved tile layer template configuration used to create a Leaflet tile layer.
 */
export interface TileURLTemplate {
  /** URL template containing Leaflet placeholders such as {z}, {x}, and {y}. */
  urlTemplate: string;
  /** Attribution string displayed on the map. */
  attribution: string;
  /** Maximum zoom level supported by the provider. */
  maxZoom?: number;
  /** Optional tile subdomains for providers that shard traffic by hostname. */
  subdomains?: string[];
}

/**
 * Provider configuration constants
 *
 * Defines URL templates, attributions, and provider-specific settings
 * for all supported tile providers.
 */
const PROVIDERS = {
  osm: {
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: ["a", "b", "c"],
  },
  here: {
    styles: {
      "lite.day": "lite.day",
      "normal.day": "normal.day",
      "satellite.day": "satellite.day",
    },
    defaultStyle: "lite.day",
    attribution: 'Map Tiles &copy; <a href="https://www.here.com">HERE</a>',
    maxZoom: 20,
  },
} as const;

/**
 * Build tile layer URL and metadata for the selected provider.
 *
 * HERE-specific behavior:
 * - Requires a non-empty API key
 * - Uses `lite.day` as default style when style is omitted/invalid
 */
export function buildTileURL(config: TileProviderConfig): TileURLTemplate {
  const { provider, style, apiKey, attribution } = config;

  switch (provider) {
    case "osm":
      return {
        urlTemplate: PROVIDERS.osm.urlTemplate,
        attribution: attribution || PROVIDERS.osm.attribution,
        maxZoom: PROVIDERS.osm.maxZoom,
        subdomains: [...PROVIDERS.osm.subdomains],
      };

    case "here": {
      if (!apiKey) {
        throw new Error("HERE Maps requires an API key");
      }

      const hereStyle =
        style && style in PROVIDERS.here.styles
          ? style
          : PROVIDERS.here.defaultStyle;

      return {
        urlTemplate: `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=${encodeURIComponent(hereStyle)}&apiKey=${encodeURIComponent(apiKey)}`,
        attribution: attribution || PROVIDERS.here.attribution,
        maxZoom: PROVIDERS.here.maxZoom,
        subdomains: undefined,
      };
    }

    default:
      throw new Error(`Unknown tile provider: ${provider}`);
  }
}

/**
 * Validate provider configuration before tile URL construction.
 *
 * Rules:
 * - `provider` is required
 * - HERE provider requires a non-empty `apiKey`
 */
export function validateProviderConfig(config: TileProviderConfig): {
  valid: boolean;
  error?: string;
} {
  const { provider, apiKey } = config;

  if (!provider) {
    return { valid: false, error: "Provider is required" };
  }

  if (provider === "here" && !apiKey) {
    return { valid: false, error: "HERE Maps requires an API key" };
  }

  return { valid: true };
}
