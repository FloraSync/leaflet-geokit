# Toolbar styling contract v2

Managed `toolbarGroups` support host-native styling without shadowRoot access or
positional Leaflet selectors. See README for pure CSS, JS-only and mixed examples,
and `irrigation-draw-mode.html` for live examples. Existing APIs remain supported.

## Parts and states

| Part               | Surface                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `host`, `map`      | Both name the internal map-sized surface. Style the actual custom-element box with `leaflet-geokit` itself.                  |
| `toolbar-group`    | Each configured toolbar container.                                                                                           |
| `toolbar-button`   | Tool buttons (also exposed on discovered native Leaflet controls). Full visual replacement applies to managed group buttons. |
| `icon`             | Custom/fallback icon wrapper; inherits color for currentColor SVGs.                                                          |
| `popover`          | Open guidance dialog; position follows the trigger.                                                                          |
| `active`           | Additional part on managed draw/edit mode buttons while active, reset on completion/cancel/deactivation.                     |
| `disabled`         | Additional part on managed buttons configured with disabled: true.                                                           |
| `badge`, `tooltip` | Decorative badge and visible hover/focus tooltip wrappers.                                                                   |

Native Leaflet sprite/visibility compatibility rules are retained. Disabled config
applies only to managed buttons, not the imperative `activateTool` API. Actions
such as Save are not persistent selected modes. Active represents draw/edit modes;
ruler and host-owned panels retain their own existing state/behavior.

Defaults include 44px buttons, hover background, a focus outline, inset active ring,
and dashed disabled border plus opacity. Keep these affordances visible when
replacing styles. Disabled native buttons skip Tab and cannot trigger actions.
Tooltips and badges are decorative (`aria-hidden`): include essential information
in `ariaLabel` or accessible popover content. Popovers do not trap focus.
For implemented responsive zones/overflow, see [toolbar layout](toolbar-layout.md).

## CSS custom properties

Tokens inherit from the custom element. Lengths accept CSS units. Internal
`--_geokit-*` config fallbacks are private, not theme APIs. Public tokens override
JS visual defaults; `::part` rules can replace properties outright. `themeCss`
and `theme-url` can scope tokens via stable data attributes. No managed button,
group or popover visual declaration uses `!important`.

| Public token(s)                                                                    | Default                                                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--geokit-tool-size`, `--geokit-tool-radius`                                       | `44px`, `12px`                                                                            |
| `--geokit-tool-background`, `--geokit-tool-color`                                  | `#fff`, `#1f5134`                                                                         |
| `--geokit-tool-border`, `--geokit-tool-shadow`                                     | `1px solid rgba(15,23,18,.18)`, `0 2px 6px rgba(15,23,18,.16)`                            |
| `--geokit-tool-hover-background`                                                   | `#f0f8ed`                                                                                 |
| `--geokit-tool-active-background`, `--geokit-tool-active-color`                    | `#dceddf`, `#16452b`                                                                      |
| `--geokit-tool-disabled-opacity`, `--geokit-tool-focus-ring`                       | `.5`, `2px solid #2f8f5f`                                                                 |
| `--geokit-toolbar-gap`, `--geokit-toolbar-direction`                               | group gap or `6px`; group orientation mapped to `row`/`column`                            |
| `--geokit-toolbar-offset-x`, `--geokit-toolbar-offset-y`                           | group offset or `10px` each                                                               |
| `--geokit-toolbar-padding`, `--geokit-toolbar-radius`                              | `6px`, `16px`                                                                             |
| `--geokit-toolbar-background`, `--geokit-toolbar-border`                           | `rgba(255,255,255,.94)`, `1px solid rgba(15,23,18,.16)`                                   |
| `--geokit-toolbar-shadow`, `--geokit-toolbar-z-index`                              | `0 1px 5px rgba(0,0,0,.35)`, `1000`                                                       |
| `--geokit-icon-size`                                                               | configured iconSize (width/height), otherwise `20px` managed / `18px` custom native icons |
| `--geokit-popover-background`, `--geokit-popover-color`                            | `#fff`, `#163323`                                                                         |
| `--geokit-popover-border`, `--geokit-popover-radius`                               | `1px solid rgba(0,0,0,.22)`, `8px`                                                        |
| `--geokit-popover-shadow`, `--geokit-popover-z-index`                              | `0 8px 24px rgba(0,0,0,.24)`, `10001`                                                     |
| `--geokit-popover-padding`, `--geokit-popover-max-width`, `--geokit-popover-font`  | `10px 12px`, `260px`, `13px system-ui, sans-serif`                                        |
| `--geokit-badge-background`, `--geokit-badge-color`, `--geokit-badge-radius`       | `#1f5134`, `#fff`, `8px`                                                                  |
| `--geokit-tooltip-background`, `--geokit-tooltip-color`, `--geokit-tooltip-radius` | `#163323`, `#fff`, `4px`                                                                  |

## Placement and data attributes

`position` supports `topleft`, `topright`, `bottomleft`, `bottomright`.
`orientation` is `vertical` (default) or `horizontal`; `gap` is a finite,
nonnegative pixel value. Offsets are `[x,y]` nonnegative pixels. Each group has
independent settings. CSS direction overrides visual flow only; use config for
semantic orientation too.

Native draw/ruler controls hide if **any** group leaves `hideDefaultToolbar`
true/default; set it false on **all** groups to retain native controls. Removing
groups restores their previous display styles.

Stable data hooks:

- Groups: `data-geokit-managed-toolbar`, `data-geokit-toolbar-group`,
  `data-geokit-toolbar-position`, `data-geokit-toolbar-orientation`.
- Managed buttons: `data-geokit-tool`, `data-geokit-toolbar-group`,
  `data-geokit-toolbar-position`, `data-geokit-tool-instance`,
  `data-geokit-active`, `data-geokit-disabled`.
- Popovers: `data-geokit-tool-popover`, `data-geokit-tool`,
  `data-geokit-toolbar-group`, `data-geokit-tool-instance`.

Tool data names keep the existing kebab-case mapping (`layer-cake`, `layer-style`,
`measurement-settings`). `::part` cannot select descendants or filter by these
attributes: use a host selector for whole instances, and `themeCss`/`theme-url`
for per-group/per-tool rules. Config setters rerender managed groups; public parts
and tokens remain effective after rerender.

## Named slots

Managed buttons provide `{groupId}-{toolKey}-{zeroBasedIndex}-icon`, `-badge`,
and `-tooltip`. Tool keys use config spelling (`layerStyle`, not `layer-style`).
For `{ id: "care", tools: ["polygon", "save"] }`:

```html
<leaflet-geokit>
  <span slot="care-save-1-icon" aria-hidden="true">S</span>
  <span slot="care-save-1-badge">2</span>
  <span slot="care-save-1-tooltip">Save growing spaces</span>
</leaflet-geokit>
```

Slots replace configured/default content, not the button or its accessible label.
Use noninteractive decorative content only. Keep group IDs unique; indices allow
duplicate tools to have independent content. Reordering tools changes slot names.
Framework hosts may still use `renderIcon` and popover renderers instead.

## Verification

```sh
npm run test:unit:focused -- tests/toolbar-contract.spec.ts tests/element.spec.ts tests/component-events.spec.ts tests/map-controller.spec.ts
npm run test:e2e -- --project=chromium e2e/toolbar-contract.spec.ts e2e/irrigation-draw-mode.spec.ts
```

The current project is `chromium`, not the historical `leaflet` name. Use a
user-writable `--output` directory if existing Playwright artifacts belong to
another user. The focused unit command disables repo-wide coverage thresholds;
it does not replace the full coverage gate for a release.
