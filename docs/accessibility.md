# Keyboard and accessibility contract

GeoKit 0.8.3 keeps the existing framework-agnostic tool command API. Keyboard
activation uses the same toolbar command path as a pointer click, including the
existing capability gates and public lifecycle events.

## Command map

| Key | Context | Action |
| --- | --- | --- |
| Tab / Shift+Tab | Map controls | Visit enabled controls using the browser's normal tab order; no toolbar focus trap. |
| Left / Right | Horizontal toolbar | Previous / next enabled tool, wrapping at the ends. |
| Up / Down | Vertical toolbar | Previous / next enabled tool, wrapping at the ends. |
| Home / End | Toolbar | First / last enabled tool. |
| Enter / Space | Tool button | Activate the tool. Also works on native Leaflet anchor buttons and the ruler control. |
| Escape | Active map mode | Deactivate/cancel using the existing select command; no export. |
| Escape | Focused tool popover or settings dialog | Close it and return focus to its trigger. A subsequent Escape can cancel an active map mode. |
| Ctrl+Enter / Cmd+Enter | Map or toolbar | Commit active edit/delete changes; confirm a pending move; otherwise export completed geometry via the save command. |
| Tab / Shift+Tab | Measurement units dialog | Cycle through the selected unit radio and Close button. Radio arrow keys remain native. |

Text fields, selects, editable content and dialogs do not receive map-level
shortcuts. Single-letter shortcuts are deliberately avoided. Measurement mode is
reached with the toolbar's **Measure distance** button; Measurement settings opens
the named units dialog. Disabled tools are not keyboard-activatable. Their
requirements are available through the existing capability API.

These commands do not implement keyboard vertex placement or move a selected
geometry with arrow keys. Complete drawing with the tool's existing interaction;
Ctrl+Enter exports completed geometry rather than finishing an unfinished polygon
or layer-cake session. Layer-cake session Save/Cancel controls remain separate.

## Semantics and announcements

- Managed groups and native draw/edit groups expose named `toolbar` roles and
  orientation; buttons have accessible names and native anchor controls expose
  `button` roles.
- Persistent managed tools (including ruler) reflect `aria-pressed`.
- Configured popover triggers expose `aria-haspopup="dialog"` and explicit
  `aria-expanded` state. Non-modal popovers receive focus without trapping Tab.
  Their inside/outside click handling uses the composed event path across shadow
  DOM. Escape is scoped to the originating control/popover, not every map.
- Measurement settings has an accessible dialog name, bounded Tab navigation,
  and focus restoration. The existing layer-style dialog retains its own focus
  restoration.
- Persistent `role="status"` / polite and `role="alert"` / assertive regions
  announce tool outcomes and failure reasons. Messages use text, never HTML, and
  survive toolbar configuration rerenders.

## Contrast, motion, and target sizing

`forced-colors: active` and `prefers-contrast: more` choose system-color defaults
through the existing `--geokit-toolbar-*`, `--geokit-tool-*`,
`--geokit-popover-*`, and `--geokit-panel-*` tokens. Focus and pressed states have
visible outlines as well as color changes. Host overrides should preserve these
states and contrast; tokens can also be overridden on the exposed parts.

`prefers-reduced-motion: reduce` removes animations/transitions in the map subtree
and disables smooth scrolling. `--geokit-reduced-motion-duration` defaults to `0s`
in this media mode. This does not change JavaScript Leaflet animation options.

Managed buttons retain 44px desktop defaults and 48px narrow responsive defaults.
Dense layouts reduce default group padding, not target size. Explicit host size
and padding overrides remain authoritative; hosts must not reduce usable targets.
The responsive layout reserves native zoom/attribution space and keeps enabled
controls reachable through overflow scrolling. See [Toolbar layout](toolbar-layout.md).

## Repeatable checks

From the repository root:

