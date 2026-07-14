import { expect, test } from "@playwright/test";

import {
  mountGuardrailHarness,
  readGuardrailMetrics,
  routeDeterministicTiles,
  waitForGuardrailReady,
} from "./guardrail-harness";

test("surfaces tile failures once, bounds retry storms, and keeps draw/export usable", async ({
  page,
}) => {
  const readTileRequestCount = await routeDeterministicTiles(page, {
    fail: true,
  });

  await mountGuardrailHarness(page, { zoom: 11 });
  await waitForGuardrailReady(page);

  await expect(page.locator("a.leaflet-draw-draw-polygon")).toBeVisible();
  await expect(page.locator("a.leaflet-draw-edit-edit")).toBeVisible();
  await expect(page.locator(".leaflet-ruler")).toBeVisible();
  await expect
    .poll(() => readTileRequestCount(), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () => (await readGuardrailMetrics(page)).tileProviderErrors.length,
      {
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(0);
  const metrics = await readGuardrailMetrics(page);
  expect(metrics.tileProviderErrors.length).toBeGreaterThan(0);
  expect(metrics.tileProviderErrors[0]?.detail).toMatchObject({
    code: "tile_load_failed",
    provider: "tile-url",
  });

  let settledCount = readTileRequestCount();
  let stablePolls = 0;
  for (let attempt = 0; attempt < 20 && stablePolls < 4; attempt += 1) {
    await page.waitForTimeout(250);
    const nextCount = readTileRequestCount();
    if (nextCount === settledCount) {
      stablePolls += 1;
      continue;
    }

    settledCount = nextCount;
    stablePolls = 0;
  }

  await page.waitForTimeout(5_000);
  expect(readTileRequestCount() - settledCount).toBeLessThanOrEqual(2);
});
