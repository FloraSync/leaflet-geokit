import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { Map as GLMap } from "maplibre-gl";
import type { LeafletDrawMapElementAPI } from "../src/types/public";
import type { BasemapAdapter } from "../src/lib/providers";
import type { LeafletDrawMapElement } from "../src/components/LeafletDrawMapElement";

declare global {
  interface Window {
    pmtilesExample: {
      api: LeafletDrawMapElementAPI;
      element: LeafletDrawMapElement;
      adapter: BasemapAdapter;
      renderers: GLMap[];
      errors: string[];
      removed: number;
      release: () => void;
    };
  }
}

test("real archive ranges, CORS, WebGL pixels, drawing, swaps and teardown", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ranges: {
    status: number;
    range: string | undefined;
    contentRange: string | undefined;
    cors: string | undefined;
  }[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).origin === "http://127.0.0.1:5198")
      ranges.push({
        status: response.status(),
        range: response.request().headers().range,
        contentRange: response.headers()["content-range"],
        cors: response.headers()["access-control-allow-origin"],
      });
  });
  await page.goto("/pmtiles.html?archive=http://127.0.0.1:5198/fields.pmtiles");
  await expect(page.locator("#status")).toHaveText("PMTiles loaded", {
    timeout: 30000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pmtilesExample.renderers[0].queryRenderedFeatures({
            layers: ["fields"],
          }).length,
      ),
    )
    .toBeGreaterThan(0);
  // Read actual WebGL framebuffer pixels DURING render (no preserveDrawingBuffer hack).
  const pixel = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const map = window.pmtilesExample.renderers[0];
        map.once("render", () => {
          const canvas = map.getCanvas();
          const gl = canvas.getContext("webgl2")!;
          const data = new Uint8Array(4);
          gl.readPixels(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
          );
          resolve([...data]);
        });
        map.triggerRepaint();
      }),
  );
  expect(pixel).toEqual([25, 135, 84, 255]);
  expect(ranges.length).toBeGreaterThan(0);
  for (const response of ranges) {
    expect(response.status).toBe(206);
    expect(response.range).toMatch(/^bytes=\d+-\d+$/);
    expect(response.contentRange).toMatch(/^bytes \d+-\d+\/\d+$/);
    expect(response.cors).toBe("http://127.0.0.1:5197");
  }
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "FloraSync synthetic fixture (MIT)",
  );
  await page.evaluate(async () => {
    await window.pmtilesExample.api.loadGeoJSON({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "preserved-field",
          properties: { name: "Original" },
          geometry: { type: "Point", coordinates: [5, 5] },
        },
      ],
    });
  });
  await page.locator("#draw").click();
  const box = (await page
    .locator("leaflet-geokit .leaflet-container")
    .boundingBox())!;
  for (const [x, y] of [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.35],
  ]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(75);
  }
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.pmtilesExample.api.getGeoJSON()).features.length,
      ),
    )
    .toBe(2);
  const before = await page.evaluate(() =>
    window.pmtilesExample.api.getGeoJSON(),
  );
  expect(
    before.features.some((feature) => feature.geometry?.type === "Polygon"),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("pmtiles-drawing.png") });
  // Last protocol owner cannot break a live renderer.
  expect(
    await page.evaluate(() => {
      try {
        window.pmtilesExample.release();
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.locator("#raster").click();
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.pmtilesExample.removed))
      .toBe(cycle + 1);
    await page.locator("#vector").click();
    await expect(page.locator("#status")).toHaveText("PMTiles loaded");
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  }
  expect(
    await page.evaluate(() => window.pmtilesExample.api.getGeoJSON()),
  ).toEqual(before);
  // Leaflet view updates still drive the actual GL renderer.
  await page.evaluate(() => window.pmtilesExample.api.setView(4, 4, 3));
  await expect
    .poll(() =>
      page.evaluate(() => window.pmtilesExample.renderers.at(-1)!.getZoom()),
    )
    .toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.round(window.pmtilesExample.renderers.at(-1)!.getCenter().lng),
      ),
    )
    .toBe(4);
  await page.evaluate(() => window.pmtilesExample.element.remove());
  await expect
    .poll(() => page.evaluate(() => window.pmtilesExample.removed))
    .toBe(4);
  await page.evaluate(() => {
    window.pmtilesExample.release();
    window.pmtilesExample.release();
  });
  expect(await page.evaluate(() => window.pmtilesExample.errors)).toEqual([]);
  expect(errors).toEqual([]);
  const evidence = testInfo.outputPath("range-evidence.json");
  await writeFile(evidence, JSON.stringify({ ranges, pixel }, null, 2));
  await testInfo.attach("range-evidence", {
    path: evidence,
    contentType: "application/json",
  });
});

test("simultaneous maps keep the shared protocol until both are removed", async ({
  page,
}) => {
  await page.goto("/pmtiles.html?archive=http://127.0.0.1:5198/fields.pmtiles");
  await expect(page.locator("#status")).toHaveText("PMTiles loaded");
  await page.evaluate(async () => {
    const example = window.pmtilesExample;
    const second = example.element.cloneNode(false) as LeafletDrawMapElement;
    second.id = "second";
    second.leafletInstance = example.element.leafletInstance;
    const ready = new Promise<void>((resolve) =>
      second.addEventListener(
        "leaflet-draw:ready",
        () => {
          second.setBasemapAdapter(example.adapter);
          resolve();
        },
        { once: true },
      ),
    );
    document.querySelector("#maps")!.append(second);
    await ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.pmtilesExample.renderers[1]?.loaded()),
    )
    .toBe(true);
  await page.evaluate(() => window.pmtilesExample.element.remove());
  await expect
    .poll(() => page.evaluate(() => window.pmtilesExample.removed))
    .toBe(1);
  expect(
    await page.evaluate(() => {
      try {
        window.pmtilesExample.release();
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        window.pmtilesExample.renderers[1].queryRenderedFeatures({
          layers: ["fields"],
        }).length,
    ),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.querySelector("#second")!.remove();
    window.pmtilesExample.release();
  });
  expect(await page.evaluate(() => window.pmtilesExample.removed)).toBe(2);
  expect(await page.evaluate(() => window.pmtilesExample.errors)).toEqual([]);
});

test("archive HTTP failure is observable and explicit raster fallback works", async ({
  page,
}) => {
  await page.goto(
    "/pmtiles.html?archive=http://127.0.0.1:5198/missing.pmtiles",
  );
  await expect
    .poll(() => page.evaluate(() => window.pmtilesExample?.errors.length ?? 0))
    .toBeGreaterThan(0);
  await page.locator("#raster").click();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.pmtilesExample.api.getProviderDiagnostics()?.kind,
    ),
  ).toBe("raster");
  expect(await page.evaluate(() => window.pmtilesExample.removed)).toBe(1);
  await page.evaluate(() => window.pmtilesExample.release());
});

test("default same-origin example renders without external services", async ({
  page,
}) => {
  await page.goto("/pmtiles.html");
  await expect(page.locator("#status")).toHaveText("PMTiles loaded");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.pmtilesExample.renderers[0].queryRenderedFeatures({
            layers: ["fields"],
          }).length,
      ),
    )
    .toBeGreaterThan(0);
});
