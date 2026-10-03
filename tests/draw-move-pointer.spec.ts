import { afterEach, describe, expect, it, vi } from "vitest";
import * as L from "leaflet";
import "leaflet-draw";
import { DrawMove, ensureDrawMoveRegistered } from "@src/lib/draw/L.Draw.Move";

const maps: L.Map[] = [];
afterEach(() => {
  for (const map of maps.splice(0)) map.remove();
  document.body.replaceChildren();
});

function harness(external: boolean, dragging = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const map = L.map(container, { dragging }).setView([0, 0], 16);
  maps.push(map);
  const layer = L.marker([0, 0]).addTo(map);
  const group = L.featureGroup([layer]);
  const runtime = { ...L, Draw: { ...(L as any).Draw, Move: undefined } };
  ensureDrawMoveRegistered(runtime as any);
  const handler = new (external ? runtime.Draw.Move : DrawMove)(map, {
    featureGroup: group,
  });
  const captured = new Set<number>();
  container.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  container.hasPointerCapture = (id) => captured.has(id);
  container.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  const ended = vi.fn();
  const confirmed = vi.fn();
  map.on("draw:moveend", ended);
  map.on("draw:moveconfirmed", confirmed);
  handler.enable();
  const pointer = (
    type: string,
    x: number,
    target: Element = container,
    id = 7,
  ) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: 40,
      }),
    );
  const start = () => pointer("pointerdown", 40, layer.getElement()!);
  return {
    map,
    layer,
    handler,
    container,
    captured,
    ended,
    confirmed,
    pointer,
    start,
  };
}

for (const external of [false, true])
  describe(
    external ? "external move pointers" : "bundled move pointers",
    () => {
      it("captures a touch, ignores other pointers, ends once and confirms", () => {
        const h = harness(external);
        h.start();
        expect(h.container.setPointerCapture).toHaveBeenCalledWith(7);
        expect(h.map.dragging.enabled()).toBe(false);
        h.pointer("pointermove", 80, h.container, 8);
        expect(h.layer.getLatLng()).toEqual(L.latLng(0, 0));
        h.pointer("pointermove", 80);
        expect(h.layer.getLatLng().lng).not.toBe(0);
        h.pointer("pointerup", 90);
        expect(h.ended).toHaveBeenCalledTimes(1);
        expect(h.captured.size).toBe(0);
        expect(h.map.dragging.enabled()).toBe(true);
        h.pointer("lostpointercapture", 90);
        expect(h.handler.hasPendingMove()).toBe(true);
        h.map.on("draw:moveconfirmed", () => h.handler.disable());
        h.handler.confirmMove();
        expect(h.confirmed).toHaveBeenCalledTimes(1);
        expect(h.handler.hasPendingMove()).toBe(false);
        h.handler.disable();
        expect(h.layer.getLatLng().lng).not.toBe(0);
      });

      for (const cancel of [
        "pointercancel",
        "lostpointercapture",
        "disable",
        "remove",
      ])
        it(`rolls back and releases on ${cancel}`, () => {
          const h = harness(external);
          h.start();
          h.pointer("pointermove", 90);
          expect(h.layer.getLatLng().lng).not.toBe(0);
          if (cancel === "disable") h.handler.disable();
          else if (cancel === "remove") {
            h.map.remove();
            maps.splice(maps.indexOf(h.map), 1);
          } else h.pointer(cancel, 90);
          expect(h.layer.getLatLng()).toEqual(L.latLng(0, 0));
          expect(h.handler.hasPendingMove()).toBe(false);
          expect(h.captured.size).toBe(0);
          expect(h.ended).not.toHaveBeenCalled();
          if (cancel !== "remove") expect(h.map.dragging.enabled()).toBe(true);
          h.pointer("pointermove", 110);
          h.pointer("pointerup", 110);
          expect(h.layer.getLatLng()).toEqual(L.latLng(0, 0));
        });

      it("preserves disabled map dragging and restores touch-action on disable", () => {
        const h = harness(external, false);
        h.start();
        h.pointer("pointermove", 90);
        h.pointer("pointerup", 90);
        expect(h.map.dragging.enabled()).toBe(false);
        h.handler.disable();
        expect(h.layer.getLatLng()).toEqual(L.latLng(0, 0));
        expect(h.container.style.touchAction).not.toBe("none");
      });

      it("does not start compatibility mouse drags or replace an unsaved transaction", () => {
        const h = harness(external);
        h.layer.fire("mousedown", {
          originalEvent: new MouseEvent("mousedown"),
          latlng: L.latLng(0, 0),
        });
        expect(h.handler.hasPendingMove()).toBe(false);
        h.start();
        h.pointer("pointermove", 90);
        h.pointer("pointerup", 90);
        const moved = h.layer.getLatLng();
        h.start();
        h.pointer("pointermove", 140);
        h.pointer("pointerup", 140);
        expect(h.layer.getLatLng()).toEqual(moved);
        expect(h.ended).toHaveBeenCalledTimes(1);
        h.handler.cancelMove();
        expect(h.layer.getLatLng()).toEqual(L.latLng(0, 0));
        h.handler.disable();
        h.handler.enable();
        h.start();
        h.pointer("pointermove", 90);
        h.pointer("pointerup", 90);
        expect(h.ended).toHaveBeenCalledTimes(2);
        h.handler.disable();
        expect(h.layer.getLatLng()).toEqual(L.latLng(0, 0));
      });
    },
  );
