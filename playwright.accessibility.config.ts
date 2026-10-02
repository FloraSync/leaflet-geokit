import { defineConfig } from "@playwright/test";
import base from "./playwright.layout.config";

// Finite Playwright-owned preview; closed automatically after this suite.
export default defineConfig({
  ...base,
  testMatch: ["toolbar-accessibility.spec.ts", "toolbar-layout.spec.ts", "toolbar-contract.spec.ts"],
  use: { ...base.use, baseURL: "http://localhost:5187" },
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { port: 5187, strictPort: true, hmr: false } }); await server.listen();"`,
    port: 5187,
    reuseExistingServer: false,
  },
});
