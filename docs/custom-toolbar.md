# Branded toolbars and external buttons

Start with [the complete plain HTML example](../custom-toolbar.html): run
`npm run dev`, then open `/custom-toolbar.html`. It uses only public element
properties, events, CSS parts and tokens; no Leaflet toolbar DOM surgery. The
example imports `/src/index.ts` for Vite development. In a consumer bundler replace
that import with `@florasync/leaflet-geokit`; do not deploy a `/src` URL. For direct
browser modules use the version-pinned [Django entrypoint](shims/django.md).

## Choose the customization layer

| API                              | Use                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `toolButtonConfig`               | Labels, icons, classes, popovers and visual defaults keyed by tool name.                                                                  |
| `toolbarGroups`                  | Explicit tool order, placement and semantic group labels.                                                                                 |
| `className`                      | App-owned classes on individual buttons. Target these inside `themeCss`, not document-level descendant selectors across Shadow DOM.       |
| `iconUrl`                        | An app-owned SVG/PNG URL. Resolve bundled assets with `new URL("./icon.svg", import.meta.url).href`.                                      |
| `iconHtml`                       | Developer-owned inline SVG/HTML, allowing `currentColor`.                                                                                 |
| `renderIcon`                     | JS property callback returning an HTMLElement, SVGElement, string, null or undefined. Functions cannot be represented in JSON attributes. |
| `popover`                        | Point-of-action guidance with `title`, text `body`, trusted `html` or a `render` callback.                                                |
| CSS custom properties / `::part` | Host theme overrides without depending on private Leaflet structure.                                                                      |

See [the API reference](api-reference.md), [styling tokens/parts/slots](toolbar-styling.md),
[responsive zones and overflow](toolbar-layout.md), and [keyboard accessibility](accessibility.md).
Property configuration overrides JSON attributes. `undefined` restores attribute
fallback; `null` clears programmatic configuration. Set configuration before
mount when possible, or assign through public setters after upgrade.

## Minimal toolbar configuration

```js
map.toolButtonConfig = {
  polygon: {
    title: "Draw growing space",
    ariaLabel: "Draw growing space",
    className: "flora-primary",
    iconUrl: "/assets/growing-space.svg",
    popover: {
      title: "Boundary",
      body: "Click corners, then the first point to finish.",
    },
  },
  save: { title: "Save growing spaces", ariaLabel: "Save growing spaces" },
};
map.toolbarGroups = [
  {
    id: "grow",
    tools: ["polygon", "select", "save"],
    position: "bottomleft",
    orientation: "horizontal",
    offset: [12, 12],
    hideDefaultToolbar: true,
    ariaLabel: "Growing-space tools",
  },
];
```

Enable the matching tool attributes, e.g. `draw-polygon`. Placement supports
`topleft`, `topright`, `bottomleft`, `bottomright`. `offset` is `[x, y]` in pixels.
The native draw/ruler toolbar hides when **any** group has
`hideDefaultToolbar: true` (the default). Set it false on **every** group to keep
native controls. `select` cancels drawing; `save` emits `leaflet-draw:export`—it
is not a server write. Persist `event.detail.geoJSON` in your host application.

## Host-app CSS

```css
leaflet-geokit {
  display: block;
  width: 100%;
  height: 65vh;
  min-height: 320px;
  --geokit-tool-size: 48px;
  --geokit-tool-radius: 12px;
  --geokit-tool-background: #edf6ee;
  --geokit-tool-color: #183b27;
  --geokit-tool-focus-ring: 3px solid #287d47;
  --geokit-toolbar-background: #f4f8f2;
  --geokit-toolbar-gap: 8px;
}
leaflet-geokit::part(toolbar-group) {
  border: 1px solid #287d47;
}
[data-theme="dark"] leaflet-geokit {
  --geokit-tool-background: #203d2a;
  --geokit-tool-color: #e0f1de;
  --geokit-toolbar-background: #15261b;
  --geokit-tool-hover-background: #31563c;
  --geokit-tool-focus-ring: 3px solid #9fdaaa;
}
@media (prefers-reduced-motion: reduce) {
  leaflet-geokit::part(toolbar-button) {
    transition: none;
  }
}
```

For per-tool styling, assign
`map.themeCss = '[data-geokit-tool="polygon"].flora-primary { --geokit-tool-radius: 50%; }'`.
Document-level `.flora-primary` rules cannot pierce Shadow DOM. Do not query private
Leaflet classes or replace internal buttons; setters may rerender groups.

## External layer-cake button

Use a native `<button type="button" disabled>Build layered zone</button>` outside
the map and enable `draw-layer-cake` on `<leaflet-geokit>`. Bind its disabled state to the capability snapshot rather than guessing
whether initialization has finished:

```js
function refresh() {
  const capability = map.getToolCapabilities().tools.layerCake;
  button.disabled = capability.state !== "enabled";
  button.title = capability.reason?.message ?? "Build layered zone";
}
map.addEventListener("leaflet-geokit:tool-capabilities-changed", refresh);
refresh();
button.addEventListener("click", async () => {
  await map.activateTool("layerCake", { source: "external-layer-button" });
});
cancelButton.addEventListener("click", async () => {
  await map.deactivateTool({ source: "external-layer-button" });
});
```

The event alternative dispatches **on the map element**, not an unrelated button:

```js
map.dispatchEvent(
  new CustomEvent("leaflet-geokit:activate-tool", {
    detail: { tool: "layerCake", source: "external-layer-button" },
  }),
);
```

Listen to `leaflet-geokit:tool-failed` for actionable failures; do not equate a
resolved command promise with persisted geometry. See [tool lifecycle](tool-lifecycle.md)
and [layer-cake session methods](layers.md). Remove listeners when your framework
unmounts. UI-only `configured_disabled` does not prohibit imperative activation:
your external button should respect `state`, not only `commandEnabled`.

## Trust boundary: SVG, HTML and URLs

`iconHtml`, string renderer results, popover HTML and `themeCss` are trusted-code
surfaces, not sanitizers. Never interpolate uploaded GeoJSON properties, user
labels, remote markup or database text into these strings. Prefer `iconUrl` for
reviewed static assets and DOM nodes populated via `textContent` for untrusted
text. If rich untrusted markup is unavoidable, sanitize in the host using a vetted
policy before passing it; do not rely on Shadow DOM for isolation. Keep URLs
allowlisted and compatible with your CSP. Never put private provider credentials
in browser markup, diagnostic logs or screenshots.

## Integration and screenshot checklist

- Give the host and its containing layout real width/height; test hidden-tab reveal.
- Check toolbar/popover z-index against host dialogs and sticky navigation.
- Check light/dark hover, active, disabled, icon contrast and popover readability.
- Keep touch targets at least 44 × 44 CSS pixels; verify tool access at mobile,
  tablet and desktop widths, including overflow scrolling.
- Keep visible focus rings, accessible names, arrow-key group navigation and Escape.
- Honor reduced motion; never convey state through animation or color alone.
- Capture light/dark screenshots at all three viewport classes. Inspect actual
  layout, not only no-error/no-clipping assertions. A cramped map can pass both.
- Exercise polygon completion, Save export, external layer-cake activation and Cancel.
- Confirm import, teardown/remount and both bundled/external modes used by the app.

The existing [irrigation harness](../irrigation-draw-mode.html) retains the larger
secondary-toolbar and external-panel drawing scenarios; do not replace those
regression checks with screenshots of an idle toolbar.
