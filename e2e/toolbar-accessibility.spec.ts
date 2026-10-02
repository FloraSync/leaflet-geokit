import { expect, test } from "@playwright/test";

const tools = ["polygon", "polyline", "rectangle", "circle", "marker", "layerCake", "move", "select", "edit", "delete", "ruler", "measurementSettings", "layerStyle", "save"];
const toolbar = "[data-geokit-managed-toolbar]";

test.beforeEach(async ({ page }) => {
  await page.goto("/irrigation-draw-mode.html");
  await expect.poll(() => page.evaluate(() => Boolean((window as any).irrigationMapReady))).toBe(true);
  await page.evaluate(async names => {
    const host = document.querySelector("leaflet-geokit") as any;
    for (const attribute of ["draw-polyline", "draw-rectangle", "draw-circle", "draw-move"]) host.setAttribute(attribute, "");
    host.toolButtonConfig = {};
    host.toolbarGroups = [{ id: "accessible", ariaLabel: "Map tools", tools: names, preset: "responsive", orientation: "horizontal" }];
  }, tools);
  await expect(page.locator(`${toolbar} button`)).toHaveCount(tools.length);
  await expect.poll(() => page.evaluate(() => (document.querySelector("leaflet-geokit") as any).status.ready)).toBe(true);
  await page.evaluate(async () => {
    const host = document.querySelector("leaflet-geokit") as any;
    await host.addFeatures({ type: "FeatureCollection", features: [{ type: "Feature", id: "a11y-seed", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }] });
    (window as any).__a11yCommands = [];
    host.addEventListener("leaflet-geokit:tool-commanded", (event: any) => (window as any).__a11yCommands.push(event.detail.tool));
  });
  await expect(page.locator(`${toolbar} [data-geokit-tool='move']`)).toBeEnabled();
});

test("keyboard reaches and activates the complete public toolbar inventory", async ({ page }) => {
  const buttons = page.locator(`${toolbar} button`);
  await buttons.first().focus();
  for (const [index, name] of tools.entries()) {
    const button = buttons.nth(index);
    await expect(button).toBeFocused();
    await page.keyboard.press(index % 2 ? "Space" : "Enter");
    await expect.poll(() => page.evaluate(tool => (window as any).__a11yCommands.includes(tool), name)).toBe(true);
    if (name === "measurementSettings" || name === "layerStyle") {
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(button).toBeFocused();
    } else {
      await page.keyboard.press("Escape");
    }
    if (index < tools.length - 1) await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Home");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("[data-geokit-announcement='status']")).toContainText("save: completed");
});

test("basic semantics, modal focus containment, scoped popover clicks, and error announcements", async ({ page }) => {
  await expect(page.getByRole("toolbar", { name: "Map tools" })).toBeVisible();
  for (const button of await page.locator(`${toolbar} button`).all()) {
    await expect(button).toHaveAccessibleName(/.+/);
  }
  const settings = page.locator(`${toolbar} [data-geokit-tool='measurement-settings']`);
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Measurement units" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".leaflet-ruler-modal input:checked")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await page.evaluate(() => {
    const host = document.querySelector("leaflet-geokit") as any;
    host.toolButtonConfig = { save: { popover: { title: "Export options", html: '<button type="button">Confirm export</button>' } } };
  });
  const save = page.locator(`${toolbar} [data-geokit-tool='save']`);
  await save.click();
  await expect(page.getByRole("button", { name: "Confirm export" })).toBeFocused();
  await page.getByRole("button", { name: "Confirm export" }).click();
  await expect(page.getByRole("dialog", { name: "Export options" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(save).toBeFocused();
  await page.evaluate(async () => {
    const host = document.querySelector("leaflet-geokit") as any;
    host.toolButtonConfig = { marker: { requirements: { selection: true } } };
    await host.activateTool("marker");
  });
  await expect(page.locator("[data-geokit-announcement='alert']")).toContainText("not available");
});

test("native toolbar anchors support Space activation and keyboard navigation", async ({ page }) => {
  await page.evaluate(() => { (document.querySelector("leaflet-geokit") as any).toolbarGroups = []; });
  const polygon = page.locator("a.leaflet-draw-draw-polygon");
  await expect(polygon).toBeVisible();
  await expect(polygon).toHaveAttribute("role", "button");
  await polygon.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).__a11yCommands.includes("polygon"))).toBe(true);
  await expect(polygon).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Home");
  await expect(page.locator(".leaflet-draw-toolbar a").first()).toBeFocused();
});

test("Ctrl+Enter commits edit/delete modes; Escape cancels without exporting", async ({ page }) => {
  for (const tool of ["edit", "delete"]) {
    const button = page.locator(`${toolbar} [data-geokit-tool='${tool}']`);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Control+Enter");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-geokit-announcement='status']")).toContainText(`${tool}: completed`);
  }
  const ruler = page.locator(`${toolbar} [data-geokit-tool='ruler']`);
  await ruler.focus();
  await page.keyboard.press("Enter");
  await expect(ruler).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(ruler).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => (window as any).__a11yCommands.includes("save"))).toBe(false);
});

test("mobile targets, measured non-overlap, high contrast and reduced motion", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(toolbar)).toHaveAttribute("data-geokit-toolbar-position", "bottom-end");
  const measured = await page.locator(toolbar).evaluate(group => {
    const rect = (element: Element) => element.getBoundingClientRect().toJSON();
    return { group: rect(group), buttons: Array.from(group.querySelectorAll("button")).map(rect), native: Array.from(group.closest("[data-geokit-map-container]")!.querySelectorAll(".leaflet-control-zoom, .leaflet-control-attribution")).map(rect) };
  });
  for (const button of measured.buttons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  for (const native of measured.native) {
    const overlap = Math.min(native.right, measured.group.right) > Math.max(native.left, measured.group.left) && Math.min(native.bottom, measured.group.bottom) > Math.max(native.top, measured.group.top);
    expect(overlap).toBe(false);
  }
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const first = page.locator(`${toolbar} button`).first();
  await first.focus();
  await expect(first).toHaveCSS("outline-style", "solid");
  await expect(first).toHaveCSS("transition-duration", "0s");
  await expect(first).toHaveCSS("animation-duration", "0s");
  await page.screenshot({ path: info.outputPath("accessible-mobile.png"), fullPage: true });
  await info.attach("measured-targets", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
});
