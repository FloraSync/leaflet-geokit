import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Finite, owned test server: never reuse another concurrent run's Vite process.
export default defineConfig({
  ...base,
  testMatch: ["providers.spec.ts"],
  workers: 1,
  outputDir: process.env.PAPERCLIP_RUN_SCRATCH_DIR
    ? `${process.env.PAPERCLIP_RUN_SCRATCH_DIR}/provider-browser`
    : "test-results/providers",
  use: { ...base.use, baseURL: "http://localhost:5189" },
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { port: 5189, strictPort: true, hmr: false } }); await server.listen();"`,
    port: 5189,
    reuseExistingServer: false,
  },
});
