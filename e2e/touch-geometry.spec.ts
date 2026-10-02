import { expect, test, type Page } from "@playwright/test";

const tool = (page: Page, name: string) => page.locator(`[data-geokit-managed-toolbar] [data-geokit-tool='${name}']`);
const host = "leaflet-geokit";
const snapshot = (page: Page) => page.evaluate(async () => {
  const element = document.querySelector("leaflet-geokit") as any;
  const controller = element._controller;
  return { stored: await element.getGeoJSON(), live: controller.drawnItems.toGeoJSON(), dragging: controller.map.dragging.enabled(), center: controller.map.getCenter(), events: (window as any).irrigationToolEvents, pointers: (window as any).__touchPointers };
});
const gesture = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  const send = async (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", x = 0, y = 0) => {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
    // Give Chromium's post-drag tap suppression / Leaflet double-tap window
    // time to settle before a separate finger taps a confirmation control.
    await page.waitForTimeout(type === "touchEnd" ? 350 : 40);
  };
  return { send, close: () => cdp.detach() };
};
const geometry = (value: any) => value.features.map((f: any) => f.geometry);
const featurePoint = async (page: Page) => page.evaluate(() => {
  const c = (document.querySelector("leaflet-geokit") as any)._controller;
  const layer = c.drawnItems.getLayers()[0];
  const p = c.map.latLngToContainerPoint(layer.getBounds().getCenter());
  const r = c.map.getContainer().getBoundingClientRect();
  return { x: r.x + p.x, y: r.y + p.y };
});

async function seed(page: Page) {
  await page.evaluate(async () => {
    await (document.querySelector("leaflet-geokit") as any).addFeatures({ type: "FeatureCollection", features: [{ type: "Feature", id: "touch-zone", properties: {}, geometry: { type: "Polygon", coordinates: [[[-0.001, -0.001], [0.001, -0.001], [0.001, 0.001], [-0.001, 0.001], [-0.001, -0.001]]] } }] });
  });
}

async function setup(page: Page, svg = false) {
  await page.goto("/irrigation-draw-mode.html");
  await expect.poll(() => page.evaluate(() => Boolean((window as any).irrigationMapReady))).toBe(true);
  await page.evaluate(async useSvg => {
    const element = document.querySelector("leaflet-geokit") as any;
    // Keep this gesture fixture bounded even when the demo adds sibling tools.
    for (const name of ["draw-polyline", "draw-rectangle", "draw-circle"]) element.removeAttribute(name);
    element.setAttribute("draw-move", "");
    if (useSvg) { element.preferCanvas = true; element.preferCanvas = false; }
    element.toolButtonConfig = {};
    element.toolbarGroups = [{ id: "touch", tools: ["polygon", "move", "select", "edit", "delete", "save"], preset: "responsive", orientation: "horizontal", hideDefaultToolbar: false }];
    await element._configurationUpdate;
  }, svg);
  await expect.poll(() => page.evaluate(() => (document.querySelector("leaflet-geokit") as any).status.ready)).toBe(true);
  await page.locator(host).scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    (window as any).__touchPointers = [];
    const container = (document.querySelector("leaflet-geokit") as any)._controller.map.getContainer();
    for (const type of ["pointerdown", "pointerup", "pointercancel", "gotpointercapture", "lostpointercapture", "mousedown", "click", "touchstart", "touchend"]) container.addEventListener(type, (event: any) => (window as any).__touchPointers.push({ type, trusted: event.isTrusted, pointerType: event.pointerType, pointerId: event.pointerId, target: event.target.tagName, text: event.target.textContent?.slice(0, 20), prevented: event.defaultPrevented }), true);
  });
}

test.beforeEach(async ({ page }, info) => {
  const svg = Boolean(info.project.metadata.svg);
  await setup(page, svg);
  expect(await page.evaluate(() => (document.querySelector("leaflet-geokit") as any)._controller.map.options.preferCanvas)).toBe(!svg);
});
test.afterEach(async ({ page }, info) => {
  if (!page.isClosed()) {
    const evidence = await snapshot(page).catch(error => ({ error: String(error) }));
    await info.attach("touch-evidence", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath("touch-harness.png"), fullPage: true });
  }
});

