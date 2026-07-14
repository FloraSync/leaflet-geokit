import { expect, test, type Page } from "@playwright/test";

type MapPoint = { x: number; y: number };

async function waitForMapReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).mapReady)), {
      timeout: 30_000,
      message: "Expected the GeoKit test harness map to become ready",
    })
    .toBe(true);
  await expect(page.locator("leaflet-geokit .leaflet-container")).toBeVisible();
}

async function mountBlankMapPage(page: Page): Promise<void> {
  await page.goto("/e2e/blank-map.html");
  await waitForMapReady(page);
}

async function mapPoint(page: Page, xRatio: number, yRatio: number) {
  const mapContainer = page.locator("leaflet-geokit .leaflet-container");
  const box = await mapContainer.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: box!.x + box!.width * xRatio,
    y: box!.y + box!.height * yRatio,
  };
}

async function mapPointToPixels(
  page: Page,
  point: MapPoint,
): Promise<MapPoint> {
  return mapPoint(page, point.x, point.y);
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

async function drawThreePointTriangle(page: Page): Promise<MapPoint> {
  return drawPolygon(page, [
    { x: 0.28, y: 0.3 },
    { x: 0.44, y: 0.32 },
    { x: 0.42, y: 0.46 },
  ]);
}

async function drawFourPointPolygon(page: Page): Promise<MapPoint> {
  return drawPolygon(page, [
    { x: 0.28, y: 0.3 },
    { x: 0.44, y: 0.32 },
    { x: 0.45, y: 0.46 },
    { x: 0.32, y: 0.5 },
  ]);
}

async function drawPolygon(page: Page, points: MapPoint[]): Promise<MapPoint> {
  const [firstPoint, ...remainingPoints] = points;

  await page.locator("a.leaflet-draw-draw-polygon").click();
  await clickMapAt(page, firstPoint.x, firstPoint.y);
  for (const point of remainingPoints) {
    await page.waitForTimeout(250);
    await clickMapAt(page, point.x, point.y);
  }
  await page.waitForTimeout(500);

  return firstPoint;
}

async function finishPolygonOnFirstVertex(
  page: Page,
  firstPoint: MapPoint,
): Promise<void> {
  await clickMapAt(page, firstPoint.x, firstPoint.y);
}

async function openVertexDeleteMenu(
  page: Page,
  x: number,
  y: number,
): Promise<boolean> {
  const deleteButton = page.getByRole("button", { name: "Delete vertex" });

  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: "right" });
  try {
    await deleteButton.waitFor({ state: "visible", timeout: 1_500 });
    return true;
  } catch {
    // No-op: fallback to control-click path.
  }

  for (const modifier of ["Control", "Meta"] as const) {
    await page.keyboard.down(modifier);
    await page.mouse.click(x, y);
    await page.keyboard.up(modifier);

    try {
      await deleteButton.waitFor({ state: "visible", timeout: 1_500 });
      return true;
    } catch {
      // No-op: continue to next modifier.
    }
  }

  return false;
}

test.describe("GeoKit draw runtime coverage", () => {
  test("keeps polygon drawing interactive after three points and finishes on first-vertex click", async ({
    page,
  }) => {
    await page.goto("/e2e/test.html");
    await waitForMapReady(page);

    const createdEvents: unknown[] = [];
    await page.exposeFunction("recordCreatedEvent", (detail: unknown) => {
      createdEvents.push(detail);
    });
    await page.evaluate(() => {
      document
        .querySelector("leaflet-geokit")
        ?.addEventListener("leaflet-draw:created", (event) => {
          void (window as any).recordCreatedEvent(
            (event as CustomEvent).detail,
          );
        });
    });

    const firstPoint = await drawThreePointTriangle(page);

    await expect
      .poll(() => currentFeatureCount(page), {
        message:
          "A polygon must not be committed immediately after the third point",
      })
      .toBe(0);

    await finishPolygonOnFirstVertex(page, firstPoint);

    await expect
      .poll(() => currentFeatureCount(page), {
        message: "Clicking the first vertex should finish the polygon",
      })
      .toBe(1);
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0]).toMatchObject({ layerType: "polygon" });
  });

  test("opens the vertex context menu during edit mode and deletes a polygon vertex", async ({
    page,
  }) => {
    await page.goto("/e2e/test.html");
    await waitForMapReady(page);

    const firstPoint = await drawFourPointPolygon(page);
    await finishPolygonOnFirstVertex(page, firstPoint);

    await expect
      .poll(async () => currentFeatureCount(page), {
        message: "Polygon should be committed before editing",
      })
      .toBe(1);

    const beforeVertexCount = await page.evaluate(async () => {
      const map = document.querySelector("leaflet-geokit") as any;
      const geojson = await map.getGeoJSON();
      return geojson.features[0].geometry.coordinates[0].length;
    });

    await page.locator("a.leaflet-draw-edit-edit").click();

    const marker = await mapPointToPixels(page, firstPoint);
    await page.waitForTimeout(250);
    const menuOpened = await openVertexDeleteMenu(page, marker.x, marker.y);
    expect(menuOpened).toBe(true);

    const deleteButton = page.getByRole("button", { name: "Delete vertex" });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const map = document.querySelector("leaflet-geokit") as any;
          const geojson = await map.getGeoJSON();
          return geojson.features[0].geometry.coordinates[0].length;
        }),
      )
      .toBe(beforeVertexCount - 1);
  });

  test("does not create geometry on a non-interactive map", async ({
    page,
  }) => {
    await mountBlankMapPage(page);

    await expect(page.locator("a.leaflet-draw-draw-polygon")).toHaveCount(0);
    await expect(page.locator("a.leaflet-draw-edit-edit")).toHaveCount(0);
    await expect(page.locator("a.leaflet-draw-edit-remove")).toHaveCount(0);

    await clickMapAt(page, 0.5, 0.5);
    await expect
      .poll(() => currentFeatureCount(page), {
        message: "Blank map should keep feature count at zero",
      })
      .toBe(0);
  });
});
