export interface BindCakeControlsOptions {
  root: ParentNode;
  addButtonId: string;
  saveButtonId: string;
  onAddRing: () => void;
  onSave: () => void;
}

function stopEvent(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

export function bindCakeControls(options: BindCakeControlsOptions): void {
  const { root, addButtonId, saveButtonId, onAddRing, onSave } = options;

  const addBtn = root.querySelector?.(`#${addButtonId}`);
  const saveBtn = root.querySelector?.(`#${saveButtonId}`);
  if (!addBtn || !saveBtn) return;

  // renderControls() may run frequently (edit events, addRing, etc.). Prevent
  // accidental multi-binding which would cause one click to create multiple rings.
  const boundKey = "data-cake-controls-bound";
  if (
    (addBtn as HTMLElement).hasAttribute(boundKey) ||
    (saveBtn as HTMLElement).hasAttribute(boundKey)
  ) {
    return;
  }
  (addBtn as HTMLElement).setAttribute(boundKey, "true");
  (saveBtn as HTMLElement).setAttribute(boundKey, "true");

  // Prevent Leaflet from treating button interaction as map/circle interaction.
  for (const el of [addBtn, saveBtn]) {
    el.addEventListener("pointerdown", stopEvent);
    el.addEventListener("mousedown", stopEvent);
    el.addEventListener("touchstart", stopEvent);
  }

  addBtn.addEventListener("click", (e) => {
    stopEvent(e);
    onAddRing();
  });

  saveBtn.addEventListener("click", (e) => {
    stopEvent(e);
    onSave();
  });
}
