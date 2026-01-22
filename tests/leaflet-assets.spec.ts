import { beforeEach, describe, expect, it, vi } from "vitest";
import { injectLeafletStyles, configureLeafletDefaultIcons } from "@src/lib/leaflet-assets";
import * as L from "leaflet";

describe("leaflet-assets", () => {
  describe("injectLeafletStyles", () => {
    let shadowRoot: ShadowRoot;
    let hostElement: HTMLDivElement;

    beforeEach(() => {
      // Create a host element and attach a shadow root
      hostElement = document.createElement("div");
      shadowRoot = hostElement.attachShadow({ mode: "open" });
    });

    it("should inject styles into a new shadow root", () => {
      // Initially no styles should be present
      expect(shadowRoot.querySelector('style[data-leaflet-styles]')).toBeNull();

      injectLeafletStyles(shadowRoot);

      // After injection, the style element should be present
      const styleElement = shadowRoot.querySelector('style[data-leaflet-styles]');
      expect(styleElement).not.toBeNull();
      expect(styleElement?.getAttribute('data-leaflet-styles')).toBe('true');
      
      // Check that the style content includes expected CSS sections
      const styleContent = styleElement?.textContent || '';
      expect(styleContent).toContain('/* --- Leaflet core CSS --- */');
      expect(styleContent).toContain('/* --- Leaflet.draw CSS --- */');
      expect(styleContent).toContain('/* --- Leaflet.ruler CSS --- */');
      expect(styleContent).toContain('/* --- Fix Leaflet.ruler icons (broken relative paths in inlined CSS) --- */');
      expect(styleContent).toContain('.leaflet-ruler');
      expect(styleContent).toContain('.leaflet-draw-draw-cake');
      expect(styleContent).toContain('.cake-label');
    });

    it("should not inject styles twice (idempotent behavior)", () => {
      // First injection
      injectLeafletStyles(shadowRoot);
      const firstStyleElement = shadowRoot.querySelector('style[data-leaflet-styles]');
      expect(firstStyleElement).not.toBeNull();
      
      // Count children before second injection
      const childCountBefore = shadowRoot.children.length;
      
      // Second injection - should be idempotent (this tests the early return on line 26)
      injectLeafletStyles(shadowRoot);
      
      // Should still have the same number of children (no duplicate style elements)
      expect(shadowRoot.children.length).toBe(childCountBefore);
      
      // Should still have only one style element with the marker
      const styleElements = shadowRoot.querySelectorAll('style[data-leaflet-styles]');
      expect(styleElements.length).toBe(1);
      expect(styleElements[0]).toBe(firstStyleElement); // Same element reference
    });

    it("should create a style element with proper attributes", () => {
      injectLeafletStyles(shadowRoot);
      
      const styleElement = shadowRoot.querySelector('style[data-leaflet-styles]') as HTMLStyleElement;
      expect(styleElement.tagName.toLowerCase()).toBe('style');
      expect(styleElement.getAttribute('data-leaflet-styles')).toBe('true');
      expect(styleElement.textContent).toBeDefined();
      expect(styleElement.textContent!.length).toBeGreaterThan(0);
    });

    it("should append the style element to the shadow root", () => {
      const initialChildCount = shadowRoot.children.length;
      
      injectLeafletStyles(shadowRoot);
      
      expect(shadowRoot.children.length).toBe(initialChildCount + 1);
      expect(shadowRoot.lastElementChild?.tagName.toLowerCase()).toBe('style');
      expect(shadowRoot.lastElementChild?.getAttribute('data-leaflet-styles')).toBe('true');
    });

    it("should handle shadow root with existing elements", () => {
      // Add some existing content to the shadow root
      const existingDiv = document.createElement('div');
      existingDiv.textContent = 'existing content';
      shadowRoot.appendChild(existingDiv);
      
      const initialChildCount = shadowRoot.children.length;
      
      injectLeafletStyles(shadowRoot);
      
      // Should add the style element without removing existing content
      expect(shadowRoot.children.length).toBe(initialChildCount + 1);
      expect(shadowRoot.children[0]).toBe(existingDiv); // Existing element should remain
      expect(shadowRoot.lastElementChild?.tagName.toLowerCase()).toBe('style');
    });
  });

  describe("configureLeafletDefaultIcons", () => {
    it("should call L.Icon.Default.mergeOptions with correct URLs", () => {
      // Mock the mergeOptions method
      const mergeOptionsSpy = vi.fn();
      (L.Icon.Default as any).mergeOptions = mergeOptionsSpy;

      configureLeafletDefaultIcons();

      expect(mergeOptionsSpy).toHaveBeenCalledOnce();
      
      const calledWith = mergeOptionsSpy.mock.calls[0][0];
      expect(calledWith).toHaveProperty('iconRetinaUrl');
      expect(calledWith).toHaveProperty('iconUrl');
      expect(calledWith).toHaveProperty('shadowUrl');
      
      // URLs should be strings (bundler-resolved paths)
      expect(typeof calledWith.iconRetinaUrl).toBe('string');
      expect(typeof calledWith.iconUrl).toBe('string');
      expect(typeof calledWith.shadowUrl).toBe('string');
    });

    it("should be safe to call multiple times", () => {
      const mergeOptionsSpy = vi.fn();
      (L.Icon.Default as any).mergeOptions = mergeOptionsSpy;

      // Call multiple times
      configureLeafletDefaultIcons();
      configureLeafletDefaultIcons();
      configureLeafletDefaultIcons();

      // Should be called each time (function doesn't prevent multiple calls)
      expect(mergeOptionsSpy).toHaveBeenCalledTimes(3);
      
      // Each call should have the same arguments
      const firstCall = mergeOptionsSpy.mock.calls[0][0];
      const secondCall = mergeOptionsSpy.mock.calls[1][0];
      const thirdCall = mergeOptionsSpy.mock.calls[2][0];
      
      expect(firstCall).toEqual(secondCall);
      expect(secondCall).toEqual(thirdCall);
    });

    it("should handle case where mergeOptions doesn't exist", () => {
      // Remove the mergeOptions method
      delete (L.Icon.Default as any).mergeOptions;

      // Should not throw an error
      expect(() => configureLeafletDefaultIcons()).not.toThrow();
    });

    it("should work when mergeOptions is null or undefined", () => {
      // Test with null
      (L.Icon.Default as any).mergeOptions = null;
      expect(() => configureLeafletDefaultIcons()).not.toThrow();

      // Test with undefined
      (L.Icon.Default as any).mergeOptions = undefined;
      expect(() => configureLeafletDefaultIcons()).not.toThrow();
    });
  });
});