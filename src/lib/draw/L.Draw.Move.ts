import * as L from "leaflet";

/**
 * DrawMove: A custom Leaflet.draw handler that enables moving/translating existing features.
 * This handler activates a "move mode" where users can click and drag features to new positions.
 */
export class DrawMove extends (L as any).Draw.Feature {
  public static TYPE = "move";

  private _featureGroup: L.FeatureGroup;
  private _selectedLayer: L.Layer | null = null;
  private _originalLatLngs: any = null;
  private _dragStartLatLng: L.LatLng | null = null;
  private _isDragging = false;
  private _pendingMove: {
    layer: L.Layer;
    originalGeoJSON: GeoJSON.Feature;
    newGeoJSON: GeoJSON.Feature;
  } | null = null;

  constructor(map: L.Map, options?: { featureGroup: L.FeatureGroup } & any) {
    super(map, options);
    this.type = DrawMove.TYPE;
    this._featureGroup = options?.featureGroup || new L.FeatureGroup();
  }

  enable(): void {
    if (this._enabled) return;
    super.enable();
  }

  disable(): void {
    if (!this._enabled) return;
    this._cleanupDragging();
    super.disable();
  }

  addHooks(): void {
    const map = this._map;
    if (!map) return;

    // Set cursor style for the map container
    L.DomUtil.addClass(map.getContainer(), "leaflet-draw-move-mode");

    // Add mouseover/mouseout handlers for all layers in featureGroup
    this._featureGroup.eachLayer((layer: L.Layer) => {
      this._enableLayerHover(layer);
    });

    // Update tooltip
    const tooltip = (this as any)._tooltip;
    if (tooltip?.updateContent) {
      tooltip.updateContent({
        text: "Click and drag a feature to move it",
        subtext: "",
      });
    }
  }

  removeHooks(): void {
    const map = this._map;
    if (!map) return;

    // Remove cursor style
    L.DomUtil.removeClass(map.getContainer(), "leaflet-draw-move-mode");

    // Remove hover handlers
    this._featureGroup.eachLayer((layer: L.Layer) => {
      this._disableLayerHover(layer);
    });

    this._cleanupDragging();
  }

  private _enableLayerHover(layer: L.Layer): void {
    if (!(layer as any).on) return;

    (layer as any).on("mouseover", this._onLayerMouseOver, this);
    (layer as any).on("mouseout", this._onLayerMouseOut, this);
    (layer as any).on("mousedown", this._onLayerMouseDown, this);
  }

  private _disableLayerHover(layer: L.Layer): void {
    if (!(layer as any).off) return;

    (layer as any).off("mouseover", this._onLayerMouseOver, this);
    (layer as any).off("mouseout", this._onLayerMouseOut, this);
    (layer as any).off("mousedown", this._onLayerMouseDown, this);
  }

  private _onLayerMouseOver(e: L.LeafletMouseEvent): void {
    if (this._isDragging) return;
    const layer = e.target;

    // Change cursor to grab
    if ((layer as any).getElement) {
      const element = (layer as any).getElement();
      if (element) {
        element.style.cursor = "grab";
      }
    } else if ((layer as any)._path) {
      (layer as any)._path.style.cursor = "grab";
    }
  }

  private _onLayerMouseOut(e: L.LeafletMouseEvent): void {
    if (this._isDragging) return;
    const layer = e.target;

    // Reset cursor
    if ((layer as any).getElement) {
      const element = (layer as any).getElement();
      if (element) {
        element.style.cursor = "";
      }
    } else if ((layer as any)._path) {
      (layer as any)._path.style.cursor = "";
    }
  }

  private _onLayerMouseDown(e: L.LeafletMouseEvent): void {
    if (this._isDragging) return;

    L.DomEvent.stopPropagation(e.originalEvent);
    L.DomEvent.preventDefault(e.originalEvent);

    const selectedLayer = e.target;
    this._selectedLayer = selectedLayer;
    this._isDragging = true;
    this._dragStartLatLng = e.latlng;

    // Store original position
    this._storeOriginalLatLngs(selectedLayer);

    // Change cursor to grabbing
    if ((selectedLayer as any).getElement) {
      const element = (selectedLayer as any).getElement();
      if (element) {
        element.style.cursor = "grabbing";
      }
    } else if ((selectedLayer as any)._path) {
      (selectedLayer as any)._path.style.cursor = "grabbing";
    }

    // Attach move and up handlers
    this._map.on("mousemove", this._onMouseMove, this);
    this._map.on("mouseup", this._onMouseUp, this);

    // Store original GeoJSON for potential cancel
    const originalGeoJSON = (selectedLayer as any).toGeoJSON();
    this._pendingMove = {
      layer: selectedLayer,
      originalGeoJSON,
      newGeoJSON: originalGeoJSON, // Will be updated on mouseup
    };
  }

