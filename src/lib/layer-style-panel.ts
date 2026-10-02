import {
  LAYER_STYLE_PRESETS,
  type MapLayer,
  type LayerStyle,
} from "@src/types/layers";

/** Small default panel. Hosts can cancel the public request and render their own. */
export function openLayerStylePanel(
  root: HTMLElement,
  layers: MapLayer[],
  apply: (id: string, style: LayerStyle) => void,
): () => void {
  const previousFocus =
    root.getRootNode() instanceof ShadowRoot
      ? (root.getRootNode() as ShadowRoot).activeElement
      : document.activeElement;
  const panel = document.createElement("section");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Layer style");
  panel.setAttribute("part", "layer-style-panel");
  Object.assign(panel.style, {
    position: "absolute",
    zIndex: "1100",
    top: "12px",
    left: "12px",
    padding: "12px",
    background: "var(--geokit-panel-background, white)",
    color: "var(--geokit-panel-color, #222)",
  });
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Layer");
  layers
    .filter((layer) => layer.kind !== "base")
    .forEach((layer) => {
      const option = document.createElement("option");
      option.value = layer.id;
      option.textContent = layer.name;
      select.append(option);
    });
  panel.append(select);
  const preset = document.createElement("select");
  preset.setAttribute("aria-label", "Style preset");
  for (const name of Object.keys(LAYER_STYLE_PRESETS)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    preset.append(option);
  }
  panel.append(preset);
  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.textContent = "Apply style";
  applyButton.disabled = select.options.length === 0;
  applyButton.onclick = () =>
    apply(
      select.value,
      LAYER_STYLE_PRESETS[preset.value as keyof typeof LAYER_STYLE_PRESETS],
    );
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close layer style";
  const cleanup = () => {
    panel.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
      previousFocus.focus();
  };
  close.onclick = cleanup;
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      cleanup();
    }
  });
  for (const event of [
    "click",
    "dblclick",
    "pointerdown",
    "mousedown",
    "wheel",
  ])
    panel.addEventListener(event, (e) => e.stopPropagation());
  panel.append(applyButton, close);
  root.append(panel);
  select.focus();
  return cleanup;
}
