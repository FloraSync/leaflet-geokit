import type { FeatureCollection } from "geojson";

export type LayerKind = "base" | "drawn" | "imported" | "guide" | "measurement";
/** Portable styles only; no Leaflet instances, HTML, or provider credentials. */
export interface LayerStyle {
  color?: string;
  fillColor?: string;
  weight?: number;
  opacity?: number;
  fillOpacity?: number;
  dashArray?: string;
}
export interface MapLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  /** Back to front within Leaflet's base/vector/marker pane boundaries. */
  order: number;
  featureIds: string[];
  style: LayerStyle;
}
export interface LayerDefinition {
  id?: string;
  name?: string;
  kind?: Exclude<LayerKind, "base">;
  style?: LayerStyle;
}
export type LayerStylePreset = "crop" | "water" | "reference";
export const LAYER_STYLE_PRESETS: Record<
  LayerStylePreset,
  Readonly<LayerStyle>
> = {
  crop: Object.freeze({
    color: "#287a39",
    fillColor: "#76b947",
    weight: 2,
    fillOpacity: 0.25,
  }),
  water: Object.freeze({
    color: "#176da5",
    fillColor: "#59b4e5",
    weight: 2,
    fillOpacity: 0.3,
  }),
  reference: Object.freeze({
    color: "#735aa6",
    weight: 2,
    fillOpacity: 0.08,
    dashArray: "6 4",
  }),
};
export interface LayerCakeSession {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  rings: { radius: number }[];
  style: LayerStyle;
}
export interface LayerCakeSessionUpdate {
  name?: string;
  /** Radii in meters, strictly increasing; one to ten rings. */
  radii?: number[];
  style?: LayerStyle;
  preset?: LayerStylePreset;
}
export interface LayerCakeEventDetail {
  session: LayerCakeSession;
  source?: string;
  commandId?: string;
  groupId?: string;
  featureCollection?: FeatureCollection;
  layerId?: string;
}
/** Cancel the style-request event to replace the built-in panel with host UI. */
export interface LayerStyleRequestDetail {
  layers: MapLayer[];
  selectedLayerId?: string;
}
export interface LayerSnapshot {
  version: 1;
  layers: MapLayer[];
}
