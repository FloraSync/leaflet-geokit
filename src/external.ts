import { LeafletDrawMapElement } from "@src/components/LeafletDrawMapElement";

const CANONICAL_TAG_NAME = "leaflet-geokit";
if (!customElements.get(CANONICAL_TAG_NAME)) {
  customElements.define(CANONICAL_TAG_NAME, LeafletDrawMapElement);
}

const LEGACY_TAG_NAME = "leaflet-draw-map";
if (!customElements.get(LEGACY_TAG_NAME)) {
  class LeafletDrawMapElementLegacy extends LeafletDrawMapElement {}
  customElements.define(LEGACY_TAG_NAME, LeafletDrawMapElementLegacy);
}

export { LeafletDrawMapElement };
export * from "@src/types/public";
export * from "@src/types/events";
