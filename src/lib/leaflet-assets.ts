import * as L from "leaflet";

// Inline CSS strings (bundled by Vite) so we can inject into Shadow DOM
import leafletCSS from "leaflet/dist/leaflet.css?inline";
import leafletDrawCSS from "leaflet-draw/dist/leaflet.draw.css?inline";
import leafletRulerCSS from "leaflet-ruler/src/leaflet-ruler.css?inline";

// Resolve Leaflet's default marker assets as URLs
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";

import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import cogIconUrl from "@src/assets/cog.svg?url";
import layerCakeIconUrl from "@src/assets/layer-cake.svg?url";

import rulerIconUrl from "leaflet-ruler/dist/icon.png";
import rulerIconColoredUrl from "leaflet-ruler/dist/icon-colored.png";

/**
 * Inject Leaflet and Leaflet.draw CSS into the given ShadowRoot.
 * Idempotent: does nothing if already injected for this root.
 */
export function injectLeafletStyles(root: ShadowRoot): void {
  // Avoid duplicate injection in HMR or reconnection
  const marker = "data-leaflet-styles";
  if (root.querySelector(`style[${marker}]`)) return;

  const style = document.createElement("style");
  style.setAttribute(marker, "true");
  style.textContent = `
/* --- Leaflet core CSS --- */
${leafletCSS}

/* --- Leaflet.draw CSS --- */
${leafletDrawCSS}

/* --- Leaflet.ruler CSS --- */
${leafletRulerCSS}

/* --- Fix Leaflet.ruler icons (broken relative paths in inlined CSS) --- */
.leaflet-ruler {
  width: 30px !important; /* Match Leaflet Draw default size approx */
  height: 30px !important;
  background-color: #fff; /* Ensure visibility */
  background-image: url(${rulerIconUrl}) !important;
  background-size: 16px 16px; /* Scale icon to fit */
}
.leaflet-ruler:hover,
.leaflet-ruler-clicked {
  background-image: url(${rulerIconColoredUrl}) !important;
}

/* --- Custom overrides for marker/handle sizes --- */
.leaflet-draw-handle,
.leaflet-editing-icon,
.leaflet-draw-marker-icon {
  width: 12px !important;
  height: 12px !important;
  margin-left: -6px !important;
  margin-top: -6px !important;
}

/* --- Ruler settings control --- */
.leaflet-ruler-settings-control {
  display: flex;
  flex-direction: column;
}
.leaflet-ruler-settings-button {
  width: 30px;
  height: 30px;
  border: none;
  background-color: #fff;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 22px 22px;
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  background-image: url(${cogIconUrl});
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}
.leaflet-ruler-settings-button:hover {
  background-color: #f4f4f4;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
.leaflet-ruler-settings-button:focus-visible {
  outline: 2px solid #2c7be5;
  outline-offset: 2px;
}

/* --- Measurement modal --- */
.leaflet-ruler-modal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 500;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  padding: 16px;
}
.leaflet-ruler-modal-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
}
.leaflet-ruler-modal {
  background: #fff;
  border-radius: 8px;
  width: min(320px, 100%);
  padding: 16px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.leaflet-ruler-modal-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}
.leaflet-ruler-modal-description {
  margin: 0 0 12px;
  font-size: 13px;
  color: #444;
}
.leaflet-ruler-modal-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.leaflet-ruler-modal-option {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
}
.leaflet-ruler-modal-option input[type="radio"] {
  margin-top: 4px;
}
.leaflet-ruler-modal-option span {
  line-height: 1.25;
}
.leaflet-ruler-modal-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.leaflet-ruler-modal-close {
  border: none;
  background: #2c7be5;
  color: #fff;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
}
.leaflet-ruler-modal-close:hover {
  background: #1a56c2;
}

/* --- Layer Cake draw tool icon + manager UI --- */
.leaflet-draw-draw-cake {
  background-image: url(${layerCakeIconUrl}) !important;
  background-size: 18px 18px;
  background-position: center;
  background-repeat: no-repeat;
  background-color: #fff;
}

.layer-cake-controls__container {
  display: flex;
  gap: 6px;
  background: white;
  padding: 5px;
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.layer-cake-controls button {
  border: 1px solid #ccc;
  background: white;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
}

.layer-cake-controls button:hover {
  background: #f4f4f4;
}
`;
  root.appendChild(style);
}

/**
 * Ensure Leaflet default marker icons resolve via the bundler.
 * Safe to call multiple times.
 */
export function configureLeafletDefaultIcons(): void {
  // Merge options so Leaflet's default icon paths point to bundled URLs
  (L.Icon.Default as any).mergeOptions?.({
    iconRetinaUrl,
    iconUrl,
    shadowUrl,
  });
}
