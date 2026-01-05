import * as L from "leaflet";
import { v4 as uuidv4 } from "uuid";
import { bakeLayerCake } from "@src/lib/layer-cake/CakeBaker";
import { bindCakeControls } from "@src/lib/layer-cake/bindCakeControls";
import { ensureCircleEditable } from "@src/lib/layer-cake/ensureCircleEditable";

export class LayerCakeManager {
  private map: L.Map;
  private layers: L.Circle[] = [];
  private controlsGroup: L.LayerGroup;
  private onSave: (geojson: GeoJSON.FeatureCollection) => void;
  private sessionId = uuidv4().slice(0, 8);
  private baseCircleOptions: L.CircleMarkerOptions;
  private detachMapListeners: (() => void)[] = [];
  private renderScheduled = false;

  constructor(
    map: L.Map,
    initialCircle: L.Circle,
    onSave: (geojson: GeoJSON.FeatureCollection) => void,
  ) {
    this.map = map;
    this.onSave = onSave;
    this.controlsGroup = L.layerGroup().addTo(map);
    this.baseCircleOptions = { ...(initialCircle.options as any) };
    delete (this.baseCircleOptions as any).editing;
    delete (this.baseCircleOptions as any).original;

    this.addLayer(initialCircle);
    this.installEditEventBridges();
    this.renderControls();
  }

  private installEditEventBridges(): void {
    const anyL: any = L as any;
    const EDITMOVE = anyL?.Draw?.Event?.EDITMOVE;
    const EDITRESIZE = anyL?.Draw?.Event?.EDITRESIZE;
    if (!EDITMOVE || !EDITRESIZE) return;

    const onMove = (e: any) => {
      const layer = e?.layer as L.Layer | undefined;
      if (!layer) return;
      if (!this.layers.includes(layer as any)) return;
      this.syncCenters(layer as any);
    };

    const onResize = (e: any) => {
      const layer = e?.layer as L.Layer | undefined;
      if (!layer) return;
      if (!this.layers.includes(layer as any)) return;
      this.requestRenderControls();
    };

    this.map.on(EDITMOVE, onMove);
    this.map.on(EDITRESIZE, onResize);
    this.detachMapListeners.push(() => this.map.off(EDITMOVE, onMove));
    this.detachMapListeners.push(() => this.map.off(EDITRESIZE, onResize));
  }

  private requestRenderControls(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    const schedule =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);

    schedule(() => {
      this.renderScheduled = false;
      this.renderControls();
    });
  }

  private addLayer(circle: L.Circle): void {
    this.layers.push(circle);
    circle.addTo(this.map);

    const editing: any = (circle as any).editing;
    // For programmatically-created circles, Leaflet.draw can compute resize handle points
    // from `_radius` (pixel radius). Ensure the circle has been projected/rendered first.
    // Deferring to the next tick stabilizes handle placement in Shadow DOM + Canvas paths.
    setTimeout(() => {
      try {
        circle.redraw?.();
        ensureCircleEditable(circle);
        if (editing?.enabled?.()) {
          editing.updateMarkers?.();
          this.requestRenderControls();
          return;
        }
        editing?.enable?.();
        editing?.updateMarkers?.();
        this.requestRenderControls();
      } catch {
        // Ignore editing setup failures; cake circles should still exist even without handles.
      }
    }, 0);
  }

  public addRing(): void {
    if (this.layers.length >= 10) return;
    const largest = this.getLargestCircle();
    if (!largest) return;

    const newRadius = largest.getRadius() * 1.5;
    const newCircle = L.circle(largest.getLatLng(), {
      ...(this.baseCircleOptions as any),
      radius: newRadius,
    });
    this.addLayer(newCircle);
    this.renderControls();
  }

  public save(): void {
    const geojson = bakeLayerCake({ circles: this.layers });
    this.onSave(geojson);
    this.destroy();
  }

  private getLargestCircle(): L.Circle | null {
    if (this.layers.length === 0) return null;
    return this.layers.reduce((prev, current) =>
      prev.getRadius() > current.getRadius() ? prev : current,
    );
  }

  private syncCenters(sourceCircle: L.Circle): void {
    const newCenter = sourceCircle.getLatLng();
    this.layers.forEach((layer) => {
      if (layer === sourceCircle) return;
      layer.setLatLng(newCenter);
      layer.redraw?.();
      (layer as any).editing?.updateMarkers?.();
    });
    this.requestRenderControls();
  }

  private renderControls(): void {
    this.controlsGroup.clearLayers();
    const largest = this.getLargestCircle();
    if (!largest) return;

    const bounds = largest.getBounds();
    const anchor = bounds.getNorthEast();

    const addId = `cake-add-${this.sessionId}`;
    const saveId = `cake-save-${this.sessionId}`;

    const uiIcon = L.divIcon({
      className: "layer-cake-controls",
      html: `
        <div class="layer-cake-controls__container">
          <button id="${addId}" type="button">➕ Ring</button>
          <button id="${saveId}" type="button" class="layer-cake-controls__save">💾 Save</button>
        </div>
      `,
      iconSize: [140, 40],
      iconAnchor: [-10, 20],
    });

    L.marker(anchor, {
      icon: uiIcon,
      interactive: true,
      keyboard: false,
      bubblingMouseEvents: false,
    }).addTo(this.controlsGroup);

    setTimeout(() => {
      // Important: the map likely lives in a ShadowRoot; document.getElementById won't find these.
      const root: ParentNode = this.map.getContainer();
      bindCakeControls({
        root,
        addButtonId: addId,
        saveButtonId: saveId,
        onAddRing: () => this.addRing(),
        onSave: () => this.save(),
      });
    }, 0);
  }

  public destroy(): void {
    this.detachMapListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // Ignore listener cleanup errors during teardown
      }
    });
    this.detachMapListeners = [];

    this.layers.forEach((l) => this.map.removeLayer(l));
    this.layers = [];
    this.controlsGroup.clearLayers();
    this.map.removeLayer(this.controlsGroup);
  }
}
