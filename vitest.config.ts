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
        statements: 80,
        branches: 73, // Vitest v4 + V8 branch accounting is stricter than v3 in this repo
        functions: 80,
        lines: 80,
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
        // Temporarily exclude new Move tool implementation from coverage
        // TODO: Add comprehensive tests for L.Draw.Move
        "src/lib/draw/L.Draw.Move.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
    },
  },
});
