import { expect, test, type Page } from "@playwright/test";

type PublicToolEvent = {
  type: string;
  detail: {
    tool: string;
    action?: "activate" | "deactivate";
    source: string;
    groupId?: string;
    commandId: string;
    previousTool?: string | null;
    activeTool?: string | null;
    featureIds?: string[];
    geometry?: {
      type: string;
      geometry?: { type: string };
      features?: Array<{ id?: string; geometry?: { type: string } }>;
    };
    handled?: boolean;
    error?: string;
  };
};

type InvocationSurface =
  "activateTool" | "triggerTool" | "activate-event" | "command-event";

type ToolCase = {
  tool: string;
  surface: InvocationSurface;
  persistent: boolean;
};

const LIFECYCLE_EVENTS = [
  "leaflet-geokit:tool-command",
  "leaflet-geokit:tool-commanded",
  "leaflet-geokit:tool-started",
  "leaflet-geokit:tool-completed",
  "leaflet-geokit:tool-cancelled",
  "leaflet-geokit:tool-failed",
  "leaflet-geokit:tool-state-changed",
] as const;

const COMPATIBILITY_EVENTS = [
  "leaflet-geokit:tool-trigger-requested",
  "leaflet-geokit:tool-triggered",
  "leaflet-geokit:tool-trigger-failed",
] as const;

const TOOL_CASES: ToolCase[] = [
  { tool: "polygon", surface: "activateTool", persistent: true },
  { tool: "polyline", surface: "triggerTool", persistent: true },
  { tool: "rectangle", surface: "activate-event", persistent: true },
  { tool: "circle", surface: "command-event", persistent: true },
  { tool: "marker", surface: "activateTool", persistent: true },
  { tool: "layerCake", surface: "triggerTool", persistent: true },
  { tool: "move", surface: "activate-event", persistent: true },
  { tool: "select", surface: "command-event", persistent: false },
  { tool: "edit", surface: "triggerTool", persistent: true },
  { tool: "delete", surface: "activate-event", persistent: true },
  { tool: "ruler", surface: "command-event", persistent: true },
  {
    tool: "measurementSettings",
    surface: "activateTool",
    persistent: false,
  },
  { tool: "layerStyle", surface: "triggerTool", persistent: false },
  { tool: "save", surface: "command-event", persistent: false },
];

const PERSISTENT_START_ORDER = [
  "leaflet-geokit:tool-command",
  "leaflet-geokit:tool-commanded",
  "leaflet-geokit:tool-started",
  "leaflet-geokit:tool-state-changed",
];

const ACTION_ORDER = [
  "leaflet-geokit:tool-command",
  "leaflet-geokit:tool-commanded",
  "leaflet-geokit:tool-completed",
];

async function waitForMap(page: Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (document.querySelector("leaflet-geokit") as any)?.status?.ready ===
          true,
      ),
    )
    .toBe(true);
  await expect(page.locator("leaflet-geokit .leaflet-container")).toBeVisible();

  await page.evaluate(
    ({ lifecycleEvents, compatibilityEvents }) => {
      const host = document.querySelector("leaflet-geokit")!;
      (window as any).__publicToolAcceptanceEvents = [];
      for (const eventName of [...lifecycleEvents, ...compatibilityEvents]) {
        host.addEventListener(eventName, (event: Event) => {
          const detail = (event as CustomEvent).detail;
          (window as any).__publicToolAcceptanceEvents.push({
            type: event.type,
            detail: structuredClone(detail),
          });
        });
      }
    },
    {
      lifecycleEvents: [...LIFECYCLE_EVENTS],
      compatibilityEvents: [...COMPATIBILITY_EVENTS],
    },
  );
}

async function recordedEvents(page: Page): Promise<PublicToolEvent[]> {
  return page.evaluate(
    () => (window as any).__publicToolAcceptanceEvents ?? [],
  );
}

async function clearRecordedEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__publicToolAcceptanceEvents.length = 0;
  });
}

