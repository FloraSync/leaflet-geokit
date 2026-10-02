import type * as L from "leaflet";

/** One pointer transport for bundled and host-provided Leaflet runtimes.
 * Capture on the stable map container, not a path which can leave the SVG viewport.
 * No compatibility mouse listeners: preventDefault on pointerdown suppresses them.
 */
export function bindMovePointer(
  map: L.Map,
  layers: L.FeatureGroup,
  handlers: {
    start: (event: L.LeafletMouseEvent) => void;
    move: (event: L.LeafletMouseEvent) => void;
    end: (event: L.LeafletMouseEvent) => void;
    cancel: () => void;
    pending: () => boolean;
  },
): () => void {
  const container = map.getContainer();
  const touchAction = container.style.touchAction;
  container.style.touchAction = "none";
  let pointerId: number | null = null;
  let restoreDragging = false;
  // Leaflet already disabled its handlers before emitting unload.
  const unloading = () => { restoreDragging = false; };
  map.on("unload", unloading);
  const eventFor = (event: PointerEvent, target?: L.Layer) => ({
    target, originalEvent: event, latlng: map.mouseEventToLatLng(event),
  }) as unknown as L.LeafletMouseEvent;
  const stop = (event: PointerEvent) => { event.preventDefault(); event.stopPropagation(); };
  const release = () => {
    const id = pointerId;
    pointerId = null; // lostpointercapture after a normal release must not cancel.
    if (id !== null && container.hasPointerCapture?.(id)) container.releasePointerCapture(id);
    if (restoreDragging) map.dragging.enable();
    restoreDragging = false;
  };
  const down = (event: PointerEvent) => {
    if (pointerId !== null || !event.isPrimary || event.button !== 0) return;
    let selected: L.Layer | undefined;
    const path = event.composedPath();
    const point = map.mouseEventToLayerPoint(event);
    const testedRenderers = new Set<unknown>();
    layers.eachLayer(layer => {
      const element = (layer as any).getElement?.();
      if (element && path.includes(element)) selected = layer;
      // Canvas paths have no DOM element. Reuse Leaflet's rendered hit testing
      // and draw order (including stroke tolerance), not geographic bounds.
      const renderer = (layer as any)._renderer;
      if (!element && renderer && !testedRenderers.has(renderer) && path.includes(renderer._container)) {
        testedRenderers.add(renderer);
        for (let order = renderer._drawFirst; order; order = order.next) {
          const candidate = order.layer;
          if (layers.hasLayer(candidate) && candidate.options.interactive && candidate._containsPoint(point)) selected = candidate;
        }
      }
    });
    if (!selected) return;
    stop(event);
    // Save/Cancel owns the current transaction. Do not lose its original geometry.
    if (handlers.pending()) return;
    pointerId = event.pointerId;
    restoreDragging = map.dragging.enabled();
    map.dragging.disable();
    handlers.start(eventFor(event, selected));
    try {
      container.setPointerCapture(pointerId);
    } catch {
      release();
      handlers.cancel();
    }
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    stop(event);
    handlers.move(eventFor(event));
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    stop(event);
    handlers.move(eventFor(event));
    release();
    handlers.end(eventFor(event));
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    stop(event);
    release();
    handlers.cancel();
  };
  container.addEventListener("pointerdown", down, true);
  container.addEventListener("pointermove", move, true);
  container.addEventListener("pointerup", up, true);
  container.addEventListener("pointercancel", cancel, true);
  container.addEventListener("lostpointercapture", cancel, true);
  return () => {
    release();
    handlers.cancel();
    map.off("unload", unloading);
    container.style.touchAction = touchAction;
    container.removeEventListener("pointerdown", down, true);
    container.removeEventListener("pointermove", move, true);
    container.removeEventListener("pointerup", up, true);
    container.removeEventListener("pointercancel", cancel, true);
    container.removeEventListener("lostpointercapture", cancel, true);
  };
}
