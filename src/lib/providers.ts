import type * as Leaflet from "leaflet";
import { buildTileURL } from "./TileProviderFactory";
import type {
  TileProviderConfig,
  TileURLTemplate,
} from "./TileProviderFactory";

/** Technical potential is not a license to cache a vendor's data. */
export type OfflineSupport = "unsupported" | "host-managed" | "unknown";
export type ApiKeyRequirement = "none" | "required" | "host-defined";

export interface ProviderCapabilities {
  attributionRequired: boolean;
  offline: OfflineSupport;
  apiKey: ApiKeyRequirement;
}

/** Raster resolution does not own the map or drawing engine. */
export interface RasterTileProvider {
  kind: "raster";
  capabilities: ProviderCapabilities;
  resolve(): TileURLTemplate;
}

/** An optional renderer bridge must return a fresh, unmounted Leaflet layer.
 * The layer owns renderer/event cleanup in onRemove. Global protocols are host-owned.
 */
export interface VectorBasemapProvider {
  kind: "vector";
  capabilities: ProviderCapabilities;
  createLayer(leaflet: typeof Leaflet): Leaflet.Layer;
}

export type BasemapProvider = RasterTileProvider | VectorBasemapProvider;

/** Drawing is independent of basemap vendors; native renderer replacements
 * must implement this separate port before claiming drawing parity.
 */
export interface DrawEngineAdapter<TContext, TDocument, TCommand> {
  attach(context: TContext): void;
  read(): TDocument;
  write(document: TDocument): void;
  execute(command: TCommand): boolean;
  dispose(): void;
}

export interface ProviderDiagnostics {
  kind: "raster" | "vector";
  attribution: "present" | "missing";
  attributionRequired: boolean;
  offline: OfflineSupport;
  apiKey: ApiKeyRequirement;
  drawing: "leaflet-draw";
  /** Static capability report, not a network/credentials/renderer health probe. */
  scope: "configuration";
}

/** Explicit field selection: never return URL, style, key, or arbitrary provider metadata. */
export function getProviderDiagnostics(
  provider: BasemapProvider,
  attribution: string,
): ProviderDiagnostics {
  return {
    kind: provider.kind,
    attribution: attribution.trim() ? "present" : "missing",
    attributionRequired: provider.capabilities.attributionRequired,
    offline: provider.capabilities.offline,
    apiKey: provider.capabilities.apiKey,
    drawing: "leaflet-draw",
    scope: "configuration",
  };
}

export function createRasterProvider(
  config: TileProviderConfig,
): RasterTileProvider {
  const name = config.provider.trim().toLowerCase();
  // Snapshot the config so later caller mutation cannot silently change a provider.
  const snapshot = { ...config };
  return {
    kind: "raster",
    capabilities: {
      attributionRequired: true,
      offline: name === "osm" || name === "here" ? "unsupported" : "unknown",
      apiKey: name === "here" ? "required" : "none",
    },
    resolve: () => buildTileURL(snapshot),
  };
}

/** Existing custom tile-url behavior, without guessing licensing or authentication. */
export function createCustomRasterProvider(
  config: TileURLTemplate,
): RasterTileProvider {
  const snapshot = { ...config, subdomains: config.subdomains?.slice() };
  return {
    kind: "raster",
    capabilities: {
      attributionRequired: true,
      offline: "unknown",
      apiKey: "host-defined",
    },
    resolve: () => ({ ...snapshot, subdomains: snapshot.subdomains?.slice() }),
  };
}

export interface BasemapAdapter {
  provider: BasemapProvider;
  /** Trusted host-supplied attribution HTML, never unsanitized remote input. */
  attribution: string;
}

/** Feasibility shim: host injects a MapLibre-to-Leaflet bridge and owns PMTiles
 * protocol registration. No MapLibre, PMTiles, Google SDK, or keys in core.
 */
export function createMapLibreBasemapAdapter(options: {
  createLayer: (leaflet: typeof Leaflet) => Leaflet.Layer;
  attribution: string;
  offline?: OfflineSupport;
  apiKey?: ApiKeyRequirement;
}): BasemapAdapter {
  return {
    attribution: options.attribution,
    provider: {
      kind: "vector",
      capabilities: {
        attributionRequired: true,
        offline: options.offline ?? "unknown",
        apiKey: options.apiKey ?? "host-defined",
      },
      createLayer: options.createLayer,
    },
  };
}
