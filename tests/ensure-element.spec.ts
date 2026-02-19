import { afterEach, describe, expect, it, vi } from "vitest";

const TAG = "leaflet-geokit";

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

describe("ensure-element shim", () => {
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
    } else {
      delete (globalThis as any).customElements;
    }
  });

  it("handles runtimes without customElements", async () => {
    Object.defineProperty(globalThis, "customElements", {
      configurable: true,
      value: undefined,
    });

    const mod = await import("@src/shims/ensure-element");

    expect(mod.isLeafletGeoKitRegistered()).toBe(false);
    await expect(mod.ensureLeafletGeoKitRegistered()).resolves.toBeUndefined();
  });

  it("returns early when the element is already registered", async () => {
    const { fake } = installFakeCustomElements([TAG]);
    const mod = await import("@src/shims/ensure-element");

    expect(mod.isLeafletGeoKitRegistered()).toBe(true);
    await mod.ensureLeafletGeoKitRegistered();

    expect(fake.get).toHaveBeenCalledWith(TAG);
    expect(fake.define).not.toHaveBeenCalled();
  });

  it("supports concurrent ensure calls with a single registration", async () => {
    const { fake } = installFakeCustomElements();
    const mod = await import("@src/shims/ensure-element");

    await Promise.all([
      mod.ensureLeafletGeoKitRegistered(),
      mod.ensureLeafletGeoKitRegistered(),
    ]);

    // @src/index registers both canonical and legacy tags on first import.
    // Single-flight behavior means we should see one import pass, not duplicates.
    expect(fake.define).toHaveBeenCalledTimes(2);
    expect(mod.isLeafletGeoKitRegistered()).toBe(true);
  });
});
