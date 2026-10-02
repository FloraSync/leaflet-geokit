import { expect, test, type Page } from "@playwright/test";

const group = (page: Page, id: string) => page.locator(`[data-geokit-managed-toolbar][data-geokit-toolbar-group="${id}"]`);

async function assertMeasuredLayout(page: Page) {
  const measurements = await page.evaluate(() => {
    const root = document.querySelector("leaflet-geokit")!.shadowRoot!;
    const layout = root.querySelector("geokit-toolbar-layout")!;
    const map = layout.parentElement!.getBoundingClientRect();
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      map: rect(layout.parentElement!),
      groups: Array.from(root.querySelectorAll("[data-geokit-managed-toolbar]")).map(rect),
      native: Array.from(root.querySelectorAll(".leaflet-control-zoom, .leaflet-control-attribution")).map(rect).filter(r => r.width && r.height),
      bleed: map.right > window.innerWidth + 1 || map.left < -1,
    };
  });
  expect(measurements.bleed).toBe(false);
  for (const [i, a] of measurements.groups.entries()) {
    expect(a.width).toBeGreaterThan(40);
    expect(a.height).toBeGreaterThan(20);
    expect(a.x).toBeGreaterThanOrEqual(measurements.map.x - 1);
    expect(a.right).toBeLessThanOrEqual(measurements.map.right + 1);
    expect(a.y).toBeGreaterThanOrEqual(measurements.map.y - 1);
    expect(a.bottom).toBeLessThanOrEqual(measurements.map.bottom + 1);
    for (const b of [...measurements.groups.slice(i + 1), ...measurements.native]) {
      const overlap = Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
      expect(overlap, JSON.stringify({ a, b })).toBe(false);
    }
  }
  return measurements;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/irrigation-draw-mode.html");
  await expect.poll(() => page.evaluate(() => Boolean((window as any).irrigationMapReady))).toBe(true);
});

