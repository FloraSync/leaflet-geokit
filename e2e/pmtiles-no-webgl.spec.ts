import { test, expect } from "@playwright/test";
test.use({ launchOptions: { args: ["--disable-webgl"] } });
test("failed construction leaves raster and no half-mounted container", async ({
  page,
}) => {
  await page.goto("/pmtiles.html");
  await expect(page.locator("#status")).toHaveText(
    "Renderer unavailable; raster retained",
  );
  await expect(page.locator(".leaflet-gl-layer")).toHaveCount(0);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.pmtilesExample.api.getProviderDiagnostics()?.kind,
    ),
  ).toBe("raster");
  await page.evaluate(() => window.pmtilesExample.release());
});
