import { LeafletDrawMapElement } from "@src/components/LeafletDrawMapElement";

// Define once guard to avoid double registration in HMR or multiple bundles
const TAG_NAME = "leaflet-draw-map";
if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, LeafletDrawMapElement);
}

export { LeafletDrawMapElement };
export * from "@src/types/public";
export * from "@src/types/events";
