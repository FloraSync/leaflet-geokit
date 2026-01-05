import * as L from "leaflet";

export class DrawCake extends (L as any).Draw.Circle {
  public static TYPE = "cake";

  constructor(map: L.Map, options?: L.DrawOptions.CircleOptions) {
    super(map, options);
    this.type = DrawCake.TYPE;
  }

  addHooks(): void {
    super.addHooks();
    const tooltip = (this as any)._tooltip;
    if (tooltip?.updateContent) {
      tooltip.updateContent({
        text: "Click and drag to draw the Layer Cake base",
        subtext: "Release mouse to finish base layer",
      });
    }
  }
}

(L as any).Draw.Cake = DrawCake;