function lifecycleFor(
  events: PublicToolEvent[],
  commandId: string,
): PublicToolEvent[] {
  return events.filter(
    (event) =>
      LIFECYCLE_EVENTS.includes(
        event.type as (typeof LIFECYCLE_EVENTS)[number],
      ) && event.detail.commandId === commandId,
  );
}

async function waitForEvent(
  page: Page,
  commandId: string,
  eventType: string,
): Promise<void> {
  await expect
    .poll(
      async () =>
        (await recordedEvents(page)).some(
          (event) =>
            event.type === eventType && event.detail.commandId === commandId,
        ),
      { message: `Expected ${eventType} for ${commandId}` },
    )
    .toBe(true);
}

async function invokeTool(
  page: Page,
  toolCase: ToolCase,
  commandId: string,
): Promise<void> {
  const source = `acceptance-${toolCase.surface}`;
  const groupId = `public-${toolCase.surface}`;
  const handled = await page.evaluate(
    async ({ tool, surface, source, groupId, commandId }) => {
      const host = document.querySelector("leaflet-geokit") as any;
      const options = { source, groupId, commandId };
      if (surface === "activateTool") {
        return host.activateTool(tool, options);
      }
      if (surface === "triggerTool") {
        return host.triggerTool(tool, options);
      }
      if (surface === "activate-event") {
        host.dispatchEvent(
          new CustomEvent("leaflet-geokit:activate-tool", {
            bubbles: true,
            composed: true,
            detail: { tool, ...options },
          }),
        );
        return undefined;
      }
      host.dispatchEvent(
        new CustomEvent("leaflet-geokit:tool-command", {
          bubbles: true,
          composed: true,
          detail: { tool, ...options },
        }),
      );
      return undefined;
    },
    {
      tool: toolCase.tool,
      surface: toolCase.surface,
      source,
      groupId,
      commandId,
    },
  );

  if (
    toolCase.surface === "activateTool" ||
    toolCase.surface === "triggerTool"
  ) {
    expect(handled).toBe(true);
  }
  await waitForEvent(page, commandId, "leaflet-geokit:tool-triggered");
}

async function deactivateTool(
  page: Page,
  tool: string,
  activeCommandId: string,
): Promise<void> {
  const commandId = `stop-${tool}`;
  await expect(
    page.evaluate((id) => {
      const host = document.querySelector("leaflet-geokit") as any;
      return host.deactivateTool({
        source: "acceptance-deactivate",
        groupId: "public-deactivate",
        commandId: id,
      });
    }, commandId),
  ).resolves.toBe(true);
  await waitForEvent(page, commandId, "leaflet-geokit:tool-triggered");

  const events = await recordedEvents(page);
  const activeLifecycle = lifecycleFor(events, activeCommandId);
  expect(activeLifecycle.slice(-2).map((event) => event.type)).toEqual([
    "leaflet-geokit:tool-cancelled",
    "leaflet-geokit:tool-state-changed",
  ]);
  expect(activeLifecycle.at(-1)?.detail).toMatchObject({
    tool,
    previousTool: tool,
    activeTool: null,
  });

  const stopLifecycle = lifecycleFor(events, commandId);
  expect(stopLifecycle.map((event) => event.type)).toEqual(ACTION_ORDER);
  expect(stopLifecycle.at(-1)?.detail).toMatchObject({
    tool: "select",
    action: "deactivate",
    source: "acceptance-deactivate",
    groupId: "public-deactivate",
    commandId,
    previousTool: tool,
    activeTool: null,
    featureIds: [],
  });
  expectCompatibilityPair(events, commandId, "select");
}

function expectCompatibilityPair(
  events: PublicToolEvent[],
  commandId: string,
  tool: string,
): void {
  const compatibility = events.filter(
    (event) =>
      COMPATIBILITY_EVENTS.includes(
        event.type as (typeof COMPATIBILITY_EVENTS)[number],
      ) && event.detail.commandId === commandId,
  );
  expect(compatibility.map((event) => event.type)).toEqual([
    "leaflet-geokit:tool-trigger-requested",
    "leaflet-geokit:tool-triggered",
  ]);
  for (const event of compatibility) {
    expect(event.detail).toMatchObject({ tool, commandId });
  }
  expect(compatibility.at(-1)?.detail.handled).toBe(true);
}

