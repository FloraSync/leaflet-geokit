import { expect, test, type Page } from "@playwright/test";

type LifecycleRecord = {
  type: string;
  detail: {
    tool: string;
    source: string;
    groupId?: string;
    commandId: string;
    previousTool: string | null;
    activeTool: string | null;
    featureIds: string[];
    geometry?: { type: string };
    reason?: string;
  };
};

async function waitForMap(page: Page): Promise<void> {
  await page.goto("/irrigation-draw-mode.html");
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).irrigationMapReady)),
    )
    .toBe(true);
  await expect(page.locator("leaflet-geokit .leaflet-container")).toBeVisible();
}

async function lifecycleEvents(page: Page): Promise<LifecycleRecord[]> {
  return page.evaluate(() => (window as any).irrigationToolEvents ?? []);
}

async function dragLayerCakeBase(page: Page): Promise<void> {
  const box = await page
    .locator("leaflet-geokit .leaflet-container")
    .boundingBox();
  expect(box).not.toBeNull();
  const start = {
    x: box!.x + box!.width * 0.52,
    y: box!.y + box!.height * 0.43,
  };
  const end = {
    x: box!.x + box!.width * 0.63,
    y: box!.y + box!.height * 0.53,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test.describe("public tool lifecycle bus", () => {
  test.beforeEach(async ({ page }) => {
    await waitForMap(page);
  });

  test("outside event button keeps LayerCake correlation until real manager save", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: "Start Layer Cake from panel" })
      .click();

    await expect
      .poll(async () =>
        (await lifecycleEvents(page))
          .filter((event) => event.detail.commandId === "outside-layer-cake")
          .map((event) => event.type),
      )
      .toEqual([
        "leaflet-geokit:tool-command",
        "leaflet-geokit:tool-commanded",
        "leaflet-geokit:tool-started",
        "leaflet-geokit:tool-state-changed",
      ]);

    const started = (await lifecycleEvents(page)).find(
      (event) =>
        event.type === "leaflet-geokit:tool-started" &&
        event.detail.commandId === "outside-layer-cake",
    );
    expect(started?.detail).toMatchObject({
      tool: "layerCake",
      source: "external-layer-cake-button",
      groupId: "external-panel",
      previousTool: null,
      activeTool: "layerCake",
      featureIds: [],
    });

    await dragLayerCakeBase(page);
    const cakeSave = page.locator("leaflet-geokit .layer-cake-controls__save");
    await expect(cakeSave).toBeVisible();

    expect(
      (await lifecycleEvents(page)).some(
        (event) =>
          event.type === "leaflet-geokit:tool-completed" &&
          event.detail.commandId === "outside-layer-cake",
      ),
    ).toBe(false);

    await cakeSave.click();
    await expect
      .poll(
        async () =>
          (await lifecycleEvents(page)).find(
            (event) =>
              event.type === "leaflet-geokit:tool-completed" &&
              event.detail.commandId === "outside-layer-cake",
          )?.detail,
      )
      .toMatchObject({
        tool: "layerCake",
        source: "external-layer-cake-button",
        groupId: "external-panel",
        commandId: "outside-layer-cake",
        activeTool: "layerCake",
        geometry: { type: "FeatureCollection" },
      });

    const completed = (await lifecycleEvents(page)).find(
      (event) =>
        event.type === "leaflet-geokit:tool-completed" &&
        event.detail.commandId === "outside-layer-cake",
    );
    expect(completed?.detail.featureIds.length).toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          [...(await lifecycleEvents(page))]
            .reverse()
            .find((event) => event.type === "leaflet-geokit:tool-state-changed")
            ?.detail.activeTool,
      )
      .toBeNull();
  });

  test("outside method buttons stop, save, and expose unavailable-tool failure", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: "Draw irrigation zone from panel" })
      .click();
    await expect
      .poll(async () =>
        (await lifecycleEvents(page)).some(
          (event) =>
            event.type === "leaflet-geokit:tool-started" &&
            event.detail.tool === "polygon" &&
            event.detail.source === "external-irrigation-button",
        ),
      )
      .toBe(true);

    const polygonStarted = (await lifecycleEvents(page)).find(
      (event) =>
        event.type === "leaflet-geokit:tool-started" &&
        event.detail.tool === "polygon",
    )!;
    await page.getByRole("button", { name: "Stop active tool" }).click();
    await expect
      .poll(
        async () =>
          (await lifecycleEvents(page)).find(
            (event) =>
              event.type === "leaflet-geokit:tool-cancelled" &&
              event.detail.commandId === polygonStarted.detail.commandId,
          )?.detail.activeTool,
      )
      .toBeNull();
    await expect
      .poll(
        async () =>
          (await lifecycleEvents(page)).find(
            (event) =>
              event.type === "leaflet-geokit:tool-completed" &&
              event.detail.commandId === "outside-stop",
          )?.detail,
      )
      .toMatchObject({
        tool: "select",
        source: "external-stop-button",
        groupId: "external-panel",
        activeTool: null,
      });

    await page.getByRole("button", { name: "Save from panel" }).click();
    await expect
      .poll(
        async () =>
          (await lifecycleEvents(page)).find(
            (event) =>
              event.type === "leaflet-geokit:tool-completed" &&
              event.detail.commandId === "outside-save",
          )?.detail,
      )
      .toMatchObject({
        tool: "save",
        source: "external-save-button",
        groupId: "external-panel",
        geometry: { type: "FeatureCollection" },
      });

    await page
      .getByRole("button", { name: "Try unavailable polyline" })
      .click();
    await expect
      .poll(
        async () =>
          (await lifecycleEvents(page)).find(
            (event) =>
              event.type === "leaflet-geokit:tool-failed" &&
              event.detail.commandId === "outside-failure",
          )?.detail,
      )
      .toMatchObject({
        tool: "polyline",
        source: "external-failure-button",
        groupId: "external-panel",
        activeTool: null,
        reason: expect.stringContaining("not available"),
      });
  });
});
