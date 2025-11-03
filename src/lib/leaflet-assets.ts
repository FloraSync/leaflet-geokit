import * as L from "leaflet";

// Inline CSS strings (bundled by Vite) so we can inject into Shadow DOM
import leafletCSS from "leaflet/dist/leaflet.css?inline";
import leafletDrawCSS from "leaflet-draw/dist/leaflet.draw.css?inline";

// Resolve Leaflet's default marker assets as URLs
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

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

/* --- Custom overrides for marker/handle sizes --- */
.leaflet-draw-handle,
.leaflet-editing-icon,
.leaflet-draw-marker-icon {
  width: 12px !important;
  height: 12px !important;
  margin-left: -6px !important;
  margin-top: -6px !important;
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