async function seedPublicMarker(
  page: Page,
  requestedId: string,
): Promise<string> {
  const ids = await page.evaluate(async (id) => {
    const host = document.querySelector("leaflet-geokit") as any;
    return host.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id,
          properties: { acceptance: true },
          geometry: {
            type: "Point",
            coordinates: [-104.9903, 39.7392],
          },
        },
      ],
    });
  }, requestedId);
  expect(ids).toHaveLength(1);
  return ids[0];
}

async function mapBox(page: Page) {
  const box = await page
    .locator("leaflet-geokit .leaflet-container")
    .boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function clickMap(page: Page, xRatio: number, yRatio: number) {
  const box = await mapBox(page);
  await page.mouse.click(
    box.x + box.width * xRatio,
    box.y + box.height * yRatio,
  );
  // Leaflet.draw briefly suppresses consecutive vertex clicks to reject double clicks.
  await page.waitForTimeout(75);
}

async function dragMap(
  page: Page,
  fromXRatio: number,
  fromYRatio: number,
  toXRatio: number,
  toYRatio: number,
) {
  const box = await mapBox(page);
  await page.mouse.move(
    box.x + box.width * fromXRatio,
    box.y + box.height * fromYRatio,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * toXRatio,
    box.y + box.height * toYRatio,
    { steps: 8 },
  );
  await page.mouse.up();
}

async function dragElement(
  page: Page,
  selector: string,
  offsetX: number,
  offsetY: number,
) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + offsetX, y + offsetY, { steps: 8 });
  await page.mouse.up();
}

async function startPublicTool(
  page: Page,
  tool: string,
  commandId: string,
): Promise<void> {
  await expect(
    page.evaluate(
      ({ tool, commandId }) => {
        const host = document.querySelector("leaflet-geokit") as any;
        return host.activateTool(tool, {
          source: "completion-acceptance",
          groupId: "completion-group",
          commandId,
        });
      },
      { tool, commandId },
    ),
  ).resolves.toBe(true);
  await waitForEvent(page, commandId, "leaflet-geokit:tool-started");
}