  private _storeOriginalLatLngs(layer: L.Layer): void {
    if ((layer as any).getLatLng) {
      // Marker or Circle
      this._originalLatLngs = (layer as any).getLatLng();
    } else if ((layer as any).getLatLngs) {
      // Polygon, Polyline, etc.
      this._originalLatLngs = JSON.parse(
        JSON.stringify((layer as any).getLatLngs()),
      );
    }
  }

  private _onMouseMove(e: L.LeafletMouseEvent): void {
    if (!this._isDragging || !this._selectedLayer || !this._dragStartLatLng)
      return;

    const layer = this._selectedLayer;
    const offset = {
      lat: e.latlng.lat - this._dragStartLatLng.lat,
      lng: e.latlng.lng - this._dragStartLatLng.lng,
    };

    // Apply offset to move the layer
    if ((layer as any).setLatLng) {
      // Marker or Circle
      const newLatLng = L.latLng(
        this._originalLatLngs.lat + offset.lat,
        this._originalLatLngs.lng + offset.lng,
      );
      (layer as any).setLatLng(newLatLng);
    } else if ((layer as any).setLatLngs) {
      // Polygon, Polyline, etc.
      const newLatLngs = this._offsetLatLngs(this._originalLatLngs, offset);
      (layer as any).setLatLngs(newLatLngs);
    }
  }

  private _offsetLatLngs(
    latLngs: any,
    offset: { lat: number; lng: number },
  ): any {
    if (
      latLngs instanceof L.LatLng ||
      (latLngs.lat !== undefined && latLngs.lng !== undefined)
    ) {
      return L.latLng(latLngs.lat + offset.lat, latLngs.lng + offset.lng);
    }
    if (Array.isArray(latLngs)) {
      return latLngs.map((ll: any) => this._offsetLatLngs(ll, offset));
    }
    return latLngs;
  }

  private _onMouseUp(e: L.LeafletMouseEvent): void {
    if (!this._isDragging || !this._selectedLayer) return;

    // Update pending move with new GeoJSON
    if (this._pendingMove) {
      this._pendingMove.newGeoJSON = (this._selectedLayer as any).toGeoJSON();
    }

    // Reset cursor
    const layer = this._selectedLayer;
    if ((layer as any).getElement) {
      const element = (layer as any).getElement();
      if (element) {
        element.style.cursor = "grab";
      }
    } else if ((layer as any)._path) {
      (layer as any)._path.style.cursor = "grab";
    }

    // Fire moveend event with pending move data
    this._map.fire("draw:moveend", {
      layer: this._selectedLayer,
      originalGeoJSON: this._pendingMove?.originalGeoJSON,
      newGeoJSON: this._pendingMove?.newGeoJSON,
    });

    // Cleanup
    this._map.off("mousemove", this._onMouseMove, this);
    this._map.off("mouseup", this._onMouseUp, this);

    this._isDragging = false;
    // Keep _pendingMove and _selectedLayer for Save/Cancel UI
  }

  private _cleanupDragging(): void {
    if (this._selectedLayer) {
      // Reset cursor
      const layer = this._selectedLayer;
      if ((layer as any).getElement) {
        const element = (layer as any).getElement();
        if (element) {
          element.style.cursor = "";
        }
      } else if ((layer as any)._path) {
        (layer as any)._path.style.cursor = "";
      }
    }

    this._map.off("mousemove", this._onMouseMove, this);
    this._map.off("mouseup", this._onMouseUp, this);

    this._selectedLayer = null;
    this._originalLatLngs = null;
    this._dragStartLatLng = null;
    this._isDragging = false;
    this._pendingMove = null;
  }

  /**
   * Confirm the pending move and dispatch the final event.
   */
  public confirmMove(): void {
    if (!this._pendingMove) return;

    this._map.fire("draw:moveconfirmed", {
      layer: this._pendingMove.layer,
      originalGeoJSON: this._pendingMove.originalGeoJSON,
      newGeoJSON: this._pendingMove.newGeoJSON,
    });

    this._cleanupDragging();
  }

  /**
   * Cancel the pending move and revert the layer to its original position.
   */
  public cancelMove(): void {
    if (!this._pendingMove) return;

    const layer = this._pendingMove.layer;

    // Revert to original position
    if ((layer as any).setLatLng && this._originalLatLngs) {
      (layer as any).setLatLng(this._originalLatLngs);
    } else if ((layer as any).setLatLngs && this._originalLatLngs) {
      (layer as any).setLatLngs(this._originalLatLngs);
    }

    this._cleanupDragging();
  }

