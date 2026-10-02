# Responsive toolbar layout

The layout API is opt-in. Existing groups using `topleft`, `topright`,
`bottomleft`, `bottomright` (or no position) keep their absolute corner placement,
orientation, gap, and exact offsets. Existing styling tokens, parts, named icon /
badge / tooltip slots and tool events continue to work.

## Configuration

```ts
map.toolbarGroups = [
  {
    id: "draw",
    tools: ["polygon", "rectangle", "marker", "select"],
    preset: "responsive",
    position: "topright",
    orientation: "vertical",
    order: 0,
    overflow: "wrap",
    offset: [10, 10],
    responsive: {
      breakpoint: 600,
      position: "bottom-end",
      orientation: "horizontal",
      overflow: "scroll",
    },
  },
  { id: "save", tools: ["save"], preset: "responsive", order: 1 },
];
```

- `preset: "zones"` opts into collision-safe placement without automatic movement.
- `preset: "responsive"` uses the desktop position (default `topright`) at map
  widths >= 600 CSS pixels; below that it becomes a horizontal bottom-end sheet.
- `responsive` also opts in and accepts `breakpoint`, `position`, `orientation`,
  `order`, `overflow`, and `offset`. It overrides base configuration below the
  breakpoint; omitted mobile position/orientation default to bottom-end/horizontal.
- Named positions opt in without a preset: `top-start`, `top-end`, `bottom-start`,
  `bottom-end`, `center-end`. Legacy corner aliases work inside either preset.
- `order` defaults to 0 and sorts groups within their zone (ties keep config order).
  It does not change the order of tools within a group.
- `overflow: "wrap"` (default) wraps along the configured flex direction;
  `"scroll"` retains a single row/column with native scrollbars. Both are bounded.
- At map widths below 600, zones occupy separate rows in one column, groups span
  that column, and touch targets default to 48px. `--geokit-tool-size` and direct
  button parts still override that size. The one-column safety breakpoint is
  fixed, independent of the configurable movement breakpoint.

## Host CSS, including shadow DOM

Group ids produce a named part `toolbar-group-ID` in addition to `toolbar-group`.
Characters other than letters, digits, underscore and hyphen become hyphens; use
simple unique ids to avoid part-name collisions. Existing legacy groups retain
exactly `part="toolbar-group"`; use `[part~="toolbar-group"]` in tests/themes that
must match both modes.

```css
/* Opt in via preset: "zones", then CSS controls placement. */
leaflet-geokit::part(toolbar-group-draw) {
  --geokit-toolbar-zone: top-end;
  --geokit-toolbar-order: 2;
  --geokit-toolbar-direction: column;
  --geokit-toolbar-wrap: wrap;
}
@media (max-width: 600px) {
  leaflet-geokit::part(toolbar-group-draw) {
    --geokit-toolbar-zone: bottom-end;
    --geokit-toolbar-direction: row;
    --geokit-toolbar-order: -1;
  }
}
leaflet-geokit { --geokit-zone-gap: 8px; }
```

Configuration responds to **map width**; this CSS media-query example responds to
**viewport width**. CSS zone and order win over configuration. No shadowRoot access
is needed. `className` continues to support selectors in `themeCss`/`theme-url`, or
ordinary document selectors for externally managed Leaflet containers. Layout
styles are installed through the same runtime-independent toolbar style path.
Changes to host classes/styles, theme styles, viewport size and container size
schedule a coalesced layout pass. CSSOM `insertRule()` changes that do not mutate
style nodes should be followed by a host class change or resize.

Additional parts: `toolbar-layout`, `toolbar-zone`, `zone-top-start`, `zone-top-end`,
`zone-center-end`, `zone-bottom-start`, `zone-bottom-end`. Use parts for visual
styling; overriding their positioning/overflow can invalidate collision safety.

## Collision, insets and overflow contract

The layout measures visible native Leaflet controls and reserves full top/bottom
strips, including zoom and attribution. Separate CSS grid cells prevent opposing
zones colliding; flex stacks prevent same-zone groups colliding. Only occupied
rows consume space. This deliberately sacrifices some empty corner space to keep
placement deterministic. Multiple groups share their cell's bounded height and
scroll when needed. Narrow rows are weighted by their group counts. When the
available native-chrome-free height is below 100px per group, vertical margins
collapse and the default zone gap becomes 4px to preserve usable tool space.
Focused tools are scrolled fully into view, including tools
that the browser's default focus scrolling would leave partially clipped.

Safe areas use `env(safe-area-inset-top/right/bottom/left, 0px)` in addition to
native-control strips. Hosts can override `--geokit-safe-area-top`,
`--geokit-safe-area-right`, `--geokit-safe-area-bottom`, and
`--geokit-safe-area-left` for embedded layouts/testing. Use `viewport-fit=cover`
when appropriate for the host's mobile viewport policy.

In zone mode offsets are nonnegative spacing **inside the allocated zone**, not
absolute map coordinates. Each axis is capped at 10% of its available dimension
so oversized offsets cannot remove access. `--geokit-toolbar-offset-x/y` override
configuration. Legacy groups still use exact map-relative offsets, including
`bottomleft` / `[25, 35]` => `left: 25px; bottom: 35px`.

Use zone mode for **all groups** when requiring collision safety. Legacy absolute
groups intentionally remain outside this layout; mixing them with zones or
adding arbitrary absolute host overlays does not provide collision guarantees.
Native-control strips must leave usable map height, and the host must provide a
nonzero map size. Extremely crowded layouts can require scrolling both a zone
and an individual toolbar. Popovers/tooltips retain their existing behavior; they
are not new grid occupants, and bounded toolbar overflow can clip tooltips/badges
outside the group (accessible button labels and named slots remain available).

## Lifecycle and identity

Responsive rearrangement moves existing group/button nodes; it does not recreate
icons, slots or tool listeners. Keyboard focus is restored if moving a group
between zones detaches the focused node. Group ids and existing tool-instance ids
(`group:tool:index`) remain stable. Configuration rerender retains the existing
renderer semantics: DOM nodes may be recreated, but the same group/tool/index has
the same logical identity. Reordering the tools changes their index-based ids.
The layout owner's disconnected callback removes its resize/mutation observers,
window resize listener, focus listener and queued animation frame. No controller,
event bus or irrigation-tool lifecycle is replaced.

## Verification / real harness

Open `/irrigation-draw-mode.html` using the repository Vite server and set the
public `toolbarGroups` property as above. The automated harness uses that same
page, real synthetic map tiles, public configuration and actual button clicks.

```sh
npm run test:unit:focused -- tests/toolbar-layout.spec.ts tests/toolbar-contract.spec.ts
npm run typecheck
npm run test:e2e -- --config=playwright.layout.config.ts --output="$PAPERCLIP_RUN_SCRATCH_DIR/playwright-layout"
npm run build
```

Outside Paperclip, replace the output path with a user-writable directory. The
dedicated Playwright config owns port 5183, refuses to reuse somebody else's
preview and disables HMR so concurrent edits cannot reset test state. Playwright
starts/stops this finite server; no background preview is left running. The
layout browser suite measures map/group/zoom/attribution rectangles, exercises
configuration and CSS movement in both resize directions, same-zone order,
all five zones, narrow-width wrapping/scrolling and access to every tool,
post-movement polygon/save interaction, teardown and rerender. Styling-contract
regressions retain exact legacy placement assertions. Real device notches are
not emulated; safe-area overrides test the same inset arithmetic in Chromium.
