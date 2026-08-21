import type { Feature, FeatureCollection } from "geojson";

export type GeoKitStatusState =
  "uninitialized" | "initializing" | "ready" | "loading" | "error";

export interface GeoKitDiagnosticSummary {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: number;
}

/**
 * Details for the 'leaflet-geokit:status' event and the element `status` getter.
 */
export interface StatusEventDetail {
  state: GeoKitStatusState;
  ready: boolean;
  busy: boolean;
  featureCount: number;
  lastEvent?: string;
  lastError?: GeoKitDiagnosticSummary;
  timestamp: number;
}

/**
 * Details for the 'leaflet-geokit:diagnostic' event.
 */
export interface DiagnosticEventDetail extends GeoKitDiagnosticSummary {
  severity: "info" | "warn" | "error";
  state: GeoKitStatusState;
  cause?: unknown;
}

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
export interface ErrorEventDetail extends GeoKitDiagnosticSummary {
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
} as const;

export const GeoKitEvent = {
  Status: "leaflet-geokit:status",
  Diagnostic: "leaflet-geokit:diagnostic",
} as const;