  /**
   * Check if there's a pending move awaiting confirmation.
   */
  public hasPendingMove(): boolean {
    return this._pendingMove !== null;
  }
}

// Register with bundled Leaflet
(L as any).Draw.Move = DrawMove;

/**
 * Ensure DrawMove is registered with a given Leaflet namespace.
 */
export function ensureDrawMoveRegistered(Lns: typeof L): void {
  const DrawNs = (Lns as any).Draw;
  if (!DrawNs) return;
  if (DrawNs.Move) return;

  class RuntimeDrawMove extends DrawNs.Feature {
    public static TYPE = "move";
    private _featureGroup: L.FeatureGroup;
    private _selectedLayer: L.Layer | null = null;
    private _originalLatLngs: any = null;
    private _dragStartLatLng: L.LatLng | null = null;
    private _isDragging = false;
    private _pendingMove: {
      layer: L.Layer;
      originalGeoJSON: GeoJSON.Feature;
      newGeoJSON: GeoJSON.Feature;
    } | null = null;

    constructor(map: L.Map, options?: { featureGroup: L.FeatureGroup } & any) {
      super(map, options);
      this.type = RuntimeDrawMove.TYPE;
      this._featureGroup = options?.featureGroup || new L.FeatureGroup();
    }

    enable(): void {
      if ((this as any)._enabled) return;
      super.enable();
    }

    disable(): void {
      if (!(this as any)._enabled) return;
      this._cleanupDragging();
      super.disable();
    }

    addHooks(): void {
      const map = (this as any)._map;
      if (!map) return;

      Lns.DomUtil.addClass(map.getContainer(), "leaflet-draw-move-mode");

      this._featureGroup.eachLayer((layer: L.Layer) => {
        this._enableLayerHover(layer);
      });

      const tooltip = (this as any)._tooltip;
      if (tooltip?.updateContent) {
        tooltip.updateContent({
          text: "Click and drag a feature to move it",
          subtext: "",
        });
      }
    }

    removeHooks(): void {
      const map = (this as any)._map;
      if (!map) return;

      Lns.DomUtil.removeClass(map.getContainer(), "leaflet-draw-move-mode");

      this._featureGroup.eachLayer((layer: L.Layer) => {
        this._disableLayerHover(layer);
      });

      this._cleanupDragging();
    }

    private _enableLayerHover(layer: L.Layer): void {
      if (!(layer as any).on) return;
      (layer as any).on("mouseover", this._onLayerMouseOver, this);
      (layer as any).on("mouseout", this._onLayerMouseOut, this);
      (layer as any).on("mousedown", this._onLayerMouseDown, this);
    }

    private _disableLayerHover(layer: L.Layer): void {
      if (!(layer as any).off) return;
      (layer as any).off("mouseover", this._onLayerMouseOver, this);
      (layer as any).off("mouseout", this._onLayerMouseOut, this);
      (layer as any).off("mousedown", this._onLayerMouseDown, this);
    }

    private _onLayerMouseOver(e: L.LeafletMouseEvent): void {
      if (this._isDragging) return;
      const layer = e.target;
      if ((layer as any).getElement) {
        const element = (layer as any).getElement();
        if (element) element.style.cursor = "grab";
      } else if ((layer as any)._path) {
        (layer as any)._path.style.cursor = "grab";
      }
    }

    private _onLayerMouseOut(e: L.LeafletMouseEvent): void {
      if (this._isDragging) return;
      const layer = e.target;
      if ((layer as any).getElement) {
        const element = (layer as any).getElement();
        if (element) element.style.cursor = "";
      } else if ((layer as any)._path) {
        (layer as any)._path.style.cursor = "";
      }
    }

    private _onLayerMouseDown(e: L.LeafletMouseEvent): void {
      if (this._isDragging) return;
      Lns.DomEvent.stopPropagation(e.originalEvent);
      Lns.DomEvent.preventDefault(e.originalEvent);

      const selectedLayer = e.target;
      this._selectedLayer = selectedLayer;
      this._isDragging = true;
      this._dragStartLatLng = e.latlng;
      this._storeOriginalLatLngs(selectedLayer);

      if ((selectedLayer as any).getElement) {
        const element = (selectedLayer as any).getElement();
        if (element) element.style.cursor = "grabbing";
      } else if ((selectedLayer as any)._path) {
        (selectedLayer as any)._path.style.cursor = "grabbing";
      }

      (this as any)._map.on("mousemove", this._onMouseMove, this);
      (this as any)._map.on("mouseup", this._onMouseUp, this);

      const originalGeoJSON = (selectedLayer as any).toGeoJSON();
      this._pendingMove = {
        layer: selectedLayer,
        originalGeoJSON,
        newGeoJSON: originalGeoJSON,
      };
    }

    private _storeOriginalLatLngs(layer: L.Layer): void {
      if ((layer as any).getLatLng) {
        this._originalLatLngs = (layer as any).getLatLng();
      } else if ((layer as any).getLatLngs) {
        this._originalLatLngs = JSON.parse(
          JSON.stringify((layer as any).getLatLngs()),
        );
      }
    }

    private _onMouseMove(e: L.LeafletMouseEvent): void {
      if (!this._isDragging || !this._selectedLayer || !this._dragStartLatLng)
        return;

      const layer = this._selectedLayer;
      const offset = {
        lat: e.latlng.lat - this._dragStartLatLng.lat,
        lng: e.latlng.lng - this._dragStartLatLng.lng,
      };

      if ((layer as any).setLatLng) {
        const newLatLng = Lns.latLng(
          this._originalLatLngs.lat + offset.lat,
          this._originalLatLngs.lng + offset.lng,
        );
        (layer as any).setLatLng(newLatLng);
      } else if ((layer as any).setLatLngs) {
        const newLatLngs = this._offsetLatLngs(this._originalLatLngs, offset);
        (layer as any).setLatLngs(newLatLngs);
      }
    }

    private _offsetLatLngs(
      latLngs: any,
      offset: { lat: number; lng: number },
    ): any {
      if (
        latLngs instanceof Lns.LatLng ||
        (latLngs.lat !== undefined && latLngs.lng !== undefined)
      ) {
        return Lns.latLng(latLngs.lat + offset.lat, latLngs.lng + offset.lng);
      }
      if (Array.isArray(latLngs)) {
        return latLngs.map((ll: any) => this._offsetLatLngs(ll, offset));
      }
      return latLngs;
    }

    private _onMouseUp(e: L.LeafletMouseEvent): void {
      if (!this._isDragging || !this._selectedLayer) return;

      if (this._pendingMove) {
        this._pendingMove.newGeoJSON = (this._selectedLayer as any).toGeoJSON();
      }

      const layer = this._selectedLayer;
      if ((layer as any).getElement) {
        const element = (layer as any).getElement();
        if (element) element.style.cursor = "grab";
      } else if ((layer as any)._path) {
        (layer as any)._path.style.cursor = "grab";
      }

      (this as any)._map.fire("draw:moveend", {
        layer: this._selectedLayer,
        originalGeoJSON: this._pendingMove?.originalGeoJSON,
        newGeoJSON: this._pendingMove?.newGeoJSON,
      });

      (this as any)._map.off("mousemove", this._onMouseMove, this);
      (this as any)._map.off("mouseup", this._onMouseUp, this);

      this._isDragging = false;
    }

    private _cleanupDragging(): void {
      if (this._selectedLayer) {
        const layer = this._selectedLayer;
        if ((layer as any).getElement) {
          const element = (layer as any).getElement();
          if (element) element.style.cursor = "";
        } else if ((layer as any)._path) {
          (layer as any)._path.style.cursor = "";
        }
      }

      (this as any)._map.off("mousemove", this._onMouseMove, this);
      (this as any)._map.off("mouseup", this._onMouseUp, this);

      this._selectedLayer = null;
      this._originalLatLngs = null;
      this._dragStartLatLng = null;
      this._isDragging = false;
      this._pendingMove = null;
    }

    public confirmMove(): void {
      if (!this._pendingMove) return;

      (this as any)._map.fire("draw:moveconfirmed", {
        layer: this._pendingMove.layer,
        originalGeoJSON: this._pendingMove.originalGeoJSON,
        newGeoJSON: this._pendingMove.newGeoJSON,
      });

      this._cleanupDragging();
    }

    public cancelMove(): void {
      if (!this._pendingMove) return;

      const layer = this._pendingMove.layer;

      if ((layer as any).setLatLng && this._originalLatLngs) {
        (layer as any).setLatLng(this._originalLatLngs);
      } else if ((layer as any).setLatLngs && this._originalLatLngs) {
        (layer as any).setLatLngs(this._originalLatLngs);
      }

      this._cleanupDragging();
    }

    public hasPendingMove(): boolean {
      return this._pendingMove !== null;
    }
  }

  DrawNs.Move = RuntimeDrawMove;
}
