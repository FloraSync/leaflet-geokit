/** Public toolbar styling contract, also installed for external Leaflet runtimes. */
export const toolbarStyles = `
.leaflet-geokit-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
geokit-toolbar-layout {
  position: absolute;
  z-index: var(--geokit-toolbar-z-index, 1000);
  inset: calc(var(--_geokit-native-top, 0px) + var(--geokit-safe-area-top, env(safe-area-inset-top, 0px)))
    var(--geokit-safe-area-right, env(safe-area-inset-right, 0px))
    calc(var(--_geokit-native-bottom, 0px) + var(--geokit-safe-area-bottom, env(safe-area-inset-bottom, 0px)))
    var(--geokit-safe-area-left, env(safe-area-inset-left, 0px));
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--geokit-zone-gap, var(--_geokit-zone-gap, 8px));
  min-width: 0;
  min-height: 0;
  pointer-events: none;
}
geokit-toolbar-layout[data-narrow="true"] { grid-template-columns: minmax(0, 1fr); }
geokit-toolbar-layout[data-dense="true"] { --_geokit-zone-gap: 4px; --_geokit-row-inset: 0px; --_geokit-toolbar-padding: 0px; }
[data-geokit-zone] {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
  min-height: 0;
  gap: var(--geokit-zone-gap, var(--_geokit-zone-gap, 8px));
  overflow: auto;
  pointer-events: none;
}
[data-geokit-zone][hidden] { display: none; }
[data-geokit-zone$="start"] { align-items: flex-start; }
[data-geokit-zone^="bottom"] { justify-content: safe flex-end; }
[data-geokit-zone="center-end"] { justify-content: safe center; }
geokit-toolbar-layout .leaflet-geokit-toolbar-group.leaflet-bar {
  position: relative;
  inset: auto;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  max-width: calc(100% - 2 * min(var(--geokit-toolbar-offset-x, var(--_geokit-layout-x, 10px)), 10%));
  max-height: calc(100% - 2 * min(var(--geokit-toolbar-offset-y, var(--_geokit-layout-y, 10px)), 10%));
  margin-inline: min(var(--geokit-toolbar-offset-x, var(--_geokit-layout-x, 10px)), 10%);
  margin-block: min(var(--geokit-toolbar-offset-y, var(--_geokit-layout-y, 10px)), var(--_geokit-row-inset, 10%));
  flex-wrap: var(--geokit-toolbar-wrap, var(--_geokit-wrap, wrap));
  order: var(--geokit-toolbar-order, var(--_geokit-order, 0));
  overflow: auto;
  pointer-events: auto;
  overscroll-behavior: contain;
}
geokit-toolbar-layout[data-narrow="true"] .leaflet-geokit-toolbar-group {
  --_geokit-touch-size: 48px;
  width: calc(100% - 2 * min(var(--geokit-toolbar-offset-x, var(--_geokit-layout-x, 10px)), 10%));
}
.leaflet-geokit-toolbar-group.leaflet-bar {
  position: absolute;
  z-index: var(--geokit-toolbar-z-index, 1000);
  display: flex;
  flex-direction: var(--geokit-toolbar-direction, var(--_geokit-direction, column));
  gap: var(--geokit-toolbar-gap, var(--_geokit-gap, 6px));
  padding: var(--geokit-toolbar-padding, var(--_geokit-toolbar-padding, 6px));
  border: var(--geokit-toolbar-border, 1px solid rgba(15, 23, 18, .16));
  border-radius: var(--geokit-toolbar-radius, 16px);
  background: var(--geokit-toolbar-background, rgba(255, 255, 255, .94));
  box-shadow: var(--geokit-toolbar-shadow, 0 1px 5px rgba(0, 0, 0, .35));
}
.leaflet-geokit-toolbar-group[data-geokit-toolbar-position^="top"] {
  top: var(--geokit-toolbar-offset-y, var(--_geokit-offset-y, 10px));
}
.leaflet-geokit-toolbar-group[data-geokit-toolbar-position^="bottom"] {
  bottom: var(--geokit-toolbar-offset-y, var(--_geokit-offset-y, 10px));
}
.leaflet-geokit-toolbar-group[data-geokit-toolbar-position$="left"] {
  left: var(--geokit-toolbar-offset-x, var(--_geokit-offset-x, 10px));
}
.leaflet-geokit-toolbar-group[data-geokit-toolbar-position$="right"] {
  right: var(--geokit-toolbar-offset-x, var(--_geokit-offset-x, 10px));
}
.leaflet-geokit-toolbar-button {
  touch-action: manipulation;
  box-sizing: border-box;
  flex: none;
  display: block;
  position: relative;
  width: var(--geokit-tool-size, var(--_geokit-touch-size, 44px));
  height: var(--geokit-tool-size, var(--_geokit-touch-size, 44px));
  padding: 0;
  border: var(--geokit-tool-border, 1px solid rgba(15, 23, 18, .18));
  border-radius: var(--geokit-tool-radius, 12px);
  background: var(--geokit-tool-background, #fff);
  color: var(--geokit-tool-color, #1f5134);
  box-shadow: var(--geokit-tool-shadow, 0 2px 6px rgba(15, 23, 18, .16));
  cursor: pointer;
}
.leaflet-geokit-toolbar-button:hover:not(:disabled),
.leaflet-geokit-toolbar-button:focus-visible {
  background: var(--geokit-tool-hover-background, #f0f8ed);
}
.leaflet-geokit-toolbar-button[aria-pressed="true"] {
  background: var(--geokit-tool-active-background, #dceddf);
  color: var(--geokit-tool-active-color, #16452b);
  box-shadow: inset 0 0 0 2px currentColor;
}
.leaflet-geokit-toolbar-button:focus-visible {
  outline: var(--geokit-tool-focus-ring, 2px solid #2f8f5f);
  outline-offset: 2px;
}
.leaflet-geokit-toolbar-button:disabled {
  opacity: var(--geokit-tool-disabled-opacity, .5);
  cursor: not-allowed;
  border-style: dashed;
}
.leaflet-geokit-tool-button-icon {
  position: absolute;
  display: block;
  left: 50%;
  top: 50%;
  width: var(--geokit-icon-size, var(--_geokit-icon-width, 18px));
  height: var(--geokit-icon-size, var(--_geokit-icon-height, 18px));
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.leaflet-geokit-tool-button-icon > :not(slot),
.leaflet-geokit-tool-button-icon > slot > *,
.leaflet-geokit-tool-button-icon > slot::slotted(*) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.leaflet-geokit-tool-badge {
  position: absolute;
  right: -4px;
  top: -4px;
  pointer-events: none;
  color: var(--geokit-badge-color, #fff);
  background: var(--geokit-badge-background, #1f5134);
  border-radius: var(--geokit-badge-radius, 8px);
  font: 11px system-ui, sans-serif;
}
.leaflet-geokit-tool-tooltip {
  position: absolute;
  bottom: 100%;
  right: 0;
  width: max-content;
  max-width: 240px;
  padding: 4px 8px;
  visibility: hidden;
  pointer-events: none;
  z-index: var(--geokit-popover-z-index, 10001);
  color: var(--geokit-tooltip-color, #fff);
  background: var(--geokit-tooltip-background, #163323);
  border-radius: var(--geokit-tooltip-radius, 4px);
  font: 12px system-ui, sans-serif;
}
.leaflet-geokit-toolbar-button:hover .leaflet-geokit-tool-tooltip,
.leaflet-geokit-toolbar-button:focus-visible .leaflet-geokit-tool-tooltip {
  visibility: visible;
}
[data-geokit-tool-popover="true"] {
  position: absolute;
  z-index: var(--geokit-popover-z-index, 10001);
  max-width: var(--geokit-popover-max-width, 260px);
  padding: var(--geokit-popover-padding, 10px 12px);
  border: var(--geokit-popover-border, 1px solid rgba(0, 0, 0, .22));
  border-radius: var(--geokit-popover-radius, 8px);
  background: var(--geokit-popover-background, #fff);
  color: var(--geokit-popover-color, #163323);
  box-shadow: var(--geokit-popover-shadow, 0 8px 24px rgba(0, 0, 0, .24));
  font: var(--geokit-popover-font, 13px system-ui, sans-serif);
  line-height: 1.35;
}
[data-geokit-tool-popover="true"] > strong {
  display: block;
  margin-bottom: 4px;
}
@media (prefers-reduced-motion: reduce) {
  [data-geokit-map-container] *, [data-geokit-map-container] *::before, [data-geokit-map-container] *::after {
    animation-duration: var(--geokit-reduced-motion-duration, 0s) !important;
    transition-duration: var(--geokit-reduced-motion-duration, 0s) !important;
    scroll-behavior: auto !important;
  }
}
@media (forced-colors: active), (prefers-contrast: more) {
  [data-geokit-map-container] {
    --geokit-toolbar-background: Canvas;
    --geokit-toolbar-border: 1px solid CanvasText;
    --geokit-tool-background: Canvas;
    --geokit-tool-color: CanvasText;
    --geokit-tool-border: 1px solid ButtonText;
    --geokit-tool-focus-ring: 3px solid Highlight;
    --geokit-tool-active-background: Highlight;
    --geokit-tool-active-color: HighlightText;
    --geokit-tool-hover-background: Canvas;
    --geokit-popover-background: Canvas;
    --geokit-popover-color: CanvasText;
    --geokit-popover-border: 1px solid CanvasText;
    --geokit-panel-background: Canvas;
    --geokit-panel-color: CanvasText;
    --geokit-tool-disabled-opacity: 1;
  }
  .leaflet-geokit-toolbar-button[aria-pressed="true"] { outline: 2px solid Highlight; }
}
`;
