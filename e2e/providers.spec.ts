import { expect, test } from "@playwright/test";
import type * as Leaflet from "leaflet";
import type { LeafletDrawMapElementAPI } from "../src/types/public";

test("real Leaflet harness preserves drawing across OSM/HERE/custom/vector shim swaps", async ({ page }) => {
  await page.route(/https:\/\/.*(tile\.openstreetmap\.org|maps\.hereapi\.com)\/.*/, route => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=", "base64") }));
  await page.goto("/irrigation-draw-mode.html");
  await expect(page.locator("#external-draw")).toBeEnabled();
  const reports = await page.evaluate(async () => {
    const map = document.querySelector("leaflet-geokit") as unknown as LeafletDrawMapElementAPI;
    map.tileProvider = "osm";
    const osm = map.getProviderDiagnostics();
    map.apiKey = "fixture-browser-key";
    map.tileProvider = "here";
    const here = map.getProviderDiagnostics();
    map.tileProvider = undefined;
    map.tileUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=";
    map.tileAttribution = "Local raster fixture";
    // Attribute-driven config changes are serialized asynchronously by the component.
    await new Promise(resolve => setTimeout(resolve, 100));
    const custom = map.getProviderDiagnostics();
    await map.loadGeoJSON({ type: "FeatureCollection", features: [{ type: "Feature", id: "bed", properties: { name: "Preserved bed" }, geometry: { type: "Point", coordinates: [0, 0] } }] });
    // Vite serves this source module. This is a contract fixture, not a fake claim of WebGL rendering.
    const modulePath = "/src/lib/providers.ts";
    const { createMapLibreBasemapAdapter } = await import(/* @vite-ignore */ modulePath);
    map.setBasemapAdapter(createMapLibreBasemapAdapter({
      attribution: "Vector bridge fixture",
      offline: "host-managed", apiKey: "none",
      createLayer: (leaflet: typeof Leaflet) => {
        const layer = new leaflet.Layer();
        let label: HTMLElement;
        layer.onAdd = (leafletMap) => {
          label = document.createElement("div");
          label.dataset.providerFixture = "vector";
          label.textContent = "Injected vector bridge contract fixture";
          leafletMap.getPane("tilePane")!.append(label);
          return layer;
        };
        layer.onRemove = () => { label.remove(); return layer; };
        return layer;
      },
    }));
    return { osm, here, custom, vector: map.getProviderDiagnostics(), tools: map.getToolCapabilities().provider };
  });
  expect(reports.osm).toMatchObject({ kind: "raster", apiKey: "none", offline: "unsupported" });
  expect(reports.here).toMatchObject({ kind: "raster", apiKey: "required" });
  expect(reports.custom).toMatchObject({ kind: "raster", apiKey: "host-defined" });
  expect(reports.vector).toMatchObject({ kind: "vector", offline: "host-managed", drawing: "leaflet-draw" });
  expect(reports.tools).toMatchObject({ active: "adapter", requested: "adapter", state: "enabled" });
  expect(JSON.stringify(reports)).not.toContain("fixture-browser-key");
  await expect(page.locator("[data-provider-fixture='vector']")).toHaveCount(1);
  await expect(page.locator(".leaflet-control-attribution")).toContainText("Vector bridge fixture");

  await page.locator("#external-draw").click();
  const box = (await page.locator("leaflet-geokit .leaflet-container").boundingBox())!;
  for (const [x, y] of [[0.35, 0.35], [0.65, 0.35], [0.65, 0.65], [0.35, 0.35]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(75);
  }
  await expect.poll(() => page.evaluate(async () => (await (document.querySelector("leaflet-geokit") as unknown as LeafletDrawMapElementAPI).getGeoJSON()).features.length)).toBe(2);
  const final = await page.evaluate(async () => {
    const map = document.querySelector("leaflet-geokit") as unknown as LeafletDrawMapElementAPI;
    map.setBasemapAdapter(null);
    return { data: await map.getGeoJSON(), diagnostics: map.getProviderDiagnostics() };
  });
  expect(final.data.features.some(feature => feature.id === "bed")).toBe(true);
  expect(final.diagnostics?.kind).toBe("raster");
  await expect(page.locator("[data-provider-fixture='vector']")).toHaveCount(0);
  await expect(page.locator(".leaflet-control-attribution")).not.toContainText("Vector bridge fixture");
});