test("config moves the same tool nodes on resize; wrapping, scrolling, teardown and rerender stay interactive", async ({ page }, info) => {
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolbarGroups = [{ id: "responsive", tools: ["polygon", "polyline", "rectangle", "circle", "marker", "layerCake", "move", "select", "edit", "delete", "ruler", "measurementSettings", "layerStyle", "save"], preset: "responsive", position: "topright", orientation: "horizontal" }];
  });
  const toolbar = group(page, "responsive");
  await expect(toolbar).toHaveAttribute("data-geokit-toolbar-position", "top-end");
  const first = await toolbar.locator("button").first().elementHandle();
  const identity = await toolbar.locator("button").first().getAttribute("data-geokit-tool-instance");
  const desktop = await assertMeasuredLayout(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toolbar).toHaveAttribute("data-geokit-toolbar-position", "bottom-end");
  expect(await first!.evaluate(el => el.isConnected)).toBe(true);
  await expect(toolbar.locator("button").first()).toHaveCSS("width", "48px");
  const narrow = await assertMeasuredLayout(page);
  const rows = await toolbar.locator("button").evaluateAll(buttons => new Set(buttons.map(b => Math.round(b.getBoundingClientRect().top))).size);
  expect(rows).toBeGreaterThan(1);
  await toolbar.locator('[data-geokit-tool="polygon"]').click();
  await expect(toolbar.locator('[data-geokit-tool="polygon"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await toolbar.locator('[data-geokit-tool="save"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).lastIrrigationExport !== undefined)).toBe(true);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: info.outputPath("layout-narrow.png"), fullPage: true });
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolbarGroups = map.toolbarGroups.map((g: any) => ({ ...g, overflow: "scroll" }));
  });
  await expect(toolbar).toHaveCSS("flex-wrap", "nowrap");
  expect(await toolbar.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  // Enabled tools are reachable through focus scrolling. Native disabled
  // buttons cannot receive focus (move/edit/delete require a seeded feature).
  for (const button of await toolbar.locator("button:not(:disabled)").all()) {
    await button.focus();
    const reachable = await button.evaluate(el => {
      const r = el.getBoundingClientRect(), p = el.parentElement!.getBoundingClientRect();
      return { visible: r.left >= p.left - 1 && r.right <= p.right + 1, tool: el.dataset.geokitTool, left: r.left, right: r.right, parentLeft: p.left, parentRight: p.right, scroll: el.parentElement!.scrollLeft };
    });
    expect(reachable.visible, JSON.stringify(reachable)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(toolbar).toHaveAttribute("data-geokit-toolbar-position", "top-end");
  await assertMeasuredLayout(page);
  await page.evaluate(() => { (document.querySelector("leaflet-geokit") as any).toolbarGroups = []; });
  await expect(page.locator("geokit-toolbar-layout")).toHaveCount(0);
  await page.evaluate(() => { (document.querySelector("leaflet-geokit") as any).toolbarGroups = [{ id: "responsive", tools: ["polygon"], preset: "responsive" }]; });
  await expect(page.locator("geokit-toolbar-layout")).toHaveCount(1);
  await expect(toolbar.locator("button")).toHaveAttribute("data-geokit-tool-instance", identity!);
  await toolbar.locator("button").click();
  await expect(toolbar.locator("button")).toHaveAttribute("aria-pressed", "true");
  await info.attach("rectangles", { body: JSON.stringify({ desktop, narrow }, null, 2), contentType: "application/json" });
});

test("CSS parts move and reorder groups; all five zones and same-zone stacks avoid native chrome", async ({ page }, info) => {
  await page.addStyleTag({ content: `
    leaflet-geokit::part(toolbar-group-css) { --geokit-toolbar-zone: top-end; }
    leaflet-geokit::part(toolbar-group-second) { --geokit-toolbar-order: -1; }
    @media (max-width: 600px) {
      leaflet-geokit::part(toolbar-group-css) { --geokit-toolbar-zone: bottom-end; --geokit-toolbar-direction: row; }
    }
  ` });
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolbarGroups = [
      { id: "css", tools: ["polygon"], preset: "zones", order: 0 },
      { id: "second", tools: ["save"], position: "top-end", order: 1 },
      { id: "left", tools: ["marker"], position: "top-start" },
      { id: "center", tools: ["select"], position: "center-end" },
      { id: "bottom-left", tools: ["edit"], position: "bottom-start" },
      { id: "bottom-right", tools: ["delete"], position: "bottom-end" },
    ];
  });
  await expect(group(page, "css")).toHaveAttribute("data-geokit-toolbar-position", "top-end");
  await expect(group(page, "second")).toHaveCSS("order", "-1");
  expect((await group(page, "second").boundingBox())!.y).toBeLessThan((await group(page, "css").boundingBox())!.y);
  await assertMeasuredLayout(page);
  await page.screenshot({ path: info.outputPath("layout-desktop-zones.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 1100 });
  await expect(group(page, "css")).toHaveAttribute("data-geokit-toolbar-position", "bottom-end");
  await expect(group(page, "css")).toHaveAttribute("aria-orientation", "horizontal");
  const narrow = await assertMeasuredLayout(page);
  for (const button of await page.locator("geokit-toolbar-layout button").all()) {
    await button.focus();
    const rects = await button.evaluate(el => ({ button: el.getBoundingClientRect().toJSON(), group: el.parentElement!.getBoundingClientRect().toJSON() }));
    expect(rects.button.top, JSON.stringify(rects)).toBeGreaterThanOrEqual(rects.group.top);
    expect(rects.button.bottom, JSON.stringify(rects)).toBeLessThanOrEqual(rects.group.bottom);
  }
  await page.screenshot({ path: info.outputPath("layout-narrow-zones.png"), fullPage: true });
  await info.attach("narrow-zone-rectangles", { body: JSON.stringify(narrow, null, 2), contentType: "application/json" });
  await group(page, "css").locator("button").click();
  await expect(group(page, "css").locator("button")).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(group(page, "css")).toHaveAttribute("data-geokit-toolbar-position", "top-end");
  await assertMeasuredLayout(page);
});

test("safe-area overrides and container-only resize keep the sheet inside a 320px map", async ({ page }, info) => {
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.style.setProperty("--geokit-safe-area-left", "12px");
    map.style.setProperty("--geokit-safe-area-right", "18px");
    map.style.setProperty("--geokit-safe-area-bottom", "20px");
    map.toolbarGroups = [{ id: "safe", tools: ["polygon", "marker", "save"], preset: "responsive" }];
  });
  const toolbar = group(page, "safe");
  await expect(toolbar).toHaveAttribute("data-geokit-toolbar-position", "top-end");
  await page.evaluate(() => { (document.querySelector("leaflet-geokit") as HTMLElement).style.width = "320px"; });
  await expect(toolbar).toHaveAttribute("data-geokit-toolbar-position", "bottom-end");
  const measured = await assertMeasuredLayout(page);
  expect(measured.groups[0].x).toBeGreaterThanOrEqual(measured.map.x + 12);
  expect(measured.groups[0].right).toBeLessThanOrEqual(measured.map.right - 18);
  expect(measured.groups[0].bottom).toBeLessThanOrEqual(measured.map.bottom - 20);
  await toolbar.locator('[data-geokit-tool="polygon"]').click();
  await expect(toolbar.locator('[data-geokit-tool="polygon"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 844 });
  await assertMeasuredLayout(page);
  await page.screenshot({ path: info.outputPath("layout-320-safe-area.png"), fullPage: true });
  await info.attach("safe-area-rectangles", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
});
