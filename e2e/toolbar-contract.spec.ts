import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/irrigation-draw-mode.html");
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).irrigationMapReady)),
    )
    .toBe(true);
});

test("host CSS restyles every managed button and survives config rerender", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
    leaflet-geokit {
      --geokit-tool-size: 52px;
      --geokit-tool-background: rgb(240, 230, 210);
      --geokit-tool-radius: 3px;
      --geokit-toolbar-gap: 13px;
      --geokit-icon-size: 27px;
    }
    leaflet-geokit::part(toolbar-group) { background: rgb(220, 230, 240); }
    leaflet-geokit::part(toolbar-button) { border: 2px solid rgb(10, 30, 50); }
    leaflet-geokit::part(popover) { background: rgb(250, 240, 200); }
  `,
  });
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolbarGroups = [
      {
        id: "all",
        tools: [
          "polygon",
          "polyline",
          "rectangle",
          "circle",
          "marker",
          "layerCake",
          "move",
          "select",
          "edit",
          "delete",
          "ruler",
          "measurementSettings",
          "layerStyle",
          "save",
        ],
        orientation: "horizontal",
        position: "bottomleft",
        offset: [25, 35],
        gap: 2,
      },
    ];
  });
  const buttons = page.locator(
    'leaflet-geokit [part="toolbar-group"] button[part~="toolbar-button"]',
  );
  await expect(buttons).toHaveCount(14);
  for (const button of await buttons.all()) {
    await expect(button).toHaveCSS("width", "52px");
    await expect(button).toHaveCSS("height", "52px");
    await expect(button).toHaveCSS("background-color", "rgb(240, 230, 210)");
    await expect(button).toHaveCSS("border-radius", "3px");
    await expect(button).toHaveCSS("border-top-width", "2px");
    await expect(button.locator('[part="icon"]')).toHaveCSS("width", "27px");
  }
  const group = page.locator('[part="toolbar-group"]');
  await expect(group).toHaveCSS("gap", "13px");
  await expect(group).toHaveCSS("flex-direction", "row");
  await expect(group).toHaveCSS("left", "25px");
  await expect(group).toHaveCSS("bottom", "35px");
  await expect(group).toHaveCSS("background-color", "rgb(220, 230, 240)");
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolbarGroups = [
      { id: "all", tools: ["polygon"], position: "bottomleft" },
    ];
  });
  await expect(buttons).toHaveCount(1);
  await expect(buttons).toHaveCSS("width", "52px");
  await buttons.click();
  await expect(page.locator('[part="popover"]')).toHaveCSS(
    "background-color",
    "rgb(250, 240, 200)",
  );
});

test("parts override visual properties directly without important; focus, hover, active and disabled remain visible", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
    leaflet-geokit::part(toolbar-button) { width: 48px; height: 48px; border-radius: 5px; }
    leaflet-geokit::part(toolbar-group) { gap: 9px; }
    leaflet-geokit::part(active) { color: rgb(90, 20, 100); }
    leaflet-geokit::part(disabled) { opacity: .35; }
  `,
  });
  const polygon = page.locator('button[data-geokit-tool="polygon"]');
  await expect(polygon).toHaveCSS("width", "48px");
  await expect(polygon).toHaveCSS("border-radius", "5px");
  await polygon.hover();
  await expect(polygon).toHaveCSS("background-color", "rgb(240, 248, 237)");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await polygon.focus();
  await expect(polygon).toHaveCSS("outline-style", "solid");
  await expect(polygon).toHaveCSS("outline-width", "2px");
  await expect(polygon.locator('[part="tooltip"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(polygon).toHaveAttribute("aria-pressed", "true");
  await expect(polygon).toHaveCSS("color", "rgb(90, 20, 100)");
  await expect(polygon).not.toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Escape");
  await expect(page.locator('[part="popover"]')).toHaveCount(0);
  await expect(polygon).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolButtonConfig = {
      ...map.toolButtonConfig,
      save: { ...map.toolButtonConfig.save, disabled: true },
    };
  });
  const save = page.locator('button[data-geokit-tool="save"]');
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("part", "toolbar-button disabled");
  await expect(save).toHaveCSS("opacity", "0.35");
  await expect(save).toHaveCSS("border-top-style", "dashed");
  await save.evaluate((button: HTMLButtonElement) => button.click());
  expect(
    await page.evaluate(() => (window as any).lastIrrigationExport),
  ).toBeUndefined();
});

