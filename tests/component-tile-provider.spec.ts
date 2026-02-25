import { describe, expect, it, vi } from "vitest";
import "@src/index";

const TAG = "leaflet-geokit";

describe("LeafletDrawMapElement — tile provider behavior", () => {
  it("supports `here-api-key` as an alias for `api-key`", () => {
    const el: any = document.createElement(TAG);

    el.setAttribute("here-api-key", "legacy-key");
    expect(el.apiKey).toBe("legacy-key");

    el.setAttribute("api-key", "canonical-key");
    expect(el.apiKey).toBe("canonical-key");

    el.removeAttribute("api-key");
    expect(el.apiKey).toBe("legacy-key");
  });

  it("emits tile-provider-changed with the previous provider", () => {
    const el: any = document.createElement(TAG);
    el._controller = {
      setTileLayer: vi.fn(),
    };

    const changed = vi.fn();
    el.addEventListener("tile-provider-changed", changed);

    el.setAttribute("api-key", "abc");
    el.setAttribute("tile-provider", "here");
    el.setAttribute("tile-provider", "osm");

    expect(changed).toHaveBeenCalledTimes(2);
    const firstDetail = (changed.mock.calls[0][0] as CustomEvent).detail;
    const secondDetail = (changed.mock.calls[1][0] as CustomEvent).detail;

    expect(firstDetail.provider).toBe("here");
    expect(firstDetail.previousProvider).toBe("tile-url");
    expect(secondDetail.provider).toBe("osm");
    expect(secondDetail.previousProvider).toBe("here");
  });

  it("classifies unknown providers with `unknown_provider`", () => {
    const el: any = document.createElement(TAG);
    el._controller = {
      setTileLayer: vi.fn(),
    };

    const errorSpy = vi.fn();
    el.addEventListener("tile-provider-error", errorSpy);

    el.setAttribute("tile-provider", "unknown-provider");

    expect(errorSpy).toHaveBeenCalledOnce();
    const detail = (errorSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.code).toBe("unknown_provider");
    expect(detail.provider).toBe("unknown-provider");
  });

  it("maps HERE permission failures to `permission_denied`", () => {
    const el: any = document.createElement(TAG);
    el._controller = {
      setTileLayer: vi.fn((_config: unknown, callbacks?: any) => {
        callbacks?.onTileError?.({ error: new Error("403 Forbidden") });
      }),
    };

    const errorSpy = vi.fn();
    el.addEventListener("tile-provider-error", errorSpy);

    el.setAttribute("api-key", "abc");
    el.setAttribute("tile-provider", "here");

    expect(errorSpy).toHaveBeenCalledOnce();
    const detail = (errorSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.code).toBe("permission_denied");
    expect(detail.provider).toBe("here");
  });
});
