import { expect, type Page } from "@playwright/test";

const BLANK_TILE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0b8AAAAASUVORK5CYII=";

export const BLANK_TILE_PNG = Buffer.from(BLANK_TILE_PNG_BASE64, "base64");
export const TILE_URL_PATTERN =
  /https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i;

type GuardrailMetrics = {
  mountStart: number;
  containerVisibleAt: number | null;
  readyAt: number | null;
  createdAt: number | null;
  syncAt: number | null;
  syncedFeatureCount: number | null;
  tileProviderErrors: Array<{ at: number; detail: unknown }>;
  longTasks: Array<{ start: number; duration: number }>;
};

declare global {
  interface Window {
    __guardrailMetrics?: GuardrailMetrics;
  }
}

export async function routeDeterministicTiles(
  page: Page,
  options: {
    delayMs?: number;
    fail?: boolean;
  } = {},
): Promise<() => number> {
  const { delayMs = 0, fail = false } = options;
  let requestCount = 0;

  await page.route(TILE_URL_PATTERN, async (route) => {
    requestCount += 1;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (fail) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: "not-a-valid-png",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: BLANK_TILE_PNG,
    });
  });

  return () => requestCount;
}

export async function mountGuardrailHarness(
  page: Page,
  options: {
    latitude?: number;
    longitude?: number;
    zoom?: number;
  } = {},
): Promise<void> {
  const { latitude = 39.7392, longitude = -104.9903, zoom = 11 } = options;

  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    zoom: String(zoom),
  });
  await page.goto(`/e2e/guardrail-harness.html?${query.toString()}`, {
    waitUntil: "domcontentloaded",
  });
}

export async function waitForGuardrailReady(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => window.__guardrailMetrics?.readyAt ?? null),
      {
        timeout: 30_000,
        message: "Expected the GeoKit guardrail harness to become ready",
      },
    )
    .not.toBeNull();
}

async function mapPoint(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<{ x: number; y: number }> {
  const mapContainer = page.locator("leaflet-geokit .leaflet-container");
  const box = await mapContainer.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: box!.x + box!.width * xRatio,
    y: box!.y + box!.height * yRatio,
  };
}

export async function clickMapAt(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const point = await mapPoint(page, xRatio, yRatio);
  await page.mouse.click(point.x, point.y);
}

export async function finishPolygonOnFirstVertex(page: Page): Promise<void> {
  const firstMarker = page
    .locator("leaflet-geokit .leaflet-marker-icon")
    .first();
  await expect(firstMarker).toBeVisible({ timeout: 10_000 });
  const box = await firstMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

export async function drawFourVertexPolygon(page: Page): Promise<void> {
  await page.locator("a.leaflet-draw-draw-polygon").click();
  await clickMapAt(page, 0.28, 0.3);
  await clickMapAt(page, 0.44, 0.32);
  await clickMapAt(page, 0.42, 0.46);
  await finishPolygonOnFirstVertex(page);
}

export async function prepareDrawSyncMeasurement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const metrics = window.__guardrailMetrics;
    const map = document.getElementById("guardrail-map") as any;
    if (!metrics || !map) return;
    metrics.createdAt = null;
    metrics.syncAt = null;
    metrics.syncedFeatureCount = null;

    map.addEventListener(
      "leaflet-draw:created",
      async () => {
        metrics.createdAt = performance.now();
        const geojson = await map.getGeoJSON();
        metrics.syncAt = performance.now();
        metrics.syncedFeatureCount = Array.isArray(geojson?.features)
          ? geojson.features.length
          : null;
      },
      { once: true },
    );
  });
}

export async function readGuardrailMetrics(
  page: Page,
): Promise<GuardrailMetrics> {
  return page.evaluate(() => {
    const metrics = window.__guardrailMetrics;
    if (!metrics) {
      throw new Error("Guardrail metrics were not initialized.");
    }
    return metrics;
  });
}

export async function measureLoadAndClearBudgets(page: Page): Promise<{
  loadMs: number;
  clearMs: number;
  loadedCount: number;
  clearedCount: number;
}> {
  return page.evaluate(async () => {
    const map = document.getElementById("guardrail-map") as any;
    if (!map) {
      throw new Error("Guardrail map element not found.");
    }

    const makePolygon = (
      centerX: number,
      centerY: number,
      radius: number,
      vertexCount: number,
    ) => {
      const ring = Array.from({ length: vertexCount }, (_, index) => {
        const angle = (Math.PI * 2 * index) / vertexCount;
        return [
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
        ];
      });
      ring.push(ring[0]);
      return ring;
    };

    const features = Array.from({ length: 25 }, (_, index) => {
      const row = Math.floor(index / 5);
      const col = index % 5;
      const centerX = -104.99 + col * 0.01;
      const centerY = 39.73 + row * 0.01;
      return {
        type: "Feature",
        properties: { name: `feature-${index + 1}` },
        geometry: {
          type: "Polygon",
          coordinates: [makePolygon(centerX, centerY, 0.0025, 20)],
        },
      };
    });

    const featureCollection = {
      type: "FeatureCollection",
      features,
    };

    const loadStart = performance.now();
    await map.loadGeoJSON(featureCollection);
    const loadMs = performance.now() - loadStart;
    const loadedCount = (await map.getGeoJSON()).features.length;

    const clearStart = performance.now();
    await map.clearLayers();
    const clearMs = performance.now() - clearStart;
    const clearedCount = (await map.getGeoJSON()).features.length;

    return { loadMs, clearMs, loadedCount, clearedCount };
  });
}
