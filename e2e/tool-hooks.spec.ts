/**
 * e2e tests for integrated tool hooks and event emitters.
 *
 * The hooks.html harness creates <leaflet-geokit> programmatically so that
 * `toolHooks` and `toolEventEmitter` are attached before the element's
 * `connectedCallback` runs.  This is the idiomatic pattern for wiring hooks
 * at startup.
 *
 * A generic custom toolbar (no Leaflet internals) in the page reflects hook
 * and emitter state.  The tests drive Leaflet draw tools and assert on the
 * generic toolbar counters + the emitter log, verifying that:
 *
 *  - tool:layer-cake:session-started fires when a cake circle is drawn
 *  - tool:layer-cake:saved fires when the Layer Cake session is saved
 *  - tool:move:pending fires after a feature is dragged
 *  - tool:move:confirmed fires when the Save button is confirmed
 *  - tool:move:cancelled fires when the Cancel button is pressed
 *  - The toolEventEmitter also receives all five events
 */
import { test, expect, type Page } from "@playwright/test";

// ── Helpers ────────────────────────────────────────────────────────────────
const toolControlSelectors = [
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

async function waitForReady(page: Page): Promise<void> {
  const tag = page.locator("#evtTag");
  await expect
    .poll(async () => (await tag.textContent())?.trim().toLowerCase() ?? "", {
      timeout: 30_000,
      message: "Expected #evtTag to show 'ready'",
    })
    .toMatch(/^ready$/);
}

async function getMapBounds(page: Page) {
  const container = page.locator("leaflet-geokit .leaflet-container").first();
  const box = await container.boundingBox();
  expect(box, "Leaflet container must be visible").not.toBeNull();
  return box!;
}

async function dragMapBetween(
  page: Page,
  fromXRatio: number,
  fromYRatio: number,
  toXRatio: number,
  toYRatio: number,
): Promise<void> {
  const box = await getMapBounds(page);
  const fromX = box.x + box.width * fromXRatio;
  const fromY = box.y + box.height * fromYRatio;
  const toX = box.x + box.width * toXRatio;
  const toY = box.y + box.height * toYRatio;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.up();
}

/** Read the numeric value from a hook counter badge in the generic toolbar. */
async function readHookCount(page: Page, counterId: string): Promise<number> {
  const el = page.locator(`#${counterId}`);
  const text = await el.textContent();
  return Number(text?.trim() ?? "0");
}

/** Return the number of items in the emitter log list. */
async function readEmitterLogCount(page: Page): Promise<number> {
  return page.locator("#emitter-log li").count();
}

/** Return all event names logged to the emitter (from data-event attribute). */
async function readEmitterEventNames(page: Page): Promise<string[]> {
  const items = page.locator("#emitter-log li");
  const count = await items.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const attr = await items.nth(i).getAttribute("data-event");
    if (attr) names.push(attr);
  }
  return names;
}

/** Seed one marker feature directly via the element API so the move tool has
 *  something to drag without needing to draw one through the UI. */
