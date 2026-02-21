---
work_package_id: "WP08"
subtasks: ["T044", "T045", "T046", "T047", "T048", "T049"]
title: "Documentation & README Updates"
phase: "Phase 3 - Polish"
lane: "planned"
dependencies: []
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

# Work Package Prompt: WP08 – Documentation & README Updates

## Implementation Command

```bash
spec-kitty implement WP08
```

**Note**: Can start in parallel with implementation WPs once contracts are finalized.

## Objectives

Document new tile provider attributes in README.md.

**Success Criteria**:

- ✅ Tile Providers section added
- ✅ OSM, HERE, and custom tile-url documented
- ✅ Security warning included
- ✅ Complete code examples

---

## Subtasks (ALL PARALLEL)

### T044 – Add Tile Providers section

Insert after installation section, before advanced usage:

```markdown
## Tile Providers

The `<leaflet-geokit>` web component supports multiple tile providers:
```

---

### T045 – Document OSM usage

````markdown
### OpenStreetMap (Default)

```html
<leaflet-geokit tile-provider="osm"></leaflet-geokit>
```
````

````

---

### T046 – Document HERE usage

```markdown
### HERE Maps

Requires a HERE API key ([get one here](https://developer.here.com/)):

```html
<leaflet-geokit
  tile-provider="here"
  tile-style="lite.day"
  api-key="YOUR_HERE_API_KEY">
</leaflet-geokit>
````

````

---

### T047 – Document HERE styles

```markdown
**Available HERE Styles**:
- `lite.day` - Lightweight basemap (default)
- `normal.day` - Standard street map
- `satellite.day` - Satellite imagery
````

---

### T048 – Document tile-url compatibility

````markdown
### Custom Tile Server (Backward Compatible)

You can still use custom tile URLs:

```html
<leaflet-geokit
  tile-url="https://example.com/tiles/{z}/{x}/{y}.png"
></leaflet-geokit>
```
````

````

---

### T049 – Add security warning

```markdown
### Security Note

⚠️ For production use, **do not** expose API keys client-side. Use a server-side proxy to request tiles.
````

---

## Testing

- [ ] README renders correctly in GitHub
- [ ] Links work
- [ ] Code examples are syntax-highlighted

---

## Activity Log

- 2026-02-20T00:00:00Z – system – lane=planned – Prompt generated.
