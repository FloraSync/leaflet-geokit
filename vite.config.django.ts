import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
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
