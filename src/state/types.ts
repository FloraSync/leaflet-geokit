export type MapState =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "loadingData"
  | "drawing"
  | "editing"
  | "error";

export interface StatusSnapshot {
  state: MapState;
  featureCount: number;
  lastEvent?: string;
  logLevel?: string;
}
