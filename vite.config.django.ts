import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const analyzeEnabled = process.env.BUNDLE_ANALYZE === "1";
const analyzeReport =
  process.env.BUNDLE_ANALYZE_REPORT ?? "dist/stats/django.html";

export default defineConfig({
  plugins: [
    ...(analyzeEnabled
      ? [
          visualizer({
            filename: analyzeReport,
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
  build: {
    target: "es2019",
    sourcemap: true,
    outDir: "dist/django",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/django/index.ts"),
      name: "LeafletGeoKitDjango",
      fileName: () => "index.js",
      formats: ["es"],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
  resolve: {
    alias: {
      "@src": resolve(__dirname, "src"),
    },
  },
});
