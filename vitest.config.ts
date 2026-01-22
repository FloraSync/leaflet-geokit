import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: [],
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      enabled: true,
      reporter: ["html", "text"], // Generates both HTML and console summary reports
      thresholds: {
        // Shore up testing to keep it above 75%
        statements: 85,
        branches: 83, // Branches are currently at 77%, let's be slightly conservative
        functions: 85,
        lines: 85,
      },
      exclude: [
        "playwright.config.ts",
        "node_modules/**",
        "dist/**",
        "e2e/**",
        "tests/**",
        "eslint.config.js",
        "vite.config*.ts",
        "vitest.config.ts",
        "src/types/*.d.ts",
        "src/state/types.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
    },
  },
});
