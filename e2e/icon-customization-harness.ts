import "/src/index.ts";
import customMarkerUrl from "./icon-customization-marker.svg?url";

type LeafletGeoKitElement = HTMLElement & {
  addFeatures?: (fc: unknown) => Promise<string[]>;
};

const DEFAULT_MARKER_SIZE = [25, 41] as const;
const CUSTOM_MARKER_SIZE = [42, 56] as const;
const CUSTOM_MARKER_ANCHOR = [21, 56] as const;
const CUSTOM_POPUP_ANCHOR = [0, -46] as const;

const BLANK_TILE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="#eef3ef" />
    <path d="M0 128H256M128 0V256" stroke="#d1ddd4" stroke-width="2" />
    <path d="M0 0L256 256M256 0L0 256" stroke="#e4ece7" stroke-width="1" />
    <circle cx="128" cy="128" r="40" fill="none" stroke="#c2d1c7" stroke-width="3" />
  </svg>
`)}`;

const CENTER = {
  latitude: "39.7392",
  longitude: "-104.9903",
  zoom: "14",
} as const;

const status = document.getElementById(
  "harness-status",
) as HTMLParagraphElement;
const errorPanel = document.getElementById(
  "harness-error",
) as HTMLParagraphElement;
const defaultMapHost = document.getElementById(
  "default-map-host",
) as HTMLDivElement;
const customMapHost = document.getElementById(
  "custom-map-host",
) as HTMLDivElement;
const customAssetPreview = document.getElementById(
  "custom-asset-preview",
) as HTMLImageElement;

function setStatus(message: string, state: "loading" | "ready" | "error") {
  status.textContent = message;
  status.dataset.ready = state;
}

function setCardState(cardId: string, state: "loading" | "ready" | "error") {
  const card = document.getElementById(cardId);
  if (card) {
    card.dataset.state = state;
  }
}

function createMapElement(
  id: string,
  options: {
    markerIconUrl?: string;
    readOnly?: boolean;
    drawMarker?: boolean;
  } = {},
): LeafletGeoKitElement {
  const map = document.createElement("leaflet-geokit") as LeafletGeoKitElement;
  map.id = id;
  map.setAttribute("latitude", CENTER.latitude);
  map.setAttribute("longitude", CENTER.longitude);
  map.setAttribute("zoom", CENTER.zoom);
  map.setAttribute("tile-url", BLANK_TILE_URL);
  map.setAttribute("tile-attribution", "Deterministic harness tile");
  map.setAttribute("log-level", "warn");

  if (options.readOnly) {
    map.setAttribute("read-only", "");
  }

  if (options.drawMarker) {
    map.setAttribute("draw-marker", "");
  }

  if (options.markerIconUrl) {
    map.setAttribute("marker-icon-url", options.markerIconUrl);
    map.setAttribute("marker-icon-retina-url", options.markerIconUrl);
    map.setAttribute("marker-icon-size", CUSTOM_MARKER_SIZE.join(","));
    map.setAttribute("marker-icon-anchor", CUSTOM_MARKER_ANCHOR.join(","));
    map.setAttribute("marker-popup-anchor", CUSTOM_POPUP_ANCHOR.join(","));
  }

  return map;
}

function waitForReady(map: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(`Timed out waiting for ${map.id} to emit leaflet-draw:ready`),
      );
    }, 30_000);

    map.addEventListener(
      "leaflet-draw:ready",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function seedMarker(
  map: LeafletGeoKitElement,
  coordinates: [number, number],
  name: string,
) {
  await map.addFeatures?.({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name },
        geometry: {
          type: "Point",
          coordinates,
        },
      },
    ],
  });
}

async function init() {
  setStatus("Loading blank-tile comparison maps…", "loading");
  setCardState("default-card", "loading");
  setCardState("custom-card", "loading");
  customAssetPreview.src = customMarkerUrl;

  const defaultMap = createMapElement("default-map", {
    readOnly: true,
  });
  const customMap = createMapElement("custom-map", {
    markerIconUrl: customMarkerUrl,
    drawMarker: true,
  });

  defaultMapHost.append(defaultMap);
  customMapHost.append(customMap);

  await Promise.all([waitForReady(defaultMap), waitForReady(customMap)]);
  setCardState("default-card", "ready");
  setCardState("custom-card", "ready");

  await Promise.all([
    seedMarker(defaultMap, [-104.9903, 39.7392], "default-reference"),
    seedMarker(customMap, [-104.9924, 39.7403], "custom-reference"),
  ]);

  (
    window as Window & { __iconCustomizationHarness?: unknown }
  ).__iconCustomizationHarness = {
    customMarkerUrl: new URL(customMarkerUrl, window.location.href).toString(),
    defaultMarkerSize: [...DEFAULT_MARKER_SIZE],
    customMarkerSize: [...CUSTOM_MARKER_SIZE],
    customMapId: "custom-map",
    defaultMapId: "default-map",
  };

  document.body.dataset.ready = "true";
  setStatus(
    "Ready. Default and custom marker fixtures are seeded on deterministic local tiles.",
    "ready",
  );
}

void init().catch((error) => {
  console.error(error);
  document.body.dataset.ready = "error";
  setStatus("The harness failed to initialize.", "error");
  setCardState("default-card", "error");
  setCardState("custom-card", "error");
  errorPanel.hidden = false;
  errorPanel.textContent =
    error instanceof Error ? error.message : String(error);
});
