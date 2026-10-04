import { expect, test } from "@playwright/test";
import type { LeafletDrawMapElement } from "../src/components/LeafletDrawMapElement";

test("plain HTML recipe activates external cake and exports through public APIs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/https:\/\/.*tile\.openstreetmap\.org\/.*/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/custom-toolbar.html");
  await expect(page.locator("#cake")).toBeEnabled();
  const polygon = page.getByRole("button", {
    name: "Draw growing space",
    exact: true,
  });
  await expect(polygon.locator("svg")).toBeVisible();
  await polygon.click();
  await expect(page.getByRole("dialog")).toContainText("Click corners");
  await page.locator("#cancel").click();
  await page.locator("#cake").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            document.querySelector("#map") as LeafletDrawMapElement
          ).getToolCapabilities().tools.layerCake.active,
      ),
    )
    .toBe(true);
  await page.locator("#cancel").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            document.querySelector("#map") as LeafletDrawMapElement
          ).getToolCapabilities().tools.layerCake.active,
      ),
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Save growing spaces", exact: true })
    .click();
  await expect(page.locator("#export-status")).toContainText(
    "Exported 0 growing spaces",
  );
  await page.evaluate(() => {
    const map = document.querySelector("#map") as LeafletDrawMapElement;
    map.dispatchEvent(
      new CustomEvent("leaflet-geokit:activate-tool", {
        detail: { tool: "layerCake", source: "recipe-event-test" },
      }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            document.querySelector("#map") as LeafletDrawMapElement
          ).getToolCapabilities().tools.layerCake.active,
      ),
    )
    .toBe(true);
  await page.locator("#cancel").click();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await polygon.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath(`toolbar-${colorScheme}-${width}.png`),
      });
    }
  }
  expect(errors).toEqual([]);
});
