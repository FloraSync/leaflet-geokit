import * as L from "leaflet";
import { DrawCake } from "@src/lib/draw/L.Draw.Cake";

let patched = false;

export function registerLayerCakeTool(): void {
  if (patched) return;
  const DrawToolbarCtor = (L as any).DrawToolbar;
  if (!DrawToolbarCtor?.prototype?.getModeHandlers) return;

  const originalGetModeHandlers = DrawToolbarCtor.prototype.getModeHandlers;

  DrawToolbarCtor.prototype.getModeHandlers = function (map: L.Map) {
    const modes = originalGetModeHandlers.call(this, map);

    if ((this as any).options?.cake) {
      modes.push({
        enabled: true,
        handler: new DrawCake(map, (this as any).options.cake),
        title: "Draw Layer Cake (Subtractive Zones)",
      });
    }

    return modes;
  };

  patched = true;
}
