# PMTiles fixture provenance

`fields.pmtiles` is a real PMTiles v3 archive containing one uncompressed MVT
vector tile at z0 and two **synthetic**, authored polygons in source-layer
`fields`. These are not real farms, OSM extracts, or surveyed geography.

Created for FloraSync leaflet-geokit by `scripts/generate-pmtiles-fixture.py`.
All geometry, names and metadata are original test data, distributed under this
repository's MIT license (copyright FloraSync contributors; see `../../LICENSE`).
No third-party map-data license or service credentials are needed. The renderer,
PMTiles reader/writer and MVT encoder retain their respective upstream licenses.

SHA-256 of the checked-in archive:
`c86f8ce29fa0869b903d32db9572d2fef516c9670279c466d5e561c807279208`.

To regenerate, in an isolated Python environment install `pmtiles==3.8.1` and
`mapbox-vector-tile==2.2.0`, then run:

```sh
python scripts/generate-pmtiles-fixture.py
sha256sum test-data/pmtiles/fields.pmtiles
```

The checked-in binary means normal npm/browser tests do not need Python or any
external data download. Testing uses real HTTP 206 range responses from a second
loopback origin with explicit CORS, the real PMTiles decoder, real MapLibre worker
and WebGL rendering. A small synthetic archive does **not** validate large regional
archives, Protomaps basemap schema versions, fonts, sprites, or offline operation.
