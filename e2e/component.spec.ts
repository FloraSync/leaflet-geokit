import { test, expect, type Page } from "@playwright/test";

type HarnessPage = {
  name: string;
  path: string;
};

const harnessPages: HarnessPage[] = [
  { name: "Bundled WC", path: "/" },
  { name: "External WC", path: "/external.html" },
  { name: "Preact", path: "/preact.html" },
  { name: "React", path: "/react.html" },
  { name: "Preact (Bundled)", path: "/preact-bundled.html" },
  { name: "React (Bundled)", path: "/react-bundled.html" },
];

const drawControlSelectors = [
  "a.leaflet-draw-draw-polyline",
  "a.leaflet-draw-draw-polygon",
  "a.leaflet-draw-draw-rectangle",
  "a.leaflet-draw-draw-circle",
  "a.leaflet-draw-draw-cake",
  "a.leaflet-draw-draw-marker",
  "a.leaflet-draw-draw-move",
  "a.leaflet-draw-edit-edit",
  "a.leaflet-draw-edit-remove",
  ".leaflet-ruler",
  ".leaflet-ruler-settings-button",
] as const;

const panelControlSelectors = [
  "#btnGet",
  "#btnClear",
  "#btnLoad",
  "#btnUpload",
  "#btnExport",
  "#btnMergePolygons",
] as const;

async function clickMapAt(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const mapContainer = page
    .locator("leaflet-geokit .leaflet-container")
    .first();
  const box = await mapContainer.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.click(
    box!.x + box!.width * xRatio,
    box!.y + box!.height * yRatio,
  );
}

async function dragMapBetween(
  page: Page,
  fromXRatio: number,
  fromYRatio: number,
  toXRatio: number,
  toYRatio: number,
): Promise<void> {
  const mapContainer = page
    .locator("leaflet-geokit .leaflet-container")
    .first();
  const box = await mapContainer.boundingBox();
  expect(box).not.toBeNull();

  const fromX = box!.x + box!.width * fromXRatio;
  const fromY = box!.y + box!.height * fromYRatio;
  const toX = box!.x + box!.width * toXRatio;
  const toY = box!.y + box!.height * toYRatio;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.up();
}

async function drawPolygon(page: Page): Promise<void> {
  await page.locator("a.leaflet-draw-draw-polygon").click();
  await clickMapAt(page, 0.3, 0.3);
  await clickMapAt(page, 0.4, 0.3);
  await clickMapAt(page, 0.4, 0.4);
  await clickMapAt(page, 0.3, 0.3); // close shape on first vertex
}

async function drawPolyline(page: Page): Promise<void> {
  await page.locator("a.leaflet-draw-draw-polyline").click();
  await clickMapAt(page, 0.55, 0.3);
  await clickMapAt(page, 0.63, 0.35);
  await clickMapAt(page, 0.7, 0.3);
  await clickMapAt(page, 0.7, 0.3);
}

async function drawRectangle(page: Page): Promise<void> {
  await page.locator("a.leaflet-draw-draw-rectangle").click();
  await dragMapBetween(page, 0.2, 0.62, 0.32, 0.74);
}

async function drawCircle(page: Page): Promise<void> {
  await page.locator("a.leaflet-draw-draw-circle").click();
  await dragMapBetween(page, 0.48, 0.66, 0.58, 0.76);
}

async function drawMarker(page: Page): Promise<void> {
  await page.locator("a.leaflet-draw-draw-marker").click();
  await clickMapAt(page, 0.72, 0.64);
}