test("touch polygon creation uses vertices and closes once", async ({ page }) => {
  await tool(page, "polygon").tap();
  const box = await page.locator("[data-geokit-map-container]").boundingBox();
  expect(box).not.toBeNull();
  const points = [[box!.x + 120, box!.y + 170], [box!.x + 250, box!.y + 170], [box!.x + 240, box!.y + 300]];
  for (const [x, y] of [...points, points[0]]) {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(300); // Leaflet.draw's vertex debounce is 250ms.
  }
  await expect.poll(async () => (await snapshot(page)).stored.features.length).toBe(1);
  const result = await snapshot(page);
  expect(result.stored.features[0].geometry.type).toBe("Polygon");
  expect(result.events.filter((e: any) => e.type.endsWith("tool-completed") && e.detail.tool === "polygon")).toHaveLength(1);
  const start = result.events.find((e: any) => e.type.endsWith("tool-started") && e.detail.tool === "polygon");
  expect(result.events.find((e: any) => e.type.endsWith("tool-completed") && e.detail.tool === "polygon").detail.commandId).toBe(start.detail.commandId);
});

test("touch edit changes geometry, cancel rolls back, Save persists", async ({ page }) => {
  await seed(page);
  const before = await snapshot(page);
  for (const save of [false, true]) {
    await tool(page, "edit").tap();
    const vertex = page.locator(".leaflet-editing-icon").first();
    await expect(vertex).toBeVisible();
    const box = await vertex.boundingBox();
    const touch = await gesture(page);
    await touch.send("touchStart", box!.x + box!.width / 2, box!.y + box!.height / 2);
    await touch.send("touchMove", box!.x + box!.width / 2 + 35, box!.y + box!.height / 2 + 30);
    await touch.send("touchEnd");
    await touch.close();
    await expect.poll(async () => geometry((await snapshot(page)).live)).not.toEqual(geometry(before.live));
    const changed = geometry((await snapshot(page)).live);
    await page.getByRole("link", { name: save ? "Save" : "Cancel", exact: true }).tap();
    await expect.poll(async () => geometry((await snapshot(page)).stored)).toEqual(save ? changed : geometry(before.stored));
    if (!save) expect(geometry((await snapshot(page)).live)).toEqual(geometry(before.live));
  }
  const events = (await snapshot(page)).events;
  const starts = events.filter((e: any) => e.type.endsWith("tool-started") && e.detail.tool === "edit");
  const completed = events.filter((e: any) => e.type.endsWith("tool-completed") && e.detail.tool === "edit");
  expect(starts).toHaveLength(2);
  expect(completed).toHaveLength(1);
  expect(completed[0].detail.commandId).toBe(starts[1].detail.commandId);
});

