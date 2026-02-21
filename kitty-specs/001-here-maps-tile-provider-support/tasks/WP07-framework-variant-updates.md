---
work_package_id: WP07
title: Framework Variant Updates
lane: "doing"
dependencies: [WP06]
base_branch: 001-here-maps-tile-provider-support-WP06
base_commit: 3edbb4ac0fcd66bf68cd396bbac57bae74ea11ae
created_at: "2026-02-21T08:26:20.300336+00:00"
subtasks: [T038, T039, T040, T041, T042, T043]
phase: Phase 2 - Enhancement
assignee: ""
agent: "GeminiCLI"
shell_pid: "28296"
review_status: ""
reviewed_by: ""
history:
  - timestamp: "2026-02-20T00:00:00Z"
    lane: planned
    agent: system
    shell_pid: ""
    action: Prompt generated via /spec-kitty.tasks
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
- 2026-02-21T08:26:39Z – guille – shell_pid=16416 – lane=doing – Assigned agent via workflow command
- 2026-02-21T08:32:18Z – guille – shell_pid=16416 – lane=for_review – Ready for review: propagated tile provider UI and toast logic to preact/react/external harnesses
- 2026-02-21T08:32:57Z – GeminiCLI – shell_pid=28296 – lane=doing – Started review via workflow command
