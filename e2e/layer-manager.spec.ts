import { expect, test, type Page } from "@playwright/test";

async function drawCake(page: Page) {
  await page
    .getByRole("button", { name: "Start layer cake", exact: true })
    .click();
  const box = await page
    .locator("leaflet-geokit .leaflet-container")
    .boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width * 0.65,
    box!.y + box!.height * 0.55,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Save session", exact: true }),
  ).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  // The interaction harness is deterministic and does not depend on public tiles.
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/layer-manager.html");
  await expect
    .poll(() => page.evaluate(() => (window as any).layerHarnessReady))
    .toBe(true);
});

test("secondary button, sidebar ring edit/save, external styles and exact registry round trip", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await drawCake(page);
  await page.getByRole("button", { name: "Update rings", exact: true }).click();
  await expect(page.getByLabel("Session status")).toHaveText(
    "Orchard water zones: 3 rings",
  );
  await expect(
    page.locator("leaflet-geokit .leaflet-editing-icon"),
  ).not.toHaveCount(0);
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByLabel("Session status")).toHaveText("Session saved");
  await expect(page.getByLabel("Layers", { exact: true })).toContainText(
    "Orchard water zones: visible (3)",
  );
  const events = await page.evaluate(() => (window as any).layerEvents);
  expect(events.map((event: any) => event.name)).toEqual([
    "tool:layer-cake:session-started",
    "tool:layer-cake:session-changed",
    "tool:layer-cake:saved",
  ]);
  expect(events[2].detail).toMatchObject({
    commandId: "layer-harness-cake",
    source: "secondary-app-button",
    session: { name: "Orchard water zones" },
  });
  await page
    .getByRole("button", { name: "Open layer style", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Layer style", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Layer", { exact: true })
    .selectOption({ label: "Orchard water zones" });
  await page.getByLabel("Style preset", { exact: true }).selectOption("crop");
  await page.getByRole("button", { name: "Apply style", exact: true }).click();
  await expect(
    page.locator('leaflet-geokit path[stroke="#287a39"]'),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Close layer style", exact: true })
    .click();
  await page.getByLabel("Host-render style panel").check();
  await page
    .getByRole("button", { name: "Open layer style", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Layer style", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Apply reference style", exact: true })
    .click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveText(
    "Host style applied",
  );
  await page
    .getByRole("button", { name: "Toggle saved layer", exact: true })
    .click();
  await expect(page.getByLabel("Layers", { exact: true })).toContainText(
    "Orchard water zones: hidden (3)",
  );
  await page
    .getByRole("button", { name: "Export and restore layers", exact: true })
    .click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveText(
    "Layers round-trip exact",
  );
  const roundTrip = await page.evaluate(() => (window as any).layerRoundTrip);
  expect(roundTrip.after).toEqual(roundTrip.before);
  await expect(
    page.locator("leaflet-geokit path.leaflet-interactive"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Toggle saved layer", exact: true })
    .click();
  await expect(
    page.locator("leaflet-geokit path.leaflet-interactive"),
  ).toHaveCount(4);
  await page.screenshot({
    path: testInfo.outputPath("layer-manager.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("sidebar cancel discards draft and its handles without creating a group", async ({
  page,
}) => {
  await drawCake(page);
  await page.getByRole("button", { name: "Update rings", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel session", exact: true })
    .click();
  await expect(page.getByLabel("Session status")).toHaveText(
    "Session cancelled",
  );
  await expect(page.locator("leaflet-geokit .layer-cake-controls")).toHaveCount(
    0,
  );
  await expect(
    page.locator("leaflet-geokit .leaflet-editing-icon"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (document.querySelector("leaflet-geokit") as any).getLayers().length,
    ),
  ).toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as any).layerEvents.filter(
          (e: any) => e.name === "tool:layer-cake:cancelled",
        ).length,
    ),
  ).toBe(1);
});

test("Escape and native-toolbar replacement cancel the draft once with original correlation", async ({
  page,
}) => {
  await drawCake(page);
  await page.locator("leaflet-geokit .leaflet-container").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Session status")).toHaveText(
    "Session cancelled",
  );
  await expect(
    page.locator("leaflet-geokit .leaflet-editing-icon"),
  ).toHaveCount(0);
  await drawCake(page);
  await page.locator("leaflet-geokit .leaflet-draw-draw-polygon").click();
  await expect(page.getByLabel("Session status")).toHaveText(
    "Session cancelled",
  );
  await expect(page.locator("leaflet-geokit .layer-cake-controls")).toHaveCount(
    0,
  );
  const cancelled = await page.evaluate(() =>
    (window as any).layerEvents.filter(
      (e: any) => e.name === "tool:layer-cake:cancelled",
    ),
  );
  expect(cancelled).toHaveLength(2);
  for (const event of cancelled)
    expect(event.detail).toMatchObject({
      commandId: "layer-harness-cake",
      source: "secondary-app-button",
    });
});
