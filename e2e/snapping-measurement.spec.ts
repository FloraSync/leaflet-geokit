import { expect, test, type Page } from "@playwright/test";

type Point = { x: number; y: number };

async function ready(page: Page): Promise<void> {
  await page.goto("/irrigation-draw-mode.html");
  await expect.poll(() => page.evaluate(() => Boolean((window as any).irrigationMapReady))).toBe(true);
  await page.locator("leaflet-geokit").scrollIntoViewIfNeeded();
  await expect(page.locator("leaflet-geokit .leaflet-container")).toBeVisible();
  await page.waitForTimeout(100);
}

async function dragTouch(page: Page, from: Point, to: Point): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y, radiusX: 8, radiusY: 8 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: to.x, y: to.y, radiusX: 8, radiusY: 8 }],
  });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(350);
}

async function ratioPoint(page: Page, xRatio: number, yRatio: number): Promise<Point> {
  return page.evaluate(({ xRatio, yRatio }) => {
    const controller = (document.querySelector("leaflet-geokit") as any)._controller;
    const rect = controller.map.getContainer().getBoundingClientRect();
    return { x: rect.left + rect.width * xRatio, y: rect.top + rect.height * yRatio };
  }, { xRatio, yRatio });
}

async function inputPoint(page: Page, point: Point, touch: boolean, dx = 0, dy = 0): Promise<void> {
  if (touch) {
    await page.touchscreen.tap(point.x + dx, point.y + dy);
    await page.waitForTimeout(320);
  } else {
    await page.mouse.click(point.x + dx, point.y + dy);
    await page.waitForTimeout(220);
  }
}

async function setSnapping(page: Page, modes: string[], grid = 1): Promise<void> {
  await page.evaluate(({ modes, grid }) => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.snapping = { enabled: true, modes, tolerancePx: 22, gridSizeMeters: grid, gridOrigin: [0, 0] };
    map.measurementOverlay = { enabled: true, autoScale: true };
  }, { modes, grid });
}

async function seed(page: Page, features: any[], layer?: any): Promise<void> {
  await page.evaluate(async ({ features, layer }) => {
    await (document.querySelector("leaflet-geokit") as any).importGeoJSON({ type: "FeatureCollection", features }, { behavior: "add", ...(layer ? { layer } : {}) });
  }, { features, layer });
}

async function state(page: Page): Promise<any> {
  return page.evaluate(async () => await (document.querySelector("leaflet-geokit") as any).getGeoJSON());
}

async function liveFeature(page: Page, id: string): Promise<any> {
  return page.evaluate((id) => {
    const controller = (document.querySelector("leaflet-geokit") as any)._controller;
    return controller.featureLayers.get(id)?.toGeoJSON();
  }, id);
}

async function drawSnappedTriangle(page: Page, modes: string[], touch: boolean, target: Point, targetDx = 7, targetDy = -5): Promise<any> {
  await setSnapping(page, modes);
  if (touch) await page.getByRole("button", { name: "Draw irrigation zone from panel" }).tap();
  else await page.getByRole("button", { name: "Draw irrigation zone from panel" }).click();
  await page.locator("leaflet-geokit").scrollIntoViewIfNeeded();
  await inputPoint(page, target, touch, targetDx, targetDy);
  const second = await ratioPoint(page, 0.62, 0.42);
  const third = await ratioPoint(page, 0.46, 0.34);
  await inputPoint(page, second, touch);
  await inputPoint(page, third, touch);
  await expect(page.locator(".geokit-measurement-overlay")).toContainText("Area:");
  await inputPoint(page, target, touch, targetDx, targetDy);
  await expect.poll(async () => (await state(page)).features.length).toBeGreaterThan(0);
  const value = await state(page);
  return value.features.find((feature: any) => feature.geometry.type === "Polygon");
}

