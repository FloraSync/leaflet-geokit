import { expect, test } from "@playwright/test";

test("validated upload is atomic and map edits round-trip IDs, metadata and visible coordinates", async ({
  page,
}) => {
  await page.goto("/irrigation-draw-mode.html");
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).irrigationMapReady)),
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const entry = "/src/index.ts";
    const {
      diffGeoJSON,
      applyGeoJSONPatch,
      exportGeoJSONData,
      importGeoJSONText,
    } = await import(entry);
    const element = document.querySelector("leaflet-geokit") as any;
    const source = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 42,
          properties: { id: "app-row", crop: "beans", care: { water: [2, 4] } },
          geometry: {
            type: "MultiPoint",
            coordinates: [
              [-118, 34],
              [-118.001, 34.001],
            ],
          },
        },
      ],
    };
    const summary = importGeoJSONText(JSON.stringify(source));
    await element.importGeoJSON(summary.data, {
      validate: true,
      fitToData: true,
    });
    const before = structuredClone(await element.getGeoJSON());
    const controller = element._controller;
    const visibleBefore = controller.drawnItems.getLayers().length;
    let rejected = false;
    try {
      await element.importGeoJSON(
        {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [0, 0],
                    [1, 0],
                    [0, 1],
                  ],
                ],
              },
            },
          ],
        },
        { validate: true },
      );
    } catch {
      rejected = true;
    }
    const unchanged =
      JSON.stringify(await element.getGeoJSON()) === JSON.stringify(before);
    const visibleAfterRejection = controller.drawnItems.getLayers().length;
    let duplicateRejected = false;
    try {
      await element.importGeoJSON(before, { validate: true, behavior: "add" });
    } catch {
      duplicateRejected = true;
    }
    const marker = controller.drawnItems
      .getLayers()
      .find((layer: any) => layer._fid === "42::0");
    marker.setLatLng([34.002, -118.002]);
    controller.map.fire("draw:edited", {
      layers: controller.L.featureGroup([marker]),
    });
    const after = await element.getGeoJSON();
    const patch = diffGeoJSON(before, after);
    const exported = exportGeoJSONData(after, { adapter: "source" });
    const visible = marker.getLatLng();
    return {
      rejected,
      duplicateRejected,
      unchanged,
      visibleBefore,
      visibleAfterRejection,
      after,
      exported,
      changed: patch.updatedIds,
      applied: applyGeoJSONPatch(before, patch),
      visible: [visible.lng, visible.lat],
    };
  });
  expect(result.rejected).toBe(true);
  expect(result.duplicateRejected).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.visibleBefore).toBe(2);
  expect(result.visibleAfterRejection).toBe(2);
  expect(result.changed).toEqual(["42::0"]);
  expect(result.applied).toEqual(result.after);
  expect(result.exported.valid).toBe(true);
  expect(result.exported.data.features[0]).toEqual({
    type: "Feature",
    id: 42,
    properties: { id: "app-row", crop: "beans", care: { water: [2, 4] } },
    geometry: {
      type: "MultiPoint",
      coordinates: [
        [-118.002, 34.002],
        [-118.001, 34.001],
      ],
    },
  });
  expect(result.visible).toEqual([-118.002, 34.002]);
  await expect(page.locator("leaflet-geokit .leaflet-marker-icon")).toHaveCount(
    2,
  );
});
