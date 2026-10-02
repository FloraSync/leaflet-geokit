import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated real browser harness; no HMR resets from other shared-workspace tasks.
export default defineConfig({
  ...base,
  testMatch: ["tool-capabilities.spec.ts", "tool-lifecycle.spec.ts"],
  workers: 1,
  use: { ...base.use, baseURL: "http://localhost:5186" },
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { port: 5186, strictPort: true, hmr: false } }); await server.listen();"`,
    port: 5186,
    reuseExistingServer: false,
  },
});
