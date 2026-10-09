import * as L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { addProtocol, removeProtocol } from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { createMapLibreBasemapAdapter } from "./lib/providers.js";
import type { BasemapAdapter } from "./lib/providers.js";

let registration: { protocol: Protocol; owners: number } | undefined;
let mountedLayers = 0;

/** Register once per application; leases share a cache. Do not also register the
 * `pmtiles` scheme yourself. Release all leases after removing all adapter maps.
 * Hosts already managing the scheme may omit this helper entirely.
 */
export function registerPMTilesProtocol(): () => void {
  if (!registration) {
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
    registration = { protocol, owners: 0 };
  }
  registration.owners++;
  let released = false;
  return () => {
    if (released) return;
    if (registration?.owners === 1 && mountedLayers > 0) {
      throw new Error("Remove PMTiles basemaps before releasing the protocol");
    }
    released = true;
    if (registration && --registration.owners === 0) {
      removeProtocol("pmtiles");
      registration = undefined;
    }
  };
}

export interface PMTilesBasemapOptions {
  /** Trusted MapLibre style; use pmtiles://https://... vector source URLs.
   * Source-layer names must match the archive. No vendor schema is assumed.
   */
  style: StyleSpecification | string;
  /** Trusted HTML required by your data license; shown by Leaflet. */
  attribution: string;
  /** Called on mount, before asynchronous load/error events. Attach listeners
   * here for readiness and explicit host fallback. Never implies offline support.
   */
  onMap?: (map: MapLibreMap) => void;
}

/** Optional concrete MapLibre bridge. Use /external and the same Leaflet module.
 * Leaflet retains interaction, drawing, and view ownership (no pitch/rotation).
 * Protocol registration is explicit and application-owned.
 */
export function createPMTilesBasemapAdapter(
  options: PMTilesBasemapOptions,
): BasemapAdapter {
  if (!options.attribution.trim())
    throw new Error("PMTiles attribution is required");
  const { style, attribution, onMap } = options;
  return createMapLibreBasemapAdapter({
    attribution,
    offline: "unknown",
    apiKey: "host-defined",
    createLayer(leaflet) {
      if (leaflet.Layer !== L.Layer) {
        throw new Error(
          "PMTiles requires /external with one shared Leaflet instance",
        );
      }
      const layer = maplibreGL({
        style,
        interactive: false,
        attributionControl: false,
      });
      const add = layer.onAdd;
      const remove = layer.onRemove;
      let mounted = false;
      layer.onAdd = function (map) {
        try {
          add.call(this, map);
        } catch (error) {
          // The upstream bridge appends its container before constructing WebGL.
          // A constructor failure must not leave a dead canvas in the tile pane.
          try {
            layer.getMaplibreMap()?.remove();
          } finally {
            layer.getContainer()?.remove();
          }
          throw error;
        }
        mounted = true;
        mountedLayers++;
        try {
          onMap?.(layer.getMaplibreMap());
        } catch (error) {
          try {
            remove.call(this, map);
          } finally {
            mounted = false;
            mountedLayers--;
          }
          throw error;
        }
        return this;
      };
      layer.onRemove = function (map) {
        if (mounted) {
          try {
            remove.call(this, map);
          } finally {
            mounted = false;
            mountedLayers--;
          }
        }
        return this;
      };
      return layer;
    },
  });
}
