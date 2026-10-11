import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet-draw/dist/leaflet.draw.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type * as ExternalEntry from "../src/external";
import type * as PMTilesEntry from "../src/pmtiles";
const externalPath = "/dist/leaflet-geokit.external.es.js";
const adapterPath = "/dist/leaflet-geokit.pmtiles.es.js";
const { LeafletDrawMapElement } = (await import(
  /* @vite-ignore */ externalPath
)) as typeof ExternalEntry;
const { createPMTilesBasemapAdapter, registerPMTilesProtocol } = (await import(
  /* @vite-ignore */ adapterPath
)) as typeof PMTilesEntry;
import type { Map as GLMap, StyleSpecification } from "maplibre-gl";
import type { LeafletDrawMapElementAPI } from "../src/types/public";

const release = registerPMTilesProtocol();
const status = document.querySelector("#status")!;
const archive =
  new URLSearchParams(location.search).get("archive") ??
  new URL("/test-data/pmtiles/fields.pmtiles", location.href).href;
const style: StyleSpecification = {
  version: 8,
  sources: { fields: { type: "vector", url: `pmtiles://${archive}` } },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e9e2cf" },
    },
    {
      id: "fields",
      type: "fill",
      source: "fields",
      "source-layer": "fields",
      paint: { "fill-color": "#198754", "fill-opacity": 1 },
    },
  ],
};
const renderers: GLMap[] = [];
const errors: string[] = [];
let removed = 0;
const adapter = createPMTilesBasemapAdapter({
  style,
  attribution: "FloraSync synthetic fixture (MIT)",
  onMap(map) {
    // Browser assertions inspect renderer internals beyond the public event API.
    renderers.push(map as GLMap);
    map.on("load", () => {
      status.textContent = "PMTiles loaded";
    });
    map.on("error", (event) => {
      errors.push(event.error.message);
      status.textContent = "Renderer error; select Local raster";
    });
    map.on("remove", () => {
      removed++;
    });
  },
});
const element = new LeafletDrawMapElement();
const api = element as unknown as LeafletDrawMapElementAPI;
element.leafletInstance = L;
element.markerIconConfig = {
  iconUrl: markerIcon,
  iconRetinaUrl: markerRetina,
  shadowUrl: markerShadow,
};
element.setAttribute("min-zoom", "1");
element.setAttribute("latitude", "0");
element.setAttribute("longitude", "0");
element.setAttribute("zoom", "2");
element.setAttribute("draw-polygon", "");
element.setAttribute("edit-features", "");
element.setAttribute("tile-url", "/synthetic-irrigation-tile.svg");
element.setAttribute("tile-attribution", "Local raster fixture");
function mount() {
  try {
    api.setBasemapAdapter(adapter);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    status.textContent = "Renderer unavailable; raster retained";
  }
}
element.addEventListener("leaflet-draw:ready", mount, { once: true });
document.querySelector("#maps")!.append(element);
document.querySelector("#vector")!.addEventListener("click", mount);
document.querySelector("#raster")!.addEventListener("click", () => {
  api.setBasemapAdapter(null);
  status.textContent = "Local raster";
});
document
  .querySelector("#draw")!
  .addEventListener("click", () => api.activateTool("polygon"));
// Inspectable example state for real browser assertions, not a mock renderer.
Object.assign(window, {
  pmtilesExample: {
    api,
    element,
    adapter,
    renderers,
    errors,
    release,
    get removed() {
      return removed;
    },
  },
});
