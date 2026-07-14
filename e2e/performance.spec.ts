import { expect, test } from "@playwright/test";

import {
  measureLoadAndClearBudgets,
  mountGuardrailHarness,
  routeDeterministicTiles,
  waitForGuardrailReady,
  readGuardrailMetrics,
} from "./guardrail-harness";

test.describe("GeoKit performance guardrails", () => {
  test("meets desktop readiness, tile, draw, and load budgets", async ({
    page,
  }) => {
    const readTileRequestCount = await routeDeterministicTiles(page);
    const mountStartedAt = Date.now();

    await mountGuardrailHarness(page, { zoom: 11 });
    await expect(page.locator("leaflet-geokit")).toBeVisible();
    const visibleMs = Date.now() - mountStartedAt;
    await waitForGuardrailReady(page);

    const readyMetrics = await readGuardrailMetrics(page);
    const readyMs = (readyMetrics.readyAt ?? 0) - readyMetrics.mountStart;

    expect(visibleMs).toBeLessThanOrEqual(1_500);
    expect(readyMs).toBeLessThanOrEqual(2_500);
    expect(readTileRequestCount()).toBeLessThanOrEqual(20);

    await expect(page.locator("a.leaflet-draw-draw-polygon")).toBeVisible();
    const drawMetrics = await readGuardrailMetrics(page);

    const loadClearMetrics = await measureLoadAndClearBudgets(page);
    expect(loadClearMetrics.loadedCount).toBe(25);
    expect(loadClearMetrics.clearedCount).toBe(0);
    expect(loadClearMetrics.loadMs).toBeLessThanOrEqual(800);
    expect(loadClearMetrics.clearMs).toBeLessThanOrEqual(300);

    const longestTaskMs = Math.max(
      0,
      ...drawMetrics.longTasks.map((entry) => entry.duration),
    );
    expect(longestTaskMs).toBeLessThanOrEqual(200);
  });

  test("meets low-end mobile ready and draw budgets under throttling", async ({
    page,
  }) => {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const readTileRequestCount = await routeDeterministicTiles(page);
    const mountStartedAt = Date.now();

    await mountGuardrailHarness(page, { zoom: 10 });
    await expect(page.locator("leaflet-geokit")).toBeVisible({
      timeout: 30_000,
    });
    const visibleMs = Date.now() - mountStartedAt;
    await waitForGuardrailReady(page);

    const readyMetrics = await readGuardrailMetrics(page);
    const readyMs = (readyMetrics.readyAt ?? 0) - readyMetrics.mountStart;

    expect(visibleMs).toBeLessThanOrEqual(5_500);
    expect(readyMs).toBeLessThanOrEqual(5_000);
    expect(readTileRequestCount()).toBeLessThanOrEqual(20);
    await expect(page.locator("a.leaflet-draw-draw-polygon")).toBeVisible();
    const drawMetrics = await readGuardrailMetrics(page);

    const longestTaskMs = Math.max(
      0,
      ...drawMetrics.longTasks.map((entry) => entry.duration),
    );
    expect(longestTaskMs).toBeLessThanOrEqual(500);
  });
});
