import { afterEach, describe, expect, it, vi } from "vitest";

const CANONICAL_TAG = "leaflet-geokit";
const LEGACY_TAG = "leaflet-draw-map";

function installFakeCustomElements(preRegistered: string[] = []) {
  const registry = new Map<string, CustomElementConstructor>();
  preRegistered.forEach((tag) => {
    registry.set(tag, class extends HTMLElement {});
  });

  const fake = {
    get: vi.fn((name: string) => registry.get(name)),
    define: vi.fn((name: string, ctor: CustomElementConstructor) => {
      registry.set(name, ctor);
    }),
  };

  Object.defineProperty(globalThis, "customElements", {
    configurable: true,
    value: fake,
  });

  return { fake, registry };
}

describe("external entrypoint", () => {
  const originalCustomElements = Object.getOwnPropertyDescriptor(
    globalThis,
    "customElements",
  );

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    if (originalCustomElements) {
      Object.defineProperty(
        globalThis,
        "customElements",
        originalCustomElements,
      );
    }
  });

  it("registers canonical and legacy tags when both are missing", async () => {
    const { fake, registry } = installFakeCustomElements();

    await import("@src/external");

    expect(fake.define).toHaveBeenCalledTimes(2);
    expect(registry.has(CANONICAL_TAG)).toBe(true);
    expect(registry.has(LEGACY_TAG)).toBe(true);
  });

  it("is idempotent when tags are already registered", async () => {
    const { fake } = installFakeCustomElements([CANONICAL_TAG, LEGACY_TAG]);

    await import("@src/external");

    expect(fake.define).not.toHaveBeenCalled();
    expect(fake.get).toHaveBeenCalledWith(CANONICAL_TAG);
    expect(fake.get).toHaveBeenCalledWith(LEGACY_TAG);
  });
});
