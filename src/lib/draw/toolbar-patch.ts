import * as L from "leaflet";

const patchedNamespaces = new WeakSet<object>();

export function registerLayerCakeTool(Lns: typeof L = L): void {
  if (patchedNamespaces.has(Lns as object)) return;
  const DrawToolbarCtor = (Lns as any).DrawToolbar;
  if (!DrawToolbarCtor?.prototype?.getModeHandlers) return;

  const originalGetModeHandlers = DrawToolbarCtor.prototype.getModeHandlers;

  DrawToolbarCtor.prototype.getModeHandlers = function (map: L.Map) {
    const modes = originalGetModeHandlers.call(this, map);

    if ((this as any).options?.cake) {
      const CakeCtor = (Lns as any).Draw?.Cake;
      if (!CakeCtor) return modes;
      modes.push({
        enabled: true,
        handler: new CakeCtor(map, (this as any).options.cake),
        title: "Draw Layer Cake (Subtractive Zones)",
      });
    }

    return modes;
  };

  patchedNamespaces.add(Lns as object);
}
