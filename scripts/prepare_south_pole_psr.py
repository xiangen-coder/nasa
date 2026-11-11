"""Package the NASA LOLA permanent-shadow mask on the existing regional grid."""

import hashlib
import json
from argparse import ArgumentParser
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS
from rasterio.windows import Window, from_bounds


DIRECTORY = Path(__file__).resolve().parents[1] / "data/lunar_preview"
URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF"


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=URL, help="NASA source GeoTIFF URL or local copy")
    args = parser.parse_args()
    manifest_path = DIRECTORY / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bounds = manifest["products"]["horizon_dem"]["projected_bounds_m"]
    output = DIRECTORY / "south_pole_psr_20m.tif"
    temporary = output.with_suffix(".tmp.tif")
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="60"):
        with rasterio.open(args.source) as source:
            crs = CRS.from_user_input(source.crs)
            operation = {p.name: p.value for p in crs.coordinate_operation.params}
            if (source.res != (20, 20) or not crs.is_projected
                    or crs.ellipsoid.semi_major_metre != 1737400
                    or crs.ellipsoid.semi_minor_metre != 1737400
                    or operation.get("Latitude of natural origin", operation.get("Latitude of standard parallel")) != -90
                    or operation.get("Longitude of natural origin", operation.get("Longitude of origin")) != 0):
                raise ValueError("Unexpected NASA PSR grid")
            crop = from_bounds(*bounds, source.transform).round_offsets().round_lengths()
            with rasterio.open(
                temporary, "w", driver="GTiff", width=int(crop.width), height=int(crop.height),
                count=1, dtype="uint8", nodata=255, crs=source.crs,
                transform=source.window_transform(crop), tiled=True, compress="deflate",
                blockxsize=512, blockysize=512,
            ) as target:
                for _, block in target.block_windows(1):
                    window = Window(crop.col_off + block.col_off, crop.row_off + block.row_off,
                                    block.width, block.height)
                    pixels = source.read(1, window=window, masked=True)
                    if not np.isin(pixels.compressed(), [0, 1]).all():
                        raise ValueError("Unexpected NASA PSR mask values")
                    target.write(pixels.filled(255).astype("uint8"), 1, window=block)
    temporary.replace(output)
    manifest["products"]["ice"] = {
        "name": "NASA LOLA adjusted south-pole permanent shadow mask",
        "path": output.name,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "source_url": URL,
        "documentation": "https://pgda.gsfc.nasa.gov/products/90",
        "product_id": "LPSR_80S_20MPP_ADJ",
        "units": "fraction",
        "frame": "MOON_ME_DE421",
        "resolution_m": 20,
        "projected_bounds_m": bounds,
        "interpretation": "psr_fraction",
        "sampling": "neighbourhood_fraction",
        "quality": "Native binary permanent-shadow mask. No ice concentration or detection is inferred.",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"{output.name}: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
