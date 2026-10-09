import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: ["pmtiles.spec.ts", "pmtiles-no-webgl.spec.ts"],
  workers: 1,
  outputDir: "test-results/pmtiles",
  timeout: 60000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5197",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "node scripts/serve-pmtiles-example.mjs",
    url: "http://127.0.0.1:5197/pmtiles.html",
    reuseExistingServer: false,
  },
});
