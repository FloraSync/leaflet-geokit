import { v4 as uuidv4 } from "uuid";
import type {
  LayerDefinition,
  LayerKind,
  LayerSnapshot,
  LayerStyle,
  MapLayer,
} from "@src/types/layers";

const kinds: LayerKind[] = [
  "base",
  "drawn",
  "imported",
  "guide",
  "measurement",
];
export function validateLayerStyle(value: LayerStyle): LayerStyle {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid layer style");
  const result: LayerStyle = {};
  for (const key of ["color", "fillColor", "dashArray"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key]!.length > 128)
        throw new Error(`Invalid ${key}`);
      result[key] = value[key];
    }
  }
  for (const key of ["weight", "opacity", "fillOpacity"] as const) {
    const n = value[key];
    if (n === undefined) continue;
    if (!Number.isFinite(n) || n < 0 || n > (key === "weight" ? 100 : 1))
      throw new Error(`Invalid ${key}`);
    result[key] = n;
  }
  return result;
}

/** Framework- and renderer-independent registry. All returned values are detached. */
export class LayerRegistry {
  private layers: MapLayer[] = [];
  getLayers(): MapLayer[] {
    return this.layers.map((layer, order) => ({
      ...layer,
      order,
      featureIds: [...layer.featureIds],
      style: { ...layer.style },
    }));
  }
  get(id: string): MapLayer {
    const layer = this.getLayers().find((item) => item.id === id);
    if (!layer) throw new Error(`Unknown layer: ${id}`);
    return layer;
  }
  add(
    featureIds: string[],
    definition: LayerDefinition = {},
    kind: LayerKind = definition.kind ?? "imported",
  ): string {
    const id = definition.id ?? uuidv4();
    if (!id || this.layers.some((layer) => layer.id === id))
      throw new Error(`Duplicate layer: ${id}`);
    if (!kinds.includes(kind)) throw new Error("Invalid layer kind");
    const style = validateLayerStyle(definition.style ?? {});
    this.layers.push({
      id,
      name: definition.name?.trim() || `${kind} layer`,
      kind,
      visible: true,
      order: this.layers.length,
      featureIds: [...featureIds],
      style,
    });
    return id;
  }
  setLayerVisibility(id: string, visible: boolean): void {
    this.get(id);
    if (typeof visible !== "boolean")
      throw new Error("Invalid layer visibility");
    this.layers.find((layer) => layer.id === id)!.visible = visible;
  }
  setLayerStyle(id: string, style: LayerStyle): void {
    const layer = this.get(id);
    this.layers.find((item) => item.id === id)!.style = {
      ...layer.style,
      ...validateLayerStyle(style),
    };
  }
  reorderLayers(ids: readonly string[]): void {
    if (
      ids.length !== this.layers.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this.layers.some((layer) => layer.id === id))
    )
      throw new Error("Order must contain every layer id exactly once");
    this.layers = ids.map((id) =>
      this.layers.find((layer) => layer.id === id)!,
    );
  }
  removeLayer(id: string): void {
    this.get(id);
    this.layers = this.layers.filter((layer) => layer.id !== id);
  }
  removeFeature(id: string): void {
    for (const layer of this.layers)
      layer.featureIds = layer.featureIds.filter((fid) => fid !== id);
    this.layers = this.layers.filter(
      (layer) => layer.kind === "base" || layer.featureIds.length > 0,
    );
  }
  clearData(): void {
    this.layers = this.layers.filter((layer) => layer.kind === "base");
  }
  snapshot(): LayerSnapshot {
    return { version: 1, layers: this.getLayers() };
  }
  /** Validate everything before mutation, including unique membership and known feature ids. */
  static parseSnapshot(
    value: unknown,
    featureIds: readonly string[],
  ): LayerSnapshot {
    const snapshot = value as LayerSnapshot;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.layers))
      throw new Error("Invalid geokit:layers snapshot");
    const ids = new Set<string>();
    const members = new Set<string>();
    const layers = snapshot.layers.map((layer, order): MapLayer => {
      if (
        !layer ||
        typeof layer.id !== "string" ||
        !layer.id ||
        ids.has(layer.id) ||
        typeof layer.name !== "string" ||
        !kinds.includes(layer.kind) ||
        typeof layer.visible !== "boolean" ||
        layer.order !== order ||
        !Array.isArray(layer.featureIds)
      )
        throw new Error("Invalid layer record");
      ids.add(layer.id);
      for (const id of layer.featureIds) {
        if (
          typeof id !== "string" ||
          !featureIds.includes(id) ||
          members.has(id) ||
          layer.kind === "base"
        )
          throw new Error("Invalid layer membership");
        members.add(id);
      }
      return {
        ...layer,
        featureIds: [...layer.featureIds],
        style: validateLayerStyle(layer.style),
      };
    });
    if (featureIds.some((id) => !members.has(id)))
      throw new Error("Layer snapshot must cover every feature");
    if (
      layers.filter((layer) => layer.kind === "base").length !== 1 ||
      !layers.some((layer) => layer.kind === "base" && layer.id === "base")
    )
      throw new Error("Layer snapshot must contain the base layer");
    return { version: 1, layers };
  }
  restore(snapshot: LayerSnapshot): void {
    this.layers = snapshot.layers.map((layer) => ({
      ...layer,
      featureIds: [...layer.featureIds],
      style: { ...layer.style },
    }));
  }
}
