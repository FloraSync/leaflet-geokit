import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["layer-manager.spec.ts", "tool-lifecycle.spec.ts"],
  workers: 1,
  outputDir: process.env.PAPERCLIP_RUN_SCRATCH_DIR
    ? `${process.env.PAPERCLIP_RUN_SCRATCH_DIR}/layer-playwright`
    : "test-results/layers",
  use: { ...base.use, baseURL: "http://localhost:5191" },
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { port: 5191, strictPort: true, hmr: false } }); await server.listen();"`,
    port: 5191,
    reuseExistingServer: false,
  },
});
