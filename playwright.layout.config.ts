import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// A separately owned, finite preview for concurrent shared-workspace QA.
// HMR is disabled so another task's edits cannot reset browser test state.
export default defineConfig({
  ...base,
  testMatch: ["toolbar-layout.spec.ts", "toolbar-contract.spec.ts"],
  workers: 1,
  use: { ...base.use, baseURL: "http://localhost:5183" },
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { port: 5183, strictPort: true, hmr: false } }); await server.listen();"`,
    port: 5183,
    reuseExistingServer: false,
  },
});
