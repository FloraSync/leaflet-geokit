import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const analyzeEnabled = process.env.BUNDLE_ANALYZE === "1";
const analyzeReport =
  process.env.BUNDLE_ANALYZE_REPORT ?? "dist/stats/main.html";

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
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LeafletGeoKit",
      fileName: (format: string) => `leaflet-geokit.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      // Intentionally do NOT externalize leaflet/leaflet-draw so they are bundled.
      external: [],
      output: {
        // If externalizing in the future, define globals here.
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