test("touch edit applies raw movement outside snap tolerance with snapping enabled or disabled", async ({ page }) => {
  await seed(page);
  const before = await snapshot(page);

  await page.evaluate(() => {
    (document.querySelector("leaflet-geokit") as any).snapping = {
      enabled: true,
      modes: ["vertex"],
      tolerancePx: 2,
    };
  });
  await tool(page, "edit").tap();
  const firstVertex = page.locator(".leaflet-editing-icon").first();
  await expect(firstVertex).toBeVisible();
  const firstBox = await firstVertex.boundingBox();
  const firstTouch = await gesture(page);
  await firstTouch.send("touchStart", firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
  await firstTouch.send("touchMove", firstBox!.x + firstBox!.width / 2 + 70, firstBox!.y + firstBox!.height / 2 + 50);
  await firstTouch.send("touchEnd");
  await firstTouch.close();
  const changedWithNoCandidate = geometry((await snapshot(page)).live);
  expect(changedWithNoCandidate).not.toEqual(geometry(before.live));
  await page.getByRole("link", { name: "Cancel", exact: true }).tap();
  await expect.poll(async () => geometry((await snapshot(page)).live)).toEqual(geometry(before.live));
  expect(geometry((await snapshot(page)).stored)).toEqual(geometry(before.stored));

  await page.evaluate(() => {
    (document.querySelector("leaflet-geokit") as any).snapping = { enabled: false };
  });
  await tool(page, "edit").tap();
  const secondVertex = page.locator(".leaflet-editing-icon").first();
  await expect(secondVertex).toBeVisible();
  const secondBox = await secondVertex.boundingBox();
  const secondTouch = await gesture(page);
  await secondTouch.send("touchStart", secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height / 2);
  await secondTouch.send("touchMove", secondBox!.x + secondBox!.width / 2 + 65, secondBox!.y + secondBox!.height / 2 + 45);
  await secondTouch.send("touchEnd");
  await secondTouch.close();
  const changedWithSnappingDisabled = geometry((await snapshot(page)).live);
  expect(changedWithSnappingDisabled).not.toEqual(geometry(before.live));
  await page.getByRole("link", { name: "Save", exact: true }).tap();
  await expect.poll(async () => geometry((await snapshot(page)).stored)).toEqual(changedWithSnappingDisabled);
});

test("touch delete cancellation restores feature; Save removes it", async ({ page }) => {
  await seed(page);
  for (const save of [false, true]) {
    await tool(page, "delete").tap();
    const point = await featurePoint(page);
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(async () => (await snapshot(page)).live.features.length).toBe(0);
    await page.getByRole("link", { name: save ? "Save" : "Cancel", exact: true }).tap();
    await expect.poll(async () => (await snapshot(page)).stored.features.length).toBe(save ? 0 : 1);
    expect((await snapshot(page)).live.features.length).toBe(save ? 0 : 1);
  }
  const events = (await snapshot(page)).events;
  const starts = events.filter((e: any) => e.type.endsWith("tool-started") && e.detail.tool === "delete");
  const completed = events.filter((e: any) => e.type.endsWith("tool-completed") && e.detail.tool === "delete");
  expect(starts).toHaveLength(2);
  expect(completed).toHaveLength(1);
  expect(completed[0].detail.commandId).toBe(starts[1].detail.commandId);
});

test("captured touch move crosses map boundary, Save persists; cancel rolls back", async ({ page }) => {
  await seed(page);
  await tool(page, "move").tap();
  const before = await snapshot(page);
  const point = await featurePoint(page);
  const map = await page.locator("[data-geokit-map-container]").boundingBox();
  const touch = await gesture(page);
  const pointerStart = before.pointers.length;
  await touch.send("touchStart", point.x, point.y);
  await touch.send("touchMove", point.x + 30, point.y - 30);
  expect((await snapshot(page)).dragging).toBe(false);
  await touch.send("touchMove", point.x, map!.y - 20);
  await touch.send("touchEnd");
  const moved = await snapshot(page);
  expect(geometry(moved.live)).not.toEqual(geometry(before.live));
  expect(moved.center).toEqual(before.center);
  expect(moved.dragging).toBe(true);
  expect(moved.pointers.some((p: any) => p.type === "gotpointercapture" && p.trusted)).toBe(true);
  const dragEvents = moved.pointers.slice(pointerStart);
  expect(dragEvents.filter((p: any) => p.type === "pointerdown" && p.pointerType === "touch" && p.trusted)).toHaveLength(1);
  expect(dragEvents.filter((p: any) => p.type === "mousedown")).toHaveLength(0);
  const layout = await page.locator("[data-geokit-move-confirmation]").evaluate(panel => {
    const rect = (el: Element) => el.getBoundingClientRect().toJSON();
    return { panel: rect(panel), toolbar: rect(panel.parentElement!.querySelector("[data-geokit-managed-toolbar]")!), buttons: Array.from(panel.querySelectorAll("button")).map(rect) };
  });
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.toolbar.top);
  for (const button of layout.buttons) { expect(button.height).toBeGreaterThanOrEqual(44); expect(button.width).toBeGreaterThanOrEqual(44); }
  await page.getByRole("button", { name: "✕ Cancel", exact: true }).tap();
  await expect.poll(async () => geometry((await snapshot(page)).live)).toEqual(geometry(before.live));
  await touch.send("touchStart", point.x, point.y);
  await touch.send("touchMove", point.x + 35, point.y + 30);
  await touch.send("touchEnd");
  const saved = geometry((await snapshot(page)).live);
  await page.getByRole("button", { name: "✓ Save", exact: true }).tap();
  await expect.poll(async () => geometry((await snapshot(page)).stored)).toEqual(saved);
  const events = (await snapshot(page)).events;
  const completed = events.filter((e: any) => e.type.endsWith("tool-completed") && e.detail.tool === "move");
  expect(completed).toHaveLength(1);
  expect(completed[0].detail.commandId).toBe(events.find((e: any) => e.type.endsWith("tool-started") && e.detail.tool === "move").detail.commandId);
  await touch.close();
});

