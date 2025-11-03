import type { Feature, FeatureCollection } from "geojson";
import { v4 as uuidv4 } from "uuid";
import {
  bboxOfFeatureCollection,
  bboxToBoundsPair,
  type BoundsPair,
  normalizeId,
} from "@src/utils/geojson";
import { createLogger, type Logger } from "@src/utils/logger";

/**
 * FeatureStore
 * - Maintains a stable, id-centric in-memory FeatureCollection
 * - IDs are sourced from feature.id, feature.properties.id, or generated (uuid v4)
 * - Provides CRUD and export helpers
 *
 * Note: Leaflet layer bindings will be handled by the controller; this store is map-agnostic.
 */
export class FeatureStore {
  private log: Logger;
  private features: Map<string, Feature>;

  constructor(logger: Logger = createLogger("feature-store", "debug")) {
    this.log = logger;
    this.features = new Map();
  }

  size(): number {
    return this.features.size;
  }

  has(id: string): boolean {
    return this.features.has(id);
  }

  get(id: string): Feature | undefined {
    return this.features.get(id);
  }

  /**
   * Add features to the store; returns the assigned/normalized ids in order.
   */
  add(fc: FeatureCollection): string[] {
    const ids: string[] = [];
    const t0 = performance.now?.() ?? Date.now();
    for (const f of fc.features) {
      const id = this.ensureId(f);
      // Store a shallow copy with id normalized on the Feature root for consistency
      const stored: Feature = { ...f, id };
      this.features.set(id, stored);
      ids.push(id);
    }
    const elapsed = (performance.now?.() ?? Date.now()) - t0;
    this.log.debug("add", {
      count: fc.features.length,
      ids,
      elapsedMs: Math.round(elapsed),
    });
    return ids;
  }

  /**
   * Update a feature by id. If the feature does not exist, this is a no-op.
   * The provided feature will overwrite the stored one with the given id.
   */
  update(id: string, feature: Feature): void {
    if (!this.features.has(id)) {
      this.log.warn("update:missing", { id });
      return;
    }
    const updated: Feature = { ...feature, id };
    this.features.set(id, updated);
    this.log.debug("update", { id });
  }

  /**
   * Remove a feature by id. No-op if missing.
   */
  remove(id: string): void {
    if (this.features.delete(id)) {
      this.log.debug("remove", { id });
    } else {
      this.log.warn("remove:missing", { id });
    }
  }

  /**
   * Clear all features.
   */
  clear(): void {
    const count = this.features.size;
    this.features.clear();
    this.log.debug("clear", { count });
  }

  /**
   * Export snapshot as FeatureCollection.
   */
  toFeatureCollection(): FeatureCollection {
    return {
      type: "FeatureCollection",
      features: Array.from(this.features.values()),
    };
  }

  /**
   * Compute bounds for current data as [[south, west], [north, east]] or null if empty.
   */
  bounds(): BoundsPair | null {
    const fc = this.toFeatureCollection();
    if (fc.features.length === 0) return null;
    const b = bboxOfFeatureCollection(fc);
    if (!b) return null;
    return bboxToBoundsPair(b);
  }

  /**
   * Ensure the feature has an id; returns the resolved id.
   */
  private ensureId(f: Feature): string {
    const existing = normalizeId(f);
    if (existing) return String(existing);
    const id = uuidv4();
    // Assign on both standard positions for compatibility
    (f as any).id = id;
    if (f.properties && typeof f.properties === "object") {
      (f.properties as any).id = id;
    }
    return id;
  }
}
