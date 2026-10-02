import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["snapping-measurement.spec.ts"],
  forbidOnly: true,
  workers: 1,
  retries: 0,
  outputDir: process.env.PAPERCLIP_RUN_SCRATCH_DIR
    ? `${process.env.PAPERCLIP_RUN_SCRATCH_DIR}/snapping-browser`
    : "test-results/snapping",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    baseURL: "http://localhost:5193",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-touch", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { port: 5193, strictPort: true, hmr: false } }); await server.listen();"`,
    port: 5193,
    reuseExistingServer: false,
  },
});
