---
work_package_id: WP06
title: Error Handling & Toast Notifications
lane: "doing"
dependencies: [WP05]
base_branch: 001-here-maps-tile-provider-support-WP05
base_commit: 9a2571d20c0423ad6902eaf1836bcec7e995e708
created_at: "2026-02-21T08:16:25.852106+00:00"
subtasks: [T032, T033, T034, T035, T036, T037]
phase: Phase 2 - Enhancement
assignee: ""
agent: "guille"
shell_pid: "16416"
review_status: ""
reviewed_by: ""
history:
  - timestamp: "2026-02-20T00:00:00Z"
    lane: planned
    agent: system
    shell_pid: ""
    action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP06 – Error Handling & Toast Notifications

## Implementation Command

```bash
spec-kitty implement WP06 --base WP05
```

## Objectives

Add user-visible error feedback and provider recovery logic to dev harness.

**Success Criteria**:

- ✅ Error toast shown for missing/invalid API key
- ✅ Success toast shown on provider switch
- ✅ HERE option disabled on API key failure
- ✅ HERE option re-enabled when valid key provided

---

## Subtasks & Guidance

### T032 – Add tile-provider-error listener

```javascript
const mapElement = document.querySelector("leaflet-geokit");

mapElement.addEventListener("tile-provider-error", (event) => {
  const { code, message } = event.detail;
  showToast(`Error: ${message}`, "error");

  // Disable HERE option on API key errors
  if (code === "missing_api_key" || code === "invalid_api_key") {
    const hereOption = providerSelect.querySelector('option[value="here"]');
    hereOption.disabled = true;
  }
});
```

---

### T033 – Add tile-provider-changed listener

```javascript
mapElement.addEventListener("tile-provider-changed", (event) => {
  const { provider, style } = event.detail;
  const styleName = style ? ` (${style})` : "";
  showToast(`Switched to ${provider}${styleName}`, "success");
});
```

---

### T034 – Implement showToast()

**Check if dev harness has existing toast system**. If yes, reuse. If no, implement simple version:

```javascript
function showToast(message, type = "info") {
  const toastContainer =
    document.querySelector(".toast-container") || createToastContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function createToastContainer() {
  const container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}
```

**Note**: Check existing CSS for `.toast` classes. If present, use those styles.

---

### T035 – Disable HERE on invalid key

**Already handled in T032** (lines 6-9).

**Verify**:

- [ ] HERE option disabled when error code is API-key related
- [ ] User cannot select HERE when disabled

---

### T036 – Show success toast

**Already handled in T033**.

---

### T037 – Re-enable HERE on valid key

```javascript
// On API key input change:
apiKeyInput.addEventListener("input", () => {
  const hereOption = providerSelect.querySelector('option[value="here"]');
  if (apiKeyInput.value.trim()) {
    hereOption.disabled = false;
  }
});
```

**Parallel**: Can implement independently.

---

## Testing

1. Select HERE without API key → verify error toast + HERE disabled
2. Enter API key → verify HERE re-enabled
3. Switch providers → verify success toast

---

## Activity Log

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
- 2026-02-21T08:16:46Z – guille – shell_pid=16416 – lane=doing – Assigned agent via workflow command
