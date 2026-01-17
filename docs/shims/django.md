# Django shim

This shim bridges a Django form widget (`<textarea>`) to the `<leaflet-geokit>` custom element. It keeps your form field synchronized with the map editor while letting Django submit the GeoJSON value as usual.

## Install

```bash
npm install @florasync/leaflet-geokit
```

## Quick start (Django widget)

Create a widget that renders a textarea with the shim selector class:

```python
# widgets.py
from django import forms

class LeafletGeoKitWidget(forms.Textarea):
    template_name = "widgets/geokit_map.html"

    class Media:
        # ESM shim bundle (module script)
        js = (
            "https://cdn.jsdelivr.net/npm/@florasync/leaflet-geokit/dist/django/index.js",
        )
        css = {
            "all": ("https://unpkg.com/leaflet/dist/leaflet.css",)
        }

    def __init__(self, attrs=None):
        default_attrs = {"class": "geokit-editor-widget"}
        if attrs:
            default_attrs.update(attrs)
        super().__init__(default_attrs)
```

Template snippet:

```html
{# widgets/geokit_map.html #} {% include "django/forms/widgets/textarea.html" %}
<script type="module">
  document.addEventListener("DOMContentLoaded", () => {
    window.GeoKitDjango?.init(".geokit-editor-widget");
  });
</script>
```

## Configuration via data attributes

The shim copies `data-geokit-*` attributes from the textarea onto the custom element, so you can configure the map per field without writing extra JS.

```html
<textarea
  class="geokit-editor-widget"
  data-geokit-height="480"
  data-geokit-latitude="39.7392"
  data-geokit-longitude="-104.9903"
  data-geokit-zoom="11"
  data-geokit-draw-polygon
  data-geokit-draw-rectangle
  data-geokit-edit-features
  data-geokit-delete-features
></textarea>
```

Notes:

- `data-geokit-height` accepts a number (pixels) or any valid CSS height string.
- Boolean attributes (e.g., `data-geokit-draw-polygon`) can be written as empty, `true`, or `1` to enable. Use `false` or `0` to skip.

## Using the shim programmatically

```js
import { initDjangoGeokit } from "@florasync/leaflet-geokit/django";

const handles = initDjangoGeokit(".geokit-editor-widget", {
  height: 420,
  onError: (error, context) => {
    console.error("GeoKit Django shim error", error, context);
  },
});

// Later if needed
handles.forEach((handle) => handle.destroy());
```

## Data flow

- The shim mounts `<leaflet-geokit>` above the textarea and hides the textarea.
- GeoJSON edits emit custom events (`leaflet-draw:*`); the shim calls `getGeoJSON()` and writes the serialized value back into the textarea.
- Initial textarea JSON (if any) is loaded into the map on `leaflet-draw:ready`.

## Troubleshooting

- If the map is blank, make sure the field has a fixed height (use `data-geokit-height` or the shim `height` option).
- If you see a JSON parsing error, confirm the textarea contains a valid GeoJSON FeatureCollection.
