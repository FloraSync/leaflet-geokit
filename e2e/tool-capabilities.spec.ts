import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Offline deterministic tiles; this does not replace the real Leaflet runtime.
  await page.route(/https:\/\/.*(tile\.openstreetmap\.org|maps\.hereapi\.com)\/.*/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=", "base64") }));
  await page.goto("/irrigation-draw-mode.html");
  await expect(page.locator("#external-draw")).toBeEnabled();
  await page.evaluate(() => {
    (window as any).capabilityEvents = [];
    document.addEventListener("leaflet-geokit:tool-capabilities-changed", (event) => {
      const custom = event as CustomEvent;
      (window as any).capabilityEvents.push({ detail: custom.detail, bubbles: custom.bubbles, composed: custom.composed });
    });
  });
});

test("external buttons mirror load, create/delete and read-only transitions", async ({ page }) => {
  const edit = page.locator("#external-edit");
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute("data-disabled-reason", "no_editable_layers");
  await page.evaluate(async () => {
    const map = document.querySelector("leaflet-geokit") as any;
    await map.loadGeoJSON({ type: "FeatureCollection", features: [{ type: "Feature", id: "bed", properties: {}, geometry: { type: "Polygon", coordinates: [[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] } }] });
  });
  await expect(edit).toBeEnabled();
  await edit.click();
  await expect.poll(() => page.evaluate(() => (document.querySelector("leaflet-geokit") as any).getToolCapabilities().tools.edit.active)).toBe(true);
  await page.locator("#external-stop").click();
  await page.locator("#read-only-toggle").check();
  await expect(page.locator("#external-draw")).toBeDisabled();
  await expect(edit).toHaveAttribute("data-disabled-reason", "read_only");
  await expect(page.locator("leaflet-geokit button[data-geokit-tool='polygon']")).toBeDisabled();
  await expect(page.locator("#external-save")).toBeEnabled();
  await page.locator("#read-only-toggle").uncheck();
  await expect(edit).toBeEnabled();
  expect(await page.evaluate(async () => (await (document.querySelector("leaflet-geokit") as any).getGeoJSON()).features.length)).toBe(1);
  await page.evaluate(async () => (document.querySelector("leaflet-geokit") as any).removeFeature("bed"));
  await expect(edit).toHaveAttribute("data-disabled-reason", "no_editable_layers");

  // Real pointer drawing creates a new layer; no private controller access.
  await page.locator("#external-draw").click();
  const map = page.locator("leaflet-geokit .leaflet-container");
  const box = (await map.boundingBox())!;
  for (const [dx, dy] of [[0.35, 0.35], [0.65, 0.35], [0.65, 0.65], [0.35, 0.35]]) {
    await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy);
    // Leaflet.draw suppresses vertices during its 50ms double-click guard.
    await page.waitForTimeout(75);
  }
  await expect(edit).toBeEnabled();
  await page.locator("#clear").click();
  await expect(edit).toBeDisabled();
  const events = await page.evaluate(() => (window as any).capabilityEvents);
  expect(events.some((event: any) => event.detail.tools.edit.state === "enabled")).toBe(true);
  expect(events.every((event: any) => event.bubbles && event.composed)).toBe(true);
});

test("provider, selection, missing attributes and duplicate groups are introspectable", async ({ page }) => {
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolButtonConfig = { layerStyle: { requirements: { selection: true } }, save: { requirements: { provider: true } } };
    map.tileProvider = "here";
  });
  await expect(page.locator("#external-save")).toHaveAttribute("data-disabled-reason", "missing_api_key");
  await expect(page.locator("#external-draw")).toBeEnabled();
  expect(await page.evaluate(() => (document.querySelector("leaflet-geokit") as any).getToolCapabilities().provider)).toMatchObject({ requested: "here", active: "osm", state: "unavailable", reason: { code: "missing_api_key" } });
  await page.evaluate(() => { (document.querySelector("leaflet-geokit") as any).tileProvider = "missing-test-provider"; });
  await expect(page.locator("#external-save")).toHaveAttribute("data-disabled-reason", "missing_provider");
  await page.evaluate(() => { (document.querySelector("leaflet-geokit") as any).tileProvider = "osm"; });
  await expect(page.locator("#external-save")).toBeEnabled();
  const before = await page.evaluate(() => (document.querySelector("leaflet-geokit") as any).getToolCapabilities());
  expect(before.tools.layerStyle.reason.code).toBe("empty_selection");
  expect(before.tools.polyline.reason).toMatchObject({ code: "missing_attribute", requirement: "draw-polyline" });
  await page.evaluate(async () => {
    const map = document.querySelector("leaflet-geokit") as any;
    await map.addFeatures({ type: "FeatureCollection", features: [{ type: "Feature", id: "selected", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }] });
    map.setToolSelection(["selected"]);
    map.toolbarGroups = [{ id: "one", tools: ["polygon", "layerStyle"] }, { id: "two", tools: ["polygon"] }];
  });
  await expect(page.locator("leaflet-geokit button[data-geokit-tool='layer-style']")).toBeEnabled();
  const after = await page.evaluate(() => (document.querySelector("leaflet-geokit") as any).getToolCapabilities());
  expect(after.tools.polygon.groupIds).toEqual(["one", "two"]);
  expect(after.tools.polygon.hotkey).toBeNull();
  expect(after.tools.polygon.commands).toEqual({ activate: true, deactivate: true });
  await page.evaluate(async () => (document.querySelector("leaflet-geokit") as any).removeFeature("selected"));
  await expect(page.locator("leaflet-geokit button[data-geokit-tool='layer-style']")).toBeDisabled();
});