test.describe("real snapping and measurement interactions", () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (page.isClosed()) return;
    const evidence = await page.evaluate(async () => {
      const element = document.querySelector("leaflet-geokit") as any;
      const controller = element?._controller;
      return {
        stored: element ? await element.getGeoJSON() : null,
        layers: element?.getLayers?.() ?? [],
        overlays: {
          measurement: document.querySelector(".geokit-measurement-overlay")?.textContent ?? null,
          snapFeedback: document.querySelector(".geokit-snap-feedback-label")?.textContent ?? null,
        },
        invalidOperationUnchanged: (window as any).invalidOperationUnchanged ?? null,
        cleanup: controller ? { interactionCleanupInstalled: Boolean(controller.interactionCleanup) } : null,
      };
    }).catch((error) => ({ error: String(error) }));
    await testInfo.attach("snapping-interaction-evidence", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json",
    });
    await page.screenshot({ path: testInfo.outputPath("snapping-interaction.png"), fullPage: true });
  });

  test("saves vertex, edge, grid, and guide snapped geometry", async ({ page }, testInfo) => {
    await ready(page);
    const touch = testInfo.project.name.includes("touch");
    const targetGeometry = await page.evaluate(() => {
      const c = (document.querySelector("leaflet-geokit") as any)._controller;
      const rect = c.map.getContainer().getBoundingClientRect();
      const start = c.map.mouseEventToLatLng({ clientX: rect.left + rect.width * 0.35, clientY: rect.top + rect.height * 0.5 } as any);
      const end = c.map.mouseEventToLatLng({ clientX: rect.left + rect.width * 0.55, clientY: rect.top + rect.height * 0.5 } as any);
      return { coordinates: [[start.lng, start.lat], [end.lng, end.lat]] };
    });
    const targetLine = { type: "Feature", id: "snap-line", properties: {}, geometry: { type: "LineString", coordinates: targetGeometry.coordinates } };

    await seed(page, [targetLine]);
    const endpoint = await ratioPoint(page, 0.35, 0.5);
    const vertex = await drawSnappedTriangle(page, ["vertex"], touch, endpoint);
    expect(vertex.geometry.coordinates[0][0][0]).toBeCloseTo(targetGeometry.coordinates[0][0], 5);
    expect(vertex.geometry.coordinates[0][0][1]).toBeCloseTo(targetGeometry.coordinates[0][1], 5);

    await page.evaluate(async () => await (document.querySelector("leaflet-geokit") as any).clearLayers());
    await seed(page, [targetLine]);
    const midpoint = await ratioPoint(page, 0.45, 0.5);
    const edge = await drawSnappedTriangle(page, ["edge"], touch, midpoint, 8, -6);
    expect(edge.geometry.coordinates[0][0][1]).toBeCloseTo(targetGeometry.coordinates[0][1], 5);

    await page.evaluate(async () => await (document.querySelector("leaflet-geokit") as any).clearLayers());
    const gridPoint = await ratioPoint(page, 0.5, 0.5);
    const grid = await drawSnappedTriangle(page, ["grid"], touch, gridPoint, 4, -4);
    const gridCoordinate = grid.geometry.coordinates[0][0];
    const gridLngStep = 1 / (110574 * Math.cos(0));
    const gridLatStep = 1 / 110574;
    expect(gridCoordinate[0] / gridLngStep).toBeCloseTo(Math.round(gridCoordinate[0] / gridLngStep), 1);
    expect(gridCoordinate[1] / gridLatStep).toBeCloseTo(Math.round(gridCoordinate[1] / gridLatStep), 1);

    await page.evaluate(async () => await (document.querySelector("leaflet-geokit") as any).clearLayers());
    const guideGeometry = await page.evaluate(() => {
      const c = (document.querySelector("leaflet-geokit") as any)._controller;
      const rect = c.map.getContainer().getBoundingClientRect();
      const start = c.map.mouseEventToLatLng({ clientX: rect.left + rect.width * 0.35, clientY: rect.top + rect.height * 0.58 } as any);
      const end = c.map.mouseEventToLatLng({ clientX: rect.left + rect.width * 0.55, clientY: rect.top + rect.height * 0.58 } as any);
      return { coordinates: [[start.lng, start.lat], [end.lng, end.lat]] };
    });
    const guide = { type: "Feature", id: "snap-guide", properties: {}, geometry: { type: "LineString", coordinates: guideGeometry.coordinates } };
    await seed(page, [guide], { id: "guide-layer", name: "Guide layer", kind: "guide" });
    const guidePoint = await ratioPoint(page, 0.45, 0.58);
    const snappedGuide = await drawSnappedTriangle(page, ["guide"], touch, guidePoint, -7, 5);
    expect(snappedGuide.geometry.coordinates[0][0][1]).toBeCloseTo(guideGeometry.coordinates[0][1], 5);
    await expect(page.locator(".geokit-snap-feedback-label")).toHaveCount(0);
  });

  test("snaps a real edited vertex, refreshes units, and cancel rolls back", async ({ page }, testInfo) => {
    await ready(page);
    const touch = testInfo.project.name.includes("touch");
    const polygon = { type: "Feature", id: "edit-zone", properties: {}, geometry: { type: "Polygon", coordinates: [[[-0.001, -0.001], [0.001, -0.001], [0.001, 0.001], [-0.001, 0.001], [-0.001, -0.001]]] } };
    const target = { type: "Feature", id: "edit-target", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } };
    await seed(page, [polygon, target]);
    await setSnapping(page, ["vertex"]);
    if (touch) await page.getByRole("button", { name: "Edit from panel" }).tap();
    else await page.getByRole("button", { name: "Edit from panel" }).click();
    const vertex = page.locator(".leaflet-editing-icon").first();
    await expect(vertex).toBeVisible();
    await page.evaluate(() => {
      const c = (document.querySelector("leaflet-geokit") as any)._controller;
      (window as any).__editBinding = c.drawnItems.getLayers().map((layer: any) => ({
        fid: layer._fid,
        handlers: layer.editing?._verticesHandlers?.map((handler: any) => handler._markers?.map((marker: any) => ({ bound: marker._geokitSnapBound, events: Object.keys(marker._events || {}) }))),
      }));
    });
    const from = await vertex.boundingBox();
    const destination = await ratioPoint(page, 0.5, 0.5);
    expect(from).not.toBeNull();
    if (touch) {
      await dragTouch(page, { x: from!.x + from!.width / 2, y: from!.y + from!.height / 2 }, destination);
    } else {
      await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
      await page.mouse.down();
      await page.mouse.move(destination.x, destination.y);
      await page.mouse.up();
    }
    await expect(page.locator(".geokit-measurement-overlay")).toContainText("Area:");
    await page.evaluate(async () => await (document.querySelector("leaflet-geokit") as any).setMeasurementUnits("imperial"));
    await expect(page.locator(".geokit-measurement-overlay")).toContainText(/ft²|ac/);
    const changed = await liveFeature(page, "edit-zone");
    expect(changed.geometry.coordinates[0][0][0]).toBeCloseTo(0, 5);
    expect(changed.geometry.coordinates[0][0][1]).toBeCloseTo(0, 5);
    const beforeCancel = await state(page);
    if (touch) await page.getByRole("link", { name: "Cancel", exact: true }).tap();
    else await page.getByRole("link", { name: "Cancel", exact: true }).click();
    expect((await state(page)).features.find((feature: any) => feature.id === "edit-zone").geometry).toEqual(polygon.geometry);
    expect(beforeCancel.features.length).toBe(2);
  });

  test("grower presets, invalid rollback, and cleanup leave inspectable evidence", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "Bed-width preset" }).click();
    await page.getByRole("button", { name: "Row-spacing preset" }).click();
    await page.getByRole("button", { name: "Irrigation-radius preset" }).click();
    await expect.poll(async () => (await state(page)).features.length).toBeGreaterThan(3);
    await page.getByRole("button", { name: "Try invalid preset" }).click();
    await expect(page.locator("#status")).toContainText("rolled back");
    await expect.poll(() => page.evaluate(() => (window as any).invalidOperationUnchanged)).toBe(true);

    await setSnapping(page, ["grid"]);
    await page.getByRole("button", { name: "Draw irrigation zone from panel" }).click();
    const point = await ratioPoint(page, 0.5, 0.5);
    await page.mouse.move(point.x + 6, point.y + 6);
    await expect(page.locator(".geokit-snap-feedback-label")).toBeVisible();
    await page.evaluate(async () => await (document.querySelector("leaflet-geokit") as any).deactivateTool());
    await expect(page.locator(".geokit-snap-feedback-label")).toHaveCount(0);
    await expect(page.locator(".geokit-measurement-overlay")).toHaveCount(0);
  });
});
