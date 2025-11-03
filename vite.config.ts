import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [preact()],
  build: {
    target: "es2019",
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LeafletDrawWebComponent",
      fileName: (format: string) => `leaflet-draw-web-component.${format}.js`,
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
