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
      reporter: ["html", "text-summary"], // Generates both HTML and console summary reports
      thresholds: {
        // Shore up testing to keep it above 80%
        statements: 80,
        branches: 75, // Branches are currently at 77%, let's be slightly conservative
        functions: 80,
        lines: 80,
      },
      exclude: [
        "playwright.config.ts",
        "node_modules/**",
        "dist/**",
        "e2e/**",
        "tests/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
    },
  },
});
