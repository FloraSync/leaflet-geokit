import { test, expect } from "@playwright/test";

test.describe("Tool event matrix harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tool-events.html");
    const tag = page.locator("#evtTag");
    await expect
      .poll(async () => (await tag.textContent())?.trim().toLowerCase() ?? "", {
        timeout: 30_000,
      })
      .toBe("ready");
  });

  test("emits all integrated tool events through hooks and emitter", async ({
    page,
  }) => {
    await page.locator("#btnEmitAll").click();

    const eventNames = (await page.evaluate(
      () => (window as any).__toolEvents,
    )) as string[];

    for (const eventName of eventNames) {
      const countId = `#count-${eventName.replace(/[:]/g, "-")}`;
      await expect(page.locator(countId)).toHaveText("1");
    }

    const logCount = await page.locator("#emitter-log li").count();
    expect(logCount).toBe(eventNames.length);
  });

  test("runtime observer clear/install works", async ({ page }) => {
    const eventNames = (await page.evaluate(
      () => (window as any).__toolEvents,
    )) as string[];

    await page.locator("#btnEmitAll").click();
    await page.locator("#btnClearObservers").click();
    await page.locator("#btnEmitAll").click();

    for (const eventName of eventNames) {
      const countId = `#count-${eventName.replace(/[:]/g, "-")}`;
      await expect(page.locator(countId)).toHaveText("1");
    }

    const logCountAfterClear = await page.locator("#emitter-log li").count();
    expect(logCountAfterClear).toBe(eventNames.length);

    await page.locator("#btnInstallObservers").click();
    await page.locator("#btnEmitAll").click();

    for (const eventName of eventNames) {
      const countId = `#count-${eventName.replace(/[:]/g, "-")}`;
      await expect(page.locator(countId)).toHaveText("2");
    }

    const logCountAfterReinstall = await page
      .locator("#emitter-log li")
      .count();
    expect(logCountAfterReinstall).toBe(eventNames.length * 2);
  });
});