```sh
npm run typecheck
npm run test:unit:focused -- tests/toolbar-accessibility.spec.ts tests/toolbar-contract.spec.ts tests/tool-lifecycle.spec.ts tests/map-controller.spec.ts tests/draw-event-runtime.spec.ts
npm run test:unit:focused -- tests/draw-move-pointer.spec.ts
npx playwright test -c playwright.accessibility.config.ts --output="$PAPERCLIP_RUN_SCRATCH_DIR/a11y-results"
PLAYWRIGHT_JSON_OUTPUT_NAME="$PAPERCLIP_RUN_SCRATCH_DIR/touch-report.json" npx playwright test -c playwright.touch.config.ts --reporter=list,json --output="$PAPERCLIP_RUN_SCRATCH_DIR/touch-results"
```

Outside Paperclip, choose a writable output directory instead. The finite
Playwright-owned Vite preview uses port 5187, disables HMR, and shuts down after
the suite. It does not reuse an existing server.

The Chromium suite exercises all 14 public tools using keyboard activation on
the existing irrigation harness, native anchor activation, edit/delete commit,
measurement cancellation, modal focus, popover shadow-DOM clicks, error/status
announcements, high-contrast/reduced-motion media, and measured mobile targets.
It also runs the existing CSS-contract and responsive-layout regressions,
including 320px and 390px maps. These are basic accessibility checks, not an axe
scan or screen-reader certification.

## Touch geometry contract and verified coverage

Bundled `DrawMove` and external `RuntimeDrawMove` share `move-pointer.ts`.
Move captures the primary pointer on the stable map container, including when a
feature is Canvas-rendered. It disables map dragging only for the active gesture
and restores its prior enabled state on release. Pointer cancellation, lost
capture, mode switch and destruction release capture and roll back uncommitted
geometry. Normal pointerup preserves a transaction for Save/Cancel; Save clears
rollback state before notifying synchronous completion listeners. There is no
parallel compatibility-mouse drag path.

Draw, edit and delete reuse Leaflet.draw and the irrigation harness rather than
adding a second gesture implementation. Coarse-pointer edit handles expose 44px
hit targets around 12px visible vertices. Move confirmation controls have 44px
minimum targets, suppress map touch propagation, and sit above bottom toolbars.

`e2e/touch-geometry.spec.ts` passes 20 Chromium tests: ten cases each with Canvas
and SVG on a 390 × 844 touch viewport. Real `page.touchscreen` taps and Chromium
CDP `Input.dispatchTouchEvent` drags exercise:

- Polygon creation by vertex taps and closure, plus unfinished-draw cancellation.
- Edit geometry change with cancellation rollback and Save persistence.
- Delete with cancellation restoration and Save removal.
- Captured move outside map bounds without map panning; Cancel rollback and Save
  persistence, with no duplicate compatibility mousedown.
- Browser-generated pointercancel and lost-capture rollback; mouse pointer
  release outside the map remains supported.
- Mode switch and controller destruction during an active touch, with capture,
  transaction and touch-action cleanup.
- External Move registration, touch cancellation and confirmation.
- Measured edit hit targets, an off-center finger drag, and non-overlap with
  toolbar/native controls in the tested layout.
- Correlated command IDs and exactly one completion for saved draw/edit/delete/
  move operations; cancelled operations do not produce extra completions.

Focused unit tests additionally cover both Move implementations with map dragging
initially disabled, unrelated pointer IDs, pending-transaction protection,
re-enabling, teardown and synchronous completion listeners. The JSON report
preserves geometry/event evidence and the harness saves screenshots per case.

### Platform and scope constraints

This is Chromium touch emulation, not physical Android/iOS certification. CDP
touchCancel is a browser input event, not `handler.fire` or a constructed DOM
PointerEvent. Lost-capture testing explicitly calls `releasePointerCapture`
during a real drag; mode switch/destroy invoke the controller API during a real
drag. External coverage registers a fresh host namespace against the same
installed Leaflet version; it does not certify arbitrary host Leaflet versions.
The gesture fixture uses six managed tools and a polygon. It does not claim
every shape, dense overlapping vertex target, custom host toolbar layout,
multi-touch gesture, Firefox or WebKit has been tested. The separate keyboard
suite continues to cover all 14 public tools and 320px/390px responsive layouts.
