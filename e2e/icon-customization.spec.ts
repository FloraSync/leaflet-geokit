import { expect, test, type Page } from "@playwright/test";

type MarkerMetrics = {
  src: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};

type HarnessState = {
  customMarkerUrl: string;
  customMarkerSize: [number, number];
};

async function clickMapAt(
  page: Page,
  mapId: string,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const mapContainer = page.locator(`#${mapId} .leaflet-container`).first();
  const box = await mapContainer.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.click(
    box!.x + box!.width * xRatio,
    box!.y + box!.height * yRatio,
  );
}

async function readMarkerMetrics(
  page: Page,
  selector: string,
): Promise<MarkerMetrics> {
  return await page.locator(selector).evaluate((node) => {
    const marker = node as HTMLImageElement;
    const rect = marker.getBoundingClientRect();
    return {
      src: marker.currentSrc || marker.src,
      width: rect.width,
      height: rect.height,
      naturalWidth: marker.naturalWidth,
      naturalHeight: marker.naturalHeight,
    };
  });
}

async function readMarkerSources(page: Page, mapId: string): Promise<string[]> {
  return await page
    .locator(`#${mapId} .leaflet-marker-pane img.leaflet-marker-icon`)
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const marker = node as HTMLImageElement;
        return marker.currentSrc || marker.src;
      }),
    );
}

test.describe("Icon customization harness", () => {
  test("keeps custom marker assets visible, sized, and distinct from Leaflet defaults", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/icon-customization.html");

    await expect(page.locator("#harness-error")).toBeHidden();
    await expect(page.locator("#harness-status")).toHaveAttribute(
      "data-ready",
      "ready",
      { timeout: 30_000 },
    );

    const defaultMarkers = page.locator(
      "#default-map .leaflet-marker-pane img.leaflet-marker-icon",
    );
    const customMarkers = page.locator(
      "#custom-map .leaflet-marker-pane img.leaflet-marker-icon",
    );

    await expect(defaultMarkers).toHaveCount(1);
    await expect(customMarkers).toHaveCount(1);

    const harness = await page.evaluate(() => {
      return (
        window as Window & {
          __iconCustomizationHarness?: HarnessState;
        }
      ).__iconCustomizationHarness;
    });

    expect(harness).toBeTruthy();

    const defaultMarker = await readMarkerMetrics(
      page,
      "#default-map .leaflet-marker-pane img.leaflet-marker-icon",
    );
    const customMarker = await readMarkerMetrics(
      page,
      "#custom-map .leaflet-marker-pane img.leaflet-marker-icon",
    );

    expect(defaultMarker.src).not.toBe(customMarker.src);
    expect(customMarker.src).toBe(harness!.customMarkerUrl);
    expect(customMarker.naturalWidth).toBeGreaterThan(0);
    expect(customMarker.naturalHeight).toBeGreaterThan(0);
    expect(Math.round(customMarker.width)).toBe(harness!.customMarkerSize[0]);
    expect(Math.round(customMarker.height)).toBe(harness!.customMarkerSize[1]);
    expect(customMarker.width).toBeGreaterThan(defaultMarker.width + 10);
    expect(customMarker.height).toBeGreaterThan(defaultMarker.height + 10);

    await expect(
      page.locator("#custom-card a.leaflet-draw-draw-marker"),
    ).toBeVisible();
    await page.locator("#custom-card a.leaflet-draw-draw-marker").click();
    await clickMapAt(page, "custom-map", 0.72, 0.34);

    await expect(customMarkers).toHaveCount(2);
    const customSources = await readMarkerSources(page, "custom-map");
    expect(customSources.every((src) => src === harness!.customMarkerUrl)).toBe(
      true,
    );

    await expect(
      page.locator("#icon-customization-comparison"),
    ).toHaveScreenshot("icon-customization-comparison.png", {
      animations: "disabled",
      caret: "hide",
    });
  });
});
