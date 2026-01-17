import { test, expect } from "@playwright/test";

test.describe("Leaflet Geokit Web Component", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/test.html");
  });

  test("should load the map", async ({ page }) => {
    const map = page.locator("leaflet-geokit");
    await expect(map).toBeVisible();

    // Check if Leaflet container is created inside shadow DOM
    const leafletContainer = page.locator("leaflet-geokit .leaflet-container");
    // Wait for the component to initialize its shadow DOM and leaflet
    await expect(leafletContainer).toBeVisible();

    // Wait for tiles to likely load
    await page.waitForLoadState("networkidle");

    // Take a snapshot of the loaded map
    await expect(page).toHaveScreenshot("map-loaded.png", {
      mask: [page.locator(".leaflet-control-attribution")],
    });
  });

  test("should have drawing controls", async ({ page }) => {
    // Drawing controls are in .leaflet-draw-toolbar
    await page.waitForFunction(() => (window as any).mapReady === true);
    const drawToolbar = page.locator(".leaflet-draw.leaflet-control");
    await expect(drawToolbar).toBeVisible();

    // Wait for buttons to be present
    await expect(drawToolbar.locator("a")).toHaveCount(5); // Line, Polygon and Circle, zoom in/out
  });

  test("can get GeoJSON from the component", async ({ page }) => {
    // Wait for map to be ready
    await page.waitForFunction(() => (window as any).mapReady === true);

    const btn = page.locator("#get-geojson");
    await btn.click();

    const output = page.locator("#output");
    const text = await output.textContent();
    const geojson = JSON.parse(text || "{}");

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toBeInstanceOf(Array);
  });
});
