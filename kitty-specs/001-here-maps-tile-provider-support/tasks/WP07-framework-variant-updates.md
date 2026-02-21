---
work_package_id: "WP07"
subtasks: ["T038", "T039", "T040", "T041", "T042", "T043"]
title: "Framework Variant Updates"
phase: "Phase 2 - Enhancement"
lane: "planned"
dependencies: ["WP06"]
assignee: ""
agent: ""
shell_pid: ""
review_status: ""
reviewed_by: ""
history:
  - timestamp: "2026-02-20T00:00:00Z"
    lane: "planned"
    agent: "system"
    shell_pid: ""
    action: "Prompt generated via /spec-kitty.tasks"
---

# Work Package Prompt: WP07 – Framework Variant Updates

## Implementation Command

```bash
spec-kitty implement WP07 --base WP06
```

## Objectives

Replicate tile provider controls to all dev harness variants.

**Success Criteria**:

- ✅ `preact.html` has provider controls
- ✅ `react.html` has provider controls
- ✅ `external.html` has provider controls
- ✅ All variants functionally identical to `index.html`

---

## Subtasks (ALL PARALLEL)

### T038 – Update preact.html

Copy UI controls and JavaScript logic from `index.html`:

1. Copy HTML (T025-T027)
2. Copy JavaScript (T028-T031, T032-T037)
3. Test in browser

---

### T039 – Update react.html

Same as T038, but for `react.html`.

---

### T040 – Update external.html

Same as T038, but for `external.html`.

---

### T041 – Test preact.html

Load preact.html in browser:

- [ ] Provider dropdown works
- [ ] Style dropdown shows/hides
- [ ] localStorage persists
- [ ] Tiles update

---

### T042 – Test react.html

Same testing as T041.

---

### T043 – Test external.html

Same testing as T041.

---

## Parallelization

**All 6 subtasks can run in parallel** - each file is independent.

---

## Testing

Test each variant manually in browser. Use diff to compare with index.html.

---

## Activity Log

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