test("browser touchCancel rolls move back without completion or stale capture", async ({ page }) => {
  await seed(page);
  await tool(page, "move").tap();
  const before = await snapshot(page);
  const point = await featurePoint(page);
  const touch = await gesture(page);
  await touch.send("touchStart", point.x, point.y);
  await touch.send("touchMove", point.x + 40, point.y + 40);
  expect(geometry((await snapshot(page)).live)).not.toEqual(geometry(before.live));
  await touch.send("touchCancel");
  const cancelled = await snapshot(page);
  expect(geometry(cancelled.live)).toEqual(geometry(before.live));
  expect(cancelled.dragging).toBe(before.dragging);
  expect(cancelled.pointers.some((p: any) => p.type === "pointercancel" && p.trusted)).toBe(true);
  await expect(page.getByRole("button", { name: "✓ Save", exact: true })).toHaveCount(0);
  expect(cancelled.events.filter((e: any) => e.type.endsWith("tool-completed") && e.detail.tool === "move")).toHaveLength(0);
  await touch.close();
});

test("mobile edit handles have usable off-center targets and avoid controls", async ({ page }, info) => {
  await seed(page);
  await tool(page, "edit").tap();
  const vertices = page.locator(".leaflet-editing-icon");
  await expect(vertices.first()).toBeVisible();
  const measured = await vertices.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  await info.attach("editing-targets", { body: JSON.stringify(measured), contentType: "application/json" });
  for (const rect of measured) {
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  const before = geometry((await snapshot(page)).live);
  const rect = measured[0];
  const touch = await gesture(page);
  await touch.send("touchStart", rect.x + rect.width / 2 + 16, rect.y + rect.height / 2);
  await touch.send("touchMove", rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 30);
  await touch.send("touchEnd");
  expect(geometry((await snapshot(page)).live)).not.toEqual(before);
  await touch.close();
  const layout = await page.locator("[data-geokit-managed-toolbar]").evaluate(group => ({
    toolbar: group.getBoundingClientRect().toJSON(),
    others: Array.from(group.closest("[data-geokit-map-container]")!.querySelectorAll(".leaflet-control-zoom, .leaflet-control-attribution, .leaflet-draw-actions, .leaflet-editing-icon")).filter(el => el.getBoundingClientRect().width).map(el => el.getBoundingClientRect().toJSON()),
  }));
  for (const other of layout.others) expect(Math.min(other.right, layout.toolbar.right) > Math.max(other.left, layout.toolbar.left) && Math.min(other.bottom, layout.toolbar.bottom) > Math.max(other.top, layout.toolbar.top)).toBe(false);
});

test("unfinished touch polygon cancellation creates nothing", async ({ page }) => {
  await tool(page, "polygon").tap();
  const box = await page.locator("[data-geokit-map-container]").boundingBox();
  await page.touchscreen.tap(box!.x + 170, box!.y + 170);
  await page.waitForTimeout(300);
  await page.touchscreen.tap(box!.x + 260, box!.y + 240);
  await tool(page, "select").tap();
  expect((await snapshot(page)).stored.features).toHaveLength(0);
  expect((await snapshot(page)).live.features).toHaveLength(0);
  await expect(page.locator(".leaflet-editing-icon")).toHaveCount(0);
});

test("mode switch and destroy release an active touch and roll back", async ({ page }) => {
  await seed(page);
  const before = await snapshot(page);
  const point = await featurePoint(page);
  const touch = await gesture(page);
  for (const action of ["switch", "destroy"]) {
    await tool(page, "move").tap();
    await touch.send("touchStart", point.x, point.y);
    await touch.send("touchMove", point.x + 40, point.y + 40);
    expect(geometry((await snapshot(page)).live)).not.toEqual(geometry(before.live));
    const result = await page.evaluate(async next => {
      const el = document.querySelector("leaflet-geokit") as any;
      const c = el._controller;
      const layer = c.drawnItems.getLayers()[0];
      const container = c.map.getContainer();
      const handler = c.findLeafletDrawHandler("move");
      const pointerId = (window as any).__touchPointers.filter((p: any) => p.type === "pointerdown").at(-1).pointerId;
      if (next === "destroy") await c.destroy();
      else await el.activateTool("select");
      const result = { geometry: layer.toGeoJSON().geometry, captured: container.hasPointerCapture(pointerId), pending: handler.hasPendingMove(), touchAction: container.style.touchAction };
      if (next === "destroy") await c.init();
      return result;
    }, action);
    expect(result.geometry).toEqual(before.live.features[0].geometry);
    expect(result.captured).toBe(false);
    expect(result.pending).toBe(false);
    expect(result.touchAction).not.toBe("none");
    await touch.send("touchEnd");
    expect(geometry((await snapshot(page)).stored)).toEqual(geometry(before.stored));
  }
  await touch.close();
});

test("external registration uses the same captured touch transport", async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const c = (document.querySelector("leaflet-geokit") as any)._controller;
    const path = "/src/lib/draw/L.Draw.Move.ts";
    const { ensureDrawMoveRegistered } = await import(/* @vite-ignore */ path);
    // Host-provided namespace, with no custom Move registered yet.
    const runtime = { ...c.L, Draw: { ...c.L.Draw, Move: undefined } };
    ensureDrawMoveRegistered(runtime);
    const handler = new runtime.Draw.Move(c.map, { featureGroup: c.drawnItems });
    (window as any).__externalMove = handler;
    handler.enable();
  });
  expect(await page.evaluate(() => (window as any).__externalMove.constructor.name)).toBe("RuntimeDrawMove");
  const before = await snapshot(page);
  const point = await featurePoint(page);
  const touch = await gesture(page);
  await touch.send("touchStart", point.x, point.y);
  await touch.send("touchMove", point.x + 45, point.y + 30);
  expect(geometry((await snapshot(page)).live)).not.toEqual(geometry(before.live));
  await touch.send("touchCancel");
  expect(geometry((await snapshot(page)).live)).toEqual(geometry(before.live));
  await touch.send("touchStart", point.x, point.y);
  await touch.send("touchMove", point.x + 45, point.y + 30);
  await touch.send("touchEnd");
  const changed = geometry((await snapshot(page)).live);
  await page.evaluate(() => { const h = (window as any).__externalMove; h.confirmMove(); h.disable(); });
  expect(geometry((await snapshot(page)).stored)).toEqual(changed);
  expect((await snapshot(page)).dragging).toBe(true);
  await touch.close();
});