async function seedMarker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const map = document.getElementById("map") as any;
    if (!map?.addFeatures) return;
    await map.addFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "e2e-marker" },
          geometry: { type: "Point", coordinates: [-104.9903, 39.7392] },
        },
      ],
    });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("Tool hooks harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/hooks.html");
    await waitForReady(page);
  });

  test("generic toolbar is visible with zero counts on load", async ({
    page,
  }) => {
    await expect(page.locator("#custom-toolbar")).toBeVisible();
    await expect(page.locator(".leaflet-draw.leaflet-control")).toBeVisible();

    for (const selector of toolControlSelectors) {
      await expect(page.locator(selector)).toBeVisible();
    }

    for (const id of [
      "hook-count-cake-started",
      "hook-count-cake-saved",
      "hook-count-move-pending",
      "hook-count-move-confirmed",
      "hook-count-move-cancelled",
    ]) {
      expect(await readHookCount(page, id)).toBe(0);
    }

    expect(await readEmitterLogCount(page)).toBe(0);
  });

  test("layer-cake hooks fire for session-started and saved", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // ── Activate the Layer Cake draw tool ──────────────────────────────────
    await page.locator("a.leaflet-draw-draw-cake").click();

    // Drag to create the base circle (DrawCake extends Draw.Circle — requires a drag)
    await dragMapBetween(page, 0.35, 0.4, 0.45, 0.5);

    // ── session-started hook must have fired ───────────────────────────────
    await expect
      .poll(() => readHookCount(page, "hook-count-cake-started"), {
        timeout: 10_000,
        message: "hook-count-cake-started should reach 1",
      })
      .toBe(1);

    // saved count stays at zero while session is active
    expect(await readHookCount(page, "hook-count-cake-saved")).toBe(0);

    // ── Save the cake ──────────────────────────────────────────────────────
    // The LayerCakeManager renders a "💾 Save" button inside the map.
    // It may take a moment to appear after the circle is placed.
    await expect(page.locator(".layer-cake-controls__save")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator(".layer-cake-controls__save").click();

    // ── saved hook must have fired ─────────────────────────────────────────
    await expect
      .poll(() => readHookCount(page, "hook-count-cake-saved"), {
        timeout: 10_000,
        message: "hook-count-cake-saved should reach 1",
      })
      .toBe(1);

    // Counts for unrelated events remain zero
    expect(await readHookCount(page, "hook-count-move-pending")).toBe(0);
    expect(await readHookCount(page, "hook-count-move-confirmed")).toBe(0);
    expect(await readHookCount(page, "hook-count-move-cancelled")).toBe(0);

    // ── Emitter must have received both events ─────────────────────────────
    const emittedNames = await readEmitterEventNames(page);
    expect(emittedNames).toContain("tool:layer-cake:session-started");
    expect(emittedNames).toContain("tool:layer-cake:saved");
  });

  test("move hooks fire for pending then confirmed", async ({ page }) => {
    test.setTimeout(60_000);

    await seedMarker(page);

    // ── Activate the move tool ─────────────────────────────────────────────
    await page.locator("a.leaflet-draw-draw-move").click();

    const markerIcon = page.locator(".leaflet-marker-icon").first();
    await expect(markerIcon).toBeVisible({ timeout: 5_000 });

    const markerBox = await markerIcon.boundingBox();
    expect(markerBox, "Marker must have a bounding box").not.toBeNull();

    // Drag the marker to trigger move:pending
    await page.mouse.move(
      markerBox!.x + markerBox!.width / 2,
      markerBox!.y + markerBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      markerBox!.x + markerBox!.width / 2 + 40,
      markerBox!.y + markerBox!.height / 2 + 25,
      { steps: 8 },
    );
    await page.mouse.up();

    // ── pending hook must have fired ───────────────────────────────────────
    await expect
      .poll(() => readHookCount(page, "hook-count-move-pending"), {
        timeout: 10_000,
        message: "hook-count-move-pending should reach 1",
      })
      .toBe(1);

    expect(await readHookCount(page, "hook-count-move-confirmed")).toBe(0);
    expect(await readHookCount(page, "hook-count-move-cancelled")).toBe(0);

    // ── Confirm the move ───────────────────────────────────────────────────
    // The move confirmation UI shows a "✓ Save" button inside the map container.
    await expect(page.getByText("✓ Save")).toBeVisible({ timeout: 5_000 });
    await page.getByText("✓ Save").click();

    // ── confirmed hook must have fired ─────────────────────────────────────
    await expect
      .poll(() => readHookCount(page, "hook-count-move-confirmed"), {
        timeout: 10_000,
        message: "hook-count-move-confirmed should reach 1",
      })
      .toBe(1);

    expect(await readHookCount(page, "hook-count-move-cancelled")).toBe(0);

    // ── Emitter must have received both move events ────────────────────────
    const emittedNames = await readEmitterEventNames(page);
    expect(emittedNames).toContain("tool:move:pending");
    expect(emittedNames).toContain("tool:move:confirmed");
  });

  test("move:cancelled hook fires when the move is cancelled", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await seedMarker(page);

    // ── Activate the move tool ─────────────────────────────────────────────
    await page.locator("a.leaflet-draw-draw-move").click();

    const markerIcon = page.locator(".leaflet-marker-icon").first();
    await expect(markerIcon).toBeVisible({ timeout: 5_000 });

    const markerBox = await markerIcon.boundingBox();
    expect(markerBox).not.toBeNull();

    // Drag to trigger pending
    await page.mouse.move(
      markerBox!.x + markerBox!.width / 2,
      markerBox!.y + markerBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      markerBox!.x + markerBox!.width / 2 + 35,
      markerBox!.y + markerBox!.height / 2 + 20,
      { steps: 8 },
    );
    await page.mouse.up();

    await expect
      .poll(() => readHookCount(page, "hook-count-move-pending"), {
        timeout: 10_000,
      })
      .toBe(1);

    // ── Cancel the move ────────────────────────────────────────────────────
    await expect(page.getByText("✕ Cancel")).toBeVisible({ timeout: 5_000 });
    await page.getByText("✕ Cancel").click();

    // ── cancelled hook must have fired; confirmed must stay zero ───────────
    await expect
      .poll(() => readHookCount(page, "hook-count-move-cancelled"), {
        timeout: 10_000,
        message: "hook-count-move-cancelled should reach 1",
      })
      .toBe(1);

    expect(await readHookCount(page, "hook-count-move-confirmed")).toBe(0);

    // ── Emitter must have received the cancelled event ─────────────────────
    const emittedNames = await readEmitterEventNames(page);
    expect(emittedNames).toContain("tool:move:pending");
    expect(emittedNames).toContain("tool:move:cancelled");
    expect(emittedNames).not.toContain("tool:move:confirmed");
  });

  test("all five hook events are captured end-to-end and emitter log matches", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // ── Layer Cake: session-started + saved ───────────────────────────────
    await page.locator("a.leaflet-draw-draw-cake").click();
    // Drag to create the base circle (DrawCake extends Draw.Circle — requires a drag)
    await dragMapBetween(page, 0.28, 0.38, 0.38, 0.48);
    await expect
      .poll(() => readHookCount(page, "hook-count-cake-started"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    await expect(page.locator(".layer-cake-controls__save")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator(".layer-cake-controls__save").click();
    await expect
      .poll(() => readHookCount(page, "hook-count-cake-saved"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    // ── Move: pending + confirmed ─────────────────────────────────────────
    // Seed a fresh marker (the cake save may have added polygons, marker is separate)
    await seedMarker(page);

    await page.locator("a.leaflet-draw-draw-move").click();

    const markerIcon = page.locator(".leaflet-marker-icon").first();
    await expect(markerIcon).toBeVisible({ timeout: 5_000 });
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
      { steps: 8 },
    );
    await page.mouse.up();

    await expect
      .poll(() => readHookCount(page, "hook-count-move-pending"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    await expect(page.getByText("✓ Save")).toBeVisible({ timeout: 5_000 });
    await page.getByText("✓ Save").click();

    await expect
      .poll(() => readHookCount(page, "hook-count-move-confirmed"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    // ── Move: pending + cancelled ─────────────────────────────────────────
    const movedMarkerIcon = page.locator(".leaflet-marker-icon").first();
    await expect(movedMarkerIcon).toBeVisible({ timeout: 5_000 });
    const movedBox = await movedMarkerIcon.boundingBox();
    expect(movedBox).not.toBeNull();

    await page.locator("a.leaflet-draw-draw-move").click();

    // Re-query for the marker after re-activating the tool
    const iconForCancel = page.locator(".leaflet-marker-icon").first();
    await expect(iconForCancel).toBeVisible({ timeout: 5_000 });
    const cancelBox = await iconForCancel.boundingBox();
    expect(cancelBox).not.toBeNull();

    await page.mouse.move(
      cancelBox!.x + cancelBox!.width / 2,
      cancelBox!.y + cancelBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelBox!.x + cancelBox!.width / 2 + 25,
      cancelBox!.y + cancelBox!.height / 2 + 15,
      { steps: 8 },
    );
    await page.mouse.up();

    await expect
      .poll(() => readHookCount(page, "hook-count-move-pending"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(1); // at least 2 pending events total

    await expect(page.getByText("✕ Cancel")).toBeVisible({ timeout: 5_000 });
    await page.getByText("✕ Cancel").click();

    await expect
      .poll(() => readHookCount(page, "hook-count-move-cancelled"), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);

    // ── Verify all five event names appear in the emitter log ─────────────
    const emittedNames = await readEmitterEventNames(page);
    const expectedEvents = [
      "tool:layer-cake:session-started",
      "tool:layer-cake:saved",
      "tool:move:pending",
      "tool:move:confirmed",
      "tool:move:cancelled",
    ];
    for (const eventName of expectedEvents) {
      expect(
        emittedNames,
        `Expected emitter to contain ${eventName}`,
      ).toContain(eventName);
    }

    // ── Also verify window.__toolHookLog and window.__emitterLog match ─────
    const hookLog: string[] = await page.evaluate(() =>
      ((window as any).__toolHookLog ?? []).map((e: any) => e.event),
    );
    const emitterLog: string[] = await page.evaluate(() =>
      ((window as any).__emitterLog ?? []).map((e: any) => e.event),
    );

    for (const eventName of expectedEvents) {
      expect(hookLog).toContain(eventName);
      expect(emitterLog).toContain(eventName);
    }
  });
});
