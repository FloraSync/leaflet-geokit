"""Rebuild the authored (not geographic survey) MIT-licensed vector fixture.
Requires pmtiles==3.8.1 and mapbox-vector-tile==2.2.0. No network data inputs.
"""
from pathlib import Path
import mapbox_vector_tile
from pmtiles.writer import write
from pmtiles.tile import Compression, TileType

output = Path(__file__).resolve().parents[1] / "test-data/pmtiles/fields.pmtiles"
output.parent.mkdir(parents=True, exist_ok=True)
features = [
    {"id": 1, "properties": {"name": "Synthetic field"},
     "geometry": {"type": "Polygon", "coordinates": [[[1600,1600],[2500,1600],[2500,2500],[1600,2500],[1600,1600]]]}},
    {"id": 2, "properties": {"name": "Synthetic nursery"},
     "geometry": {"type": "Polygon", "coordinates": [[[2600,1800],[2900,1800],[2900,2300],[2600,2300],[2600,1800]]]}}
]
tile = mapbox_vector_tile.encode({"name": "fields", "features": features})
with write(str(output)) as archive:
    archive.write_tile(0, tile)
    archive.finalize({
        "tile_compression": Compression.NONE, "tile_type": TileType.MVT,
        "min_zoom": 0, "max_zoom": 0,
        "min_lon_e7": -1800000000, "min_lat_e7": -850000000,
        "max_lon_e7": 1800000000, "max_lat_e7": 850000000,
        "center_zoom": 0, "center_lon_e7": 0, "center_lat_e7": 0,
    }, {"name": "GeoKit synthetic fields", "attribution": "FloraSync synthetic fixture (MIT)",
        "vector_layers": [{"id": "fields", "fields": {"name": "String"}, "minzoom": 0, "maxzoom": 0}]})
print(output)