test("real lost capture cancels and mouse pointer release outside still works", async ({ page }) => {
  await seed(page);
  await tool(page, "move").tap();
  const before = await snapshot(page);
  const point = await featurePoint(page);
  const touch = await gesture(page);
  await touch.send("touchStart", point.x, point.y);
  await touch.send("touchMove", point.x + 40, point.y + 30);
  await page.evaluate(() => {
    const c = (document.querySelector("leaflet-geokit") as any)._controller;
    const id = (window as any).__touchPointers.filter((p: any) => p.type === "pointerdown").at(-1).pointerId;
    c.map.getContainer().releasePointerCapture(id);
  });
  await touch.send("touchMove", point.x + 50, point.y + 35);
  await touch.send("touchEnd");
  expect(geometry((await snapshot(page)).live)).toEqual(geometry(before.live));
  const map = await page.locator("[data-geokit-map-container]").boundingBox();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 30, map!.y - 20, { steps: 8 });
  await page.mouse.up();
  expect(geometry((await snapshot(page)).live)).not.toEqual(geometry(before.live));
  expect((await snapshot(page)).dragging).toBe(true);
  await page.getByRole("button", { name: "✕ Cancel", exact: true }).click();
  expect(geometry((await snapshot(page)).live)).toEqual(geometry(before.live));
  await touch.close();
});