test.describe("Dev harness tool parity smoke", () => {
  for (const harnessPage of harnessPages) {
    test(`${harnessPage.name} should load every harness tool and run smoke interactions`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.goto(harnessPage.path);

      const map = page.locator("leaflet-geokit").first();
      await expect(map).toBeVisible();

      const startupEventTag = page.locator("#evtTag");
      await expect
        .poll(
          async () =>
            (await startupEventTag.textContent())?.trim().toLowerCase() ?? "",
          {
            timeout: 30_000,
            message:
              "Expected startup event tag to indicate map readiness or initial tile provider selection",
          },
        )
        .toMatch(/^(ready|tile-provider-changed)$/);

      await page.evaluate(() => {
        const mapElement = document.querySelector("leaflet-geokit");
        if (!mapElement) return;
        (window as any).__e2eExportEventCount = 0;
        mapElement.addEventListener("leaflet-draw:export", () => {
          (window as any).__e2eExportEventCount += 1;
        });
      });

      await expect(page.locator(".leaflet-control-zoom")).toBeVisible();
      await expect(page.locator(".leaflet-draw.leaflet-control")).toBeVisible();

      for (const selector of drawControlSelectors) {
        await expect(page.locator(selector)).toBeVisible();
      }

      for (const selector of panelControlSelectors) {
        await expect(page.locator(selector)).toBeVisible();
      }

      // Use all draw tools in a lightweight smoke flow.
      await drawPolygon(page);
      await drawPolyline(page);
      await drawRectangle(page);
      await drawCircle(page);
      await drawMarker(page);

      // Try Layer Cake tool interaction (activate + one click).
      await page.locator("a.leaflet-draw-draw-cake").click();
      await clickMapAt(page, 0.22, 0.26);

      // Open/close edit and delete modes.
      await page.locator("a.leaflet-draw-edit-edit").click();
      await page.keyboard.press("Escape");
      await page.locator("a.leaflet-draw-edit-remove").click();
      await page.keyboard.press("Escape");

      // Ruler: activate and click two points for a measurement.
      await page.locator(".leaflet-ruler").first().click();
      await clickMapAt(page, 0.6, 0.52);
      await clickMapAt(page, 0.7, 0.58);
      await page.locator(".leaflet-ruler").first().click();

      // Ruler settings control: open/close modal.
      await page.locator(".leaflet-ruler-settings-button").click();
      await expect(
        page.locator(".leaflet-ruler-modal-overlay.is-open"),
      ).toBeVisible();
      await page.locator(".leaflet-ruler-modal-close").click();

      // Move tool: drag marker then confirm save.
      await page.locator("a.leaflet-draw-draw-move").click();
      const markerIcon = page.locator(".leaflet-marker-icon").first();
      await expect(markerIcon).toBeVisible();
      const markerBox = await markerIcon.boundingBox();
      expect(markerBox).not.toBeNull();
      await page.mouse.move(
        markerBox!.x + markerBox!.width / 2,
        markerBox!.y + markerBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        markerBox!.x + markerBox!.width / 2 + 30,
        markerBox!.y + markerBox!.height / 2 + 18,
        {
          steps: 8,
        },
      );
      await page.mouse.up();
      await page.getByRole("button", { name: /save/i }).click();

      // Panel flows: get -> clear -> load -> create polygons -> merge -> export
      await page.locator("#btnGet").click();
      await expect(page.locator("#out")).toContainText(
        '"method": "getGeoJSON"',
      );

      await page.locator("#btnClear").click();
      await expect(page.locator("#out")).toContainText(
        '"method": "clearLayers"',
      );

      await page.locator("#btnLoad").click();
      await expect(page.locator("#out")).toContainText(
        '"method": "loadGeoJSON"',
      );

      // Seed merge with deterministic polygon features (less flaky than UI drawing for this step).
      await page.evaluate(async () => {
        const map = document.querySelector("leaflet-geokit") as any;
        if (!map || typeof map.addFeatures !== "function") return;
        await map.addFeatures({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "merge-a" },
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-105.02, 39.73],
                    [-105.0, 39.73],
                    [-105.0, 39.75],
                    [-105.02, 39.75],
                    [-105.02, 39.73],
                  ],
                ],
              },
            },
            {
              type: "Feature",
              properties: { name: "merge-b" },
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-105.0, 39.73],
                    [-104.98, 39.73],
                    [-104.98, 39.75],
                    [-105.0, 39.75],
                    [-105.0, 39.73],
                  ],
                ],
              },
            },
          ],
        });
      });

      await page.locator("#btnMergePolygons").click();
      await expect
        .poll(async () => page.locator("#out").textContent())
        .toMatch(/"method":\s*"mergePolygons"/);

      await page.locator("#btnExport").click();
      await expect
        .poll(async () =>
          page.evaluate(() =>
            Number((window as any).__e2eExportEventCount ?? 0),
          ),
        )
        .toBeGreaterThan(0);
    });
  }
});
