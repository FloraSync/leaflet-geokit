import { defineConfig } from "vite";
export default defineConfig({
  build: {
    target: "es2019",
    sourcemap: true,
    emptyOutDir: false,
    lib: {
      entry: "src/pmtiles.ts",
      formats: ["es"],
      fileName: () => "leaflet-geokit.pmtiles.es.js",
    },
    rollupOptions: {
      external: [
        "leaflet",
        "maplibre-gl",
        "@maplibre/maplibre-gl-leaflet",
        "pmtiles",
      ],
    },
  },
});
