import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.accessibility.config";

export default defineConfig({
  ...base,
  testMatch: ["touch-geometry.spec.ts"],
  projects: [
    { name: "chromium-touch-canvas", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "chromium-touch-svg", metadata: { svg: true }, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  use: { ...base.use, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