test("JS placement, mixed theme CSS, slots and theme-url stay usable", async ({
  page,
}) => {
  await page.route("**/toolbar-theme.css", (route) =>
    route.fulfill({
      contentType: "text/css",
      body: '[data-geokit-toolbar-group="slot-tools"] { --geokit-tool-background: rgb(210, 220, 230); }',
    }),
  );
  await page.evaluate(() => {
    const map = document.querySelector("leaflet-geokit") as any;
    map.toolbarGroups = [
      {
        id: "slot-tools",
        tools: ["save"],
        position: "topleft",
        offset: [28, 45],
        orientation: "horizontal",
        gap: 11,
        hideDefaultToolbar: false,
      },
    ];
    map.toolButtonConfig = {
      save: { title: "Save zones", iconSize: [30, 24], badge: "3" },
    };
    map.themeCss =
      '[data-geokit-toolbar-group="slot-tools"] { --geokit-tool-radius: 7px; }';
    map.setAttribute("theme-url", "/toolbar-theme.css");
    const icon = document.createElement("span");
    icon.slot = "slot-tools-save-0-icon";
    icon.textContent = "S";
    map.appendChild(icon);
  });
  const group = page.locator('[part="toolbar-group"]');
  const save = group.getByRole("button", { name: "Save zones", exact: true });
  await expect(group).toHaveCSS("top", "45px");
  await expect(group).toHaveCSS("left", "28px");
  await expect(group).toHaveCSS("gap", "11px");
  await expect(group).toHaveAttribute("aria-orientation", "horizontal");
  await expect(save).toHaveCSS("background-color", "rgb(210, 220, 230)");
  await expect(save).toHaveCSS("border-radius", "7px");
  await expect(save.locator('[part="icon"]')).toHaveCSS("width", "30px");
  await expect(save.locator('[part="icon"]')).toHaveCSS("height", "24px");
  await expect(
    page.locator('leaflet-geokit > [slot="slot-tools-save-0-icon"]'),
  ).toBeVisible();
  await expect(save.locator('[part="badge"]')).toHaveText("3");
  await expect(page.locator(".leaflet-draw-toolbar").first()).toBeVisible();
  await page.evaluate(() => {
    (document.querySelector("leaflet-geokit") as HTMLElement).style.setProperty(
      "--geokit-icon-size",
      "32px",
    );
  });
  await expect(save.locator('[part="icon"]')).toHaveCSS("width", "32px");
  await expect(save.locator('[part="icon"]')).toHaveCSS("height", "32px");
});

test("harness exposes working CSS/config/mixed examples and all corner placements", async ({
  page,
}, testInfo) => {
  const picker = page.getByLabel("Toolbar styling contract", { exact: true });
  const group = page.locator(
    '[part="toolbar-group"][data-geokit-toolbar-group="irrigation-draw"]',
  );
  const polygon = group.locator('button[data-geokit-tool="polygon"]');
  await picker.selectOption("css");
  await expect(polygon).toHaveCSS("width", "48px");
  await expect(group).toHaveCSS("gap", "10px");
  await expect(group).toHaveCSS("flex-direction", "column");
  await picker.selectOption("config");
  await expect(polygon).toHaveCSS("width", "44px");
  await expect(group).toHaveCSS("gap", "12px");
  await expect(group).toHaveCSS("flex-direction", "row");
  await expect(polygon.locator('[part="icon"]')).toHaveCSS("width", "28px");
  await picker.selectOption("mixed");
  await expect(polygon).toHaveCSS("width", "48px");
  await expect(group).toHaveCSS("gap", "10px");
  await expect(polygon.locator('[part="icon"]')).toHaveCSS("width", "24px");
  await page.screenshot({
    path: testInfo.outputPath("toolbar-mixed.png"),
    fullPage: true,
  });

  for (const position of ["topleft", "topright", "bottomleft", "bottomright"]) {
    await page.evaluate((position) => {
      const map = document.querySelector("leaflet-geokit") as any;
      map.toolbarGroups = [
        {
          id: "irrigation-draw",
          tools: ["polygon"],
          position,
          offset: [19, 23],
        },
      ];
    }, position);
    await expect(group).toHaveCSS(
      position.startsWith("top") ? "top" : "bottom",
      "23px",
    );
    await expect(group).toHaveCSS(
      position.endsWith("left") ? "left" : "right",
      "19px",
    );
  }
});
