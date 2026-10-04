import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    trace: "on-first-retry",
    baseURL: "http://localhost:5173",
  },
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["touch-geometry.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-touch-canvas",
      testMatch: ["touch-geometry.spec.ts"],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "chromium-touch-svg",
      testMatch: ["touch-geometry.spec.ts"],
      metadata: { svg: true },
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
