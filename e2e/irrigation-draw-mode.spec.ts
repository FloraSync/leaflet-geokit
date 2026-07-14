import { expect, test, type Page } from "@playwright/test";

type MapPoint = { x: number; y: number };

async function waitForIrrigationMapReady(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => Boolean((window as any).irrigationMapReady)),
      {
        timeout: 30_000,
        message: "Expected the irrigation draw map to become ready",
      },
    )
    .toBe(true);
  await expect(page.locator("leaflet-geokit .leaflet-container")).toBeVisible();
}

async function mapPoint(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<MapPoint> {
  const mapContainer = page.locator("leaflet-geokit .leaflet-container");
  const box = await mapContainer.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: box!.x + box!.width * xRatio,
    y: box!.y + box!.height * yRatio,
  };
}

async function clickMapAt(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const point = await mapPoint(page, xRatio, yRatio);
  await page.mouse.click(point.x, point.y);
}

async function currentFeatureCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const map = document.querySelector("leaflet-geokit") as any;
    const geojson = await map.getGeoJSON();
    return geojson.features.length;
  });
}

async function drawTriangleFromActiveTool(page: Page): Promise<void> {
  await clickMapAt(page, 0.3, 0.32);
  await page.waitForTimeout(200);
  await clickMapAt(page, 0.46, 0.33);
  await page.waitForTimeout(200);
  await clickMapAt(page, 0.42, 0.48);
  await page.waitForTimeout(250);
  await clickMapAt(page, 0.3, 0.32);
}

test.describe("irrigation draw mode harness", () => {
  test("activates polygon draw from external panel and secondary toolbar", async ({
    page,
  }) => {
    await page.goto("/irrigation-draw-mode.html");
    await waitForIrrigationMapReady(page);

    await page
      .getByRole("button", { name: "Draw irrigation zone from panel" })
      .click();

    await expect
      .poll(() =>
        page.evaluate(() => (window as any).lastIrrigationToolTrigger),
      )
      .toMatchObject({
        tool: "polygon",
        source: "external-irrigation-button",
        groupId: "external-panel",
        handled: true,
      });

    await drawTriangleFromActiveTool(page);
    await expect.poll(() => currentFeatureCount(page)).toBe(1);

    await page.evaluate(async () => {
      await (document.querySelector("leaflet-geokit") as any).clearLayers();
    });
    await expect.poll(() => currentFeatureCount(page)).toBe(0);
    await page.evaluate(async () => {
      await (document.querySelector("leaflet-geokit") as any).deactivateTool({
        source: "external-irrigation-clear",
        groupId: "external-panel",
      });
    });
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).lastIrrigationToolTrigger),
      )
      .toMatchObject({
        tool: "select",
        source: "external-irrigation-clear",
        groupId: "external-panel",
        handled: true,
      });

    await page
      .locator(
        '[data-geokit-toolbar-group="irrigation-draw"] [data-geokit-tool="polygon"]',
      )
      .click();

    await expect(
      page.locator('[data-geokit-tool-popover="true"]'),
    ).toContainText("Trace the wetted area");
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).lastIrrigationToolTrigger),
      )
      .toMatchObject({
        tool: "polygon",
        source: "toolbar",
        groupId: "irrigation-draw",
        handled: true,
      });

    await drawTriangleFromActiveTool(page);
    await expect.poll(() => currentFeatureCount(page)).toBe(1);
  });
});
