import { describe, expect, it } from "vitest";
import pkg from "../package.json";

import reactConfig from "../vite.config.react";
import reactBundledConfig from "../vite.config.react-bundled";
import preactConfig from "../vite.config.preact";
import preactBundledConfig from "../vite.config.preact-bundled";
import externalConfig from "../vite.config.external";

function getExternalList(config: unknown): string[] {
  const typed = config as {
    build?: {
      rollupOptions?: {
        external?: string[];
      };
    };
  };

  return typed.build?.rollupOptions?.external ?? [];
}

describe("framework runtime externalization", () => {
  it("publishes an external no-Leaflet entrypoint export", () => {
    const externalExport = (pkg as any).exports?.["./external"];
    expect(externalExport).toBeTruthy();
    expect(externalExport.import).toBe("./dist/leaflet-geokit.external.es.js");
    expect(externalExport.types).toBe("./dist/types/src/external.d.ts");
  });

  it("external build config marks Leaflet stack as external", () => {
    const external = getExternalList(externalConfig);
    ["leaflet", "leaflet-draw", "leaflet-ruler"].forEach((dependency) => {
      expect(external).toContain(dependency);
    });
  });

  it("externalizes React runtime modules for both React entrypoint builds", () => {
    const expected = ["react", "react-dom", "react/jsx-runtime"];

    const reactExternal = getExternalList(reactConfig);
    const reactBundledExternal = getExternalList(reactBundledConfig);

    expected.forEach((dependency) => {
      expect(reactExternal).toContain(dependency);
      expect(reactBundledExternal).toContain(dependency);
    });

    ["leaflet", "leaflet-draw", "leaflet-ruler"].forEach((dependency) => {
      expect(reactExternal).toContain(dependency);
      expect(reactBundledExternal).not.toContain(dependency);
    });
  });

  it("externalizes Preact runtime modules for both Preact entrypoint builds", () => {
    const expected = ["preact", "preact/hooks", "preact/jsx-runtime"];

    const preactExternal = getExternalList(preactConfig);
    const preactBundledExternal = getExternalList(preactBundledConfig);

    expected.forEach((dependency) => {
      expect(preactExternal).toContain(dependency);
      expect(preactBundledExternal).toContain(dependency);
    });

    ["leaflet", "leaflet-draw", "leaflet-ruler"].forEach((dependency) => {
      expect(preactExternal).toContain(dependency);
      expect(preactBundledExternal).not.toContain(dependency);
    });
  });
});
