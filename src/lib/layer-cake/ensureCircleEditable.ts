import type * as L from "leaflet";

export function ensureCircleEditable(circle: L.Circle): void {
  const options: any = (circle as any).options ?? {};

  // Leaflet.draw editing expects both `options.original` and `options.editing` to exist.
  // When we create circles programmatically (L.circle), these may be missing which can
  // cause editing.enable() to fail or create detached/incorrect markers.
  if (!options.original) {
    options.original = { ...options };
  }
  if (!options.editing) {
    options.editing = { ...options };
  }
}