test.describe("public element all-tool acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await waitForMap(page);
  });

  test("routes all supported tools and public invocation surfaces through the host bus", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedPublicMarker(page, "matrix-seed");

    for (const toolCase of TOOL_CASES) {
      if (toolCase.tool === "select") {
        await page.evaluate(() => {
          const events = (window as any).__publicToolAcceptanceEvents;
          const host = document.querySelector("leaflet-geokit") as any;
          return host
            .activateTool("marker", {
              source: "select-setup",
              groupId: "select-setup",
              commandId: "select-setup-marker",
            })
            .then(() => {
              events.length = 0;
            });
        });
      } else {
        await clearRecordedEvents(page);
      }

      const commandId = `matrix-${toolCase.tool}`;
      await invokeTool(page, toolCase, commandId);
      const events = await recordedEvents(page);
      const lifecycle = lifecycleFor(events, commandId);

      expect(lifecycle.map((event) => event.type)).toEqual(
        toolCase.persistent ? PERSISTENT_START_ORDER : ACTION_ORDER,
      );
      for (const event of lifecycle) {
        expect(event.detail).toMatchObject({
          tool: toolCase.tool,
          action: toolCase.tool === "select" ? "deactivate" : "activate",
          source: `acceptance-${toolCase.surface}`,
          groupId: `public-${toolCase.surface}`,
          commandId,
          featureIds: expect.any(Array),
        });
      }

      if (toolCase.persistent) {
        expect(lifecycle.at(-1)?.detail).toMatchObject({
          previousTool: null,
          activeTool: toolCase.tool,
        });
      } else {
        expect(lifecycle.at(-1)?.detail).toMatchObject({
          previousTool: toolCase.tool === "select" ? "marker" : null,
          activeTool: null,
        });
      }
      expectCompatibilityPair(events, commandId, toolCase.tool);

      if (toolCase.tool === "save") {
        expect(lifecycle.at(-1)?.detail.geometry).toMatchObject({
          type: "FeatureCollection",
          features: expect.any(Array),
        });
      }

      if (toolCase.persistent) {
        await deactivateTool(page, toolCase.tool, commandId);
      } else if (toolCase.tool === "measurementSettings") {
        await page.evaluate(() => {
          const host = document.querySelector("leaflet-geokit") as any;
          return host.deactivateTool({
            commandId: "close-measurement-settings",
          });
        });
      }
    }
  });

  test("reports terminal ids and geometry for remaining primitive draws", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const draws = [
      {
        tool: "rectangle",
        geometryType: "Polygon",
        draw: () => dragMap(page, 0.2, 0.58, 0.32, 0.72),
      },
      {
        tool: "circle",
        geometryType: "Point",
        draw: () => dragMap(page, 0.46, 0.58, 0.56, 0.72),
      },
      {
        tool: "marker",
        geometryType: "Point",
        draw: () => clickMap(page, 0.72, 0.62),
      },
    ];

    for (const draw of draws) {
      await clearRecordedEvents(page);
      const commandId = `complete-${draw.tool}`;
      await startPublicTool(page, draw.tool, commandId);
      await draw.draw();
      await waitForEvent(page, commandId, "leaflet-geokit:tool-completed");
      await expect
        .poll(
          async () =>
            lifecycleFor(await recordedEvents(page), commandId).at(-1)?.detail
              .activeTool,
        )
        .toBeNull();

      const lifecycle = lifecycleFor(await recordedEvents(page), commandId);
      expect(lifecycle.map((event) => event.type)).toEqual([
        ...PERSISTENT_START_ORDER,
        "leaflet-geokit:tool-completed",
        "leaflet-geokit:tool-state-changed",
      ]);
      const completed = lifecycle.at(-2)!;
      expect(completed.detail).toMatchObject({
        tool: draw.tool,
        commandId,
        activeTool: draw.tool,
        featureIds: [expect.any(String)],
        geometry: {
          type: "Feature",
          geometry: { type: draw.geometryType },
        },
      });
      expect(lifecycle.at(-1)?.detail).toMatchObject({
        previousTool: draw.tool,
        activeTool: null,
      });
    }
  });

  test("publishes terminal edit and delete completions with public seed ids", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const editId = await seedPublicMarker(page, "edit-seed");
    await clearRecordedEvents(page);
    await startPublicTool(page, "edit", "complete-edit");
    await dragElement(page, ".leaflet-marker-icon", 36, 20);
    await page
      .locator("leaflet-geokit .leaflet-draw-actions a")
      .filter({ hasText: /^Save$/ })
      .click();
    await waitForEvent(page, "complete-edit", "leaflet-geokit:tool-completed");

    const editLifecycle = lifecycleFor(
      await recordedEvents(page),
      "complete-edit",
    );
    expect(editLifecycle.map((event) => event.type)).toEqual([
      ...PERSISTENT_START_ORDER,
      "leaflet-geokit:tool-completed",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(editLifecycle.at(-2)?.detail).toMatchObject({
      featureIds: [editId],
      activeTool: "edit",
      geometry: {
        type: "FeatureCollection",
        features: expect.any(Array),
      },
    });
    expect(editLifecycle.at(-1)?.detail.activeTool).toBeNull();

    await page.evaluate(async () => {
      const host = document.querySelector("leaflet-geokit") as any;
      await host.clearLayers();
    });
    const deleteId = await seedPublicMarker(page, "delete-seed");
    await clearRecordedEvents(page);
    await startPublicTool(page, "delete", "complete-delete");
    await page.locator("leaflet-geokit .leaflet-marker-icon").click();
    await page
      .locator("leaflet-geokit .leaflet-draw-actions a")
      .filter({ hasText: /^Save$/ })
      .click();
    await waitForEvent(
      page,
      "complete-delete",
      "leaflet-geokit:tool-completed",
    );

    const deleteLifecycle = lifecycleFor(
      await recordedEvents(page),
      "complete-delete",
    );
    expect(deleteLifecycle.map((event) => event.type)).toEqual([
      ...PERSISTENT_START_ORDER,
      "leaflet-geokit:tool-completed",
      "leaflet-geokit:tool-state-changed",
    ]);
    expect(deleteLifecycle.at(-2)?.detail).toMatchObject({
      featureIds: [deleteId],
      activeTool: "delete",
      geometry: { type: "FeatureCollection", features: [] },
    });
    expect(deleteLifecycle.at(-1)?.detail.activeTool).toBeNull();
  });

  test("keeps move persistent after a correlated completion", async ({
    page,
  }) => {
    const moveId = await seedPublicMarker(page, "move-seed");
    await clearRecordedEvents(page);
    await startPublicTool(page, "move", "complete-move");
    await dragElement(page, ".leaflet-marker-icon", 40, 24);
    await page.getByRole("button", { name: "Save" }).click();
    await waitForEvent(page, "complete-move", "leaflet-geokit:tool-completed");

    const lifecycle = lifecycleFor(await recordedEvents(page), "complete-move");
    expect(lifecycle.map((event) => event.type)).toEqual([
      ...PERSISTENT_START_ORDER,
      "leaflet-geokit:tool-completed",
    ]);
    expect(lifecycle.at(-1)?.detail).toMatchObject({
      featureIds: [moveId],
      activeTool: "move",
      geometry: {
        type: "Feature",
        geometry: { type: "Point" },
      },
    });

    await deactivateTool(page, "move", "complete-move");
  });

  test("managed-toolbar LayerCake preserves bus correlation through manager Save", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.evaluate(() => {
      const host = document.querySelector("leaflet-geokit") as any;
      host.toolbarGroups = [
        {
          id: "acceptance-layer-cake",
          tools: ["layerCake"],
          hideDefaultToolbar: false,
        },
      ];
    });
    const toolbarButton = page.locator(
      'leaflet-geokit [data-geokit-toolbar-group="acceptance-layer-cake"] [data-geokit-tool="layer-cake"]',
    );
    await expect(toolbarButton).toBeVisible();
    await clearRecordedEvents(page);
    await toolbarButton.click();

    await expect
      .poll(
        async () =>
          (await recordedEvents(page)).find(
            (event) =>
              event.type === "leaflet-geokit:tool-started" &&
              event.detail.tool === "layerCake" &&
              event.detail.groupId === "acceptance-layer-cake",
          )?.detail.commandId,
      )
      .toEqual(expect.any(String));
    const started = (await recordedEvents(page)).find(
      (event) =>
        event.type === "leaflet-geokit:tool-started" &&
        event.detail.tool === "layerCake" &&
        event.detail.groupId === "acceptance-layer-cake",
    )!;
    const commandId = started.detail.commandId;
    expect(lifecycleFor(await recordedEvents(page), commandId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "leaflet-geokit:tool-command",
          detail: expect.objectContaining({
            source: "toolbar",
            groupId: "acceptance-layer-cake",
            commandId,
          }),
        }),
      ]),
    );

    await dragMap(page, 0.36, 0.38, 0.46, 0.5);
    const save = page.locator("leaflet-geokit .layer-cake-controls__save");
    await expect(save).toBeVisible();
    await save.click();
    await waitForEvent(page, commandId, "leaflet-geokit:tool-completed");

    const completed = lifecycleFor(await recordedEvents(page), commandId).find(
      (event) => event.type === "leaflet-geokit:tool-completed",
    )!;
    expect(completed.detail).toMatchObject({
      tool: "layerCake",
      source: "toolbar",
      groupId: "acceptance-layer-cake",
      commandId,
      activeTool: "layerCake",
      featureIds: [expect.any(String)],
      geometry: {
        type: "FeatureCollection",
        features: expect.any(Array),
      },
    });
    await expect
      .poll(
        async () =>
          lifecycleFor(await recordedEvents(page), commandId).at(-1)?.detail
            .activeTool,
      )
      .toBeNull();
  });
});
