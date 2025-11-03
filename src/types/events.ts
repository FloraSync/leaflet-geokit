import type { Feature, FeatureCollection } from "geojson";

/**
 * Details for the 'leaflet-draw:ready' event.
 * bounds: optional southwest/northeast LatLng pairs.
 */
export interface ReadyEventDetail {
  bounds?: [[number, number], [number, number]];
}

/**
 * Details for the 'leaflet-draw:created' event.
 * id: the stable feature id assigned by the FeatureStore.
 */
export interface CreatedEventDetail {
  id: string;
  layerType: "polygon" | "polyline" | "rectangle" | "circle" | "marker";
  geoJSON: Feature;
}

/**
 * Details for the 'leaflet-draw:edited' event.
 * ids: array of feature ids that were edited.
 */
export interface EditedEventDetail {
  ids: string[];
  geoJSON: FeatureCollection;
}

/**
 * Details for the 'leaflet-draw:deleted' event.
 * ids: array of feature ids that were deleted.
 */
export interface DeletedEventDetail {
  ids: string[];
  geoJSON: FeatureCollection;
}

/**
 * Details for error events emitted as 'leaflet-draw:error'.
 */
export interface ErrorEventDetail {
  message: string;
  cause?: unknown;
}

/**
 * Details for 'leaflet-draw:ingest' event. Fired before data is added to the map.
 * Listeners may mutate detail.fc to transform incoming data (e.g., flatten MultiPolygon).
 */
export interface IngestEventDetail {
  fc: FeatureCollection;
  mode: "load" | "add";
}

/**
 * Details for 'leaflet-draw:export' event.
 */
export interface ExportEventDetail {
  geoJSON: FeatureCollection;
  featureCount: number;
}

/**
 * Event name constants for convenience (non-enforced).
 */
export const DrawEvent = {
  Ready: "leaflet-draw:ready",
  Created: "leaflet-draw:created",
  Edited: "leaflet-draw:edited",
  Deleted: "leaflet-draw:deleted",
  Error: "leaflet-draw:error",
  Ingest: "leaflet-draw:ingest",
  Export: "leaflet-draw:export",
  DrawStart: "leaflet-draw:drawstart",
  DrawStop: "leaflet-draw:drawstop",
  EditStart: "leaflet-draw:editstart",
  EditStop: "leaflet-draw:editstop",
} as const;
