"""Validate NASA polar rasters and package native pixels for the evidence API."""

import argparse
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.client import IncompleteRead
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
import rasterio
from pyproj import CRS

ROOT = Path(__file__).resolve().parents[1]
CATALOG = "https://pgda.gsfc.nasa.gov/products/69"
RASTERS = "https://pgda.gsfc.nasa.gov/data/MoonIllumination"
LABELS = "https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG"
BOUNDS = (-151740, -151740, 151740, 151740)
LOCK = Path(__file__).with_name("water_evidence_sources.json")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(url, path, checksum, size=None):
    def download(span):
        start, end = span
        request = Request(url, headers={"Range": f"bytes={start}-{end}"} if size else {})
        for attempt in range(3):
            try:
                with urlopen(request, timeout=35) as response:
                    if size and (response.status != 206 or response.headers.get("Content-Range") !=
                                 f"bytes {start}-{end}/{size}"):
                        raise ValueError("Unexpected NASA response range")
                    expected = end - start + 1 if size else None
                    data = response.read(expected + 1 if expected is not None else 8193)
                    if expected is not None and len(data) != expected:
                        raise ValueError("Incomplete NASA response range")
                    return data
            except (OSError, ValueError, IncompleteRead) as exc:
                if attempt == 2:
                    raise RuntimeError(f"Could not download {url}") from exc

    temporary = path.with_suffix(".download")
    with temporary.open("wb") as stream:
        if size:
            chunk_size = 2 * 1024 * 1024
            spans = [(start, min(start + chunk_size, size) - 1) for start in range(0, size, chunk_size)]
            with ThreadPoolExecutor(max_workers=12) as workers:
                for chunk in workers.map(download, spans):
                    stream.write(chunk)
        else:
            stream.write(download((0, 0)))
    if digest(temporary) != checksum:
        raise ValueError(f"{url}: download does not match the locked SHA-256")
    temporary.replace(path)


def label_value(label, name):
    match = re.search(rf"^\s*{name}\s*=\s*([^\r\n]+)", label, re.MULTILINE)
    if not match:
        raise ValueError(f"Missing PDS label field {name}")
    return match[1].split("<")[0].strip().strip('"')


def package(source, label_path, output, layer, pole, product_id, source_url, label_url):
    label = label_path.read_text(encoding="ascii")
    scale = float(label_value(label, "SCALING_FACTOR"))
    offset = float(label_value(label, "OFFSET"))
    is_shadow = layer == "shadow"
    expected = (0.000025, 0.5) if is_shadow else (0.00004, 0)
    if ((scale, offset) != expected or label_value(label, "PRODUCT_ID") != product_id
            or label_value(label, "COORDINATE_SYSTEM_NAME") != "MEAN EARTH/POLAR AXIS OF DE421"
            or label_value(label, "KEYWORD_LATITUDE_TYPE") != "PLANETOCENTRIC"
            or label_value(label, "POSITIVE_LONGITUDE_DIRECTION") != "EAST"
            or int(label_value(label, "CENTER_LATITUDE")) != pole):
        raise ValueError(f"{product_id}: unexpected label")
    with source.open("rb") as stream:
        if stream.read(4) not in (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+"):
            raise ValueError(f"{source}: invalid TIFF signature")
    temporary = output.with_suffix(".tmp.tif")
    with rasterio.open(source) as src:
        crs = CRS(src.crs)
        operation = {p.name: p.value for p in crs.coordinate_operation.params}
        origin = operation.get("Latitude of natural origin", operation.get("Latitude of standard parallel"))
        meridian = operation.get("Longitude of natural origin", operation.get("Longitude of origin"))
        if (tuple(src.bounds) != BOUNDS or src.shape != (5058, 5058) or src.res != (60, 60)
                or src.count != 1 or src.dtypes != ("int16",) or src.nodata != -32768
                or (src.scales[0], src.offsets[0]) != expected or not crs.is_projected
                or crs.ellipsoid.semi_major_metre != 1737400
                or crs.ellipsoid.semi_minor_metre != 1737400 or origin != pole or meridian != 0):
            raise ValueError(f"{source}: unexpected TIFF grid or encoding")
        profile = dict(driver="GTiff", width=src.width, height=src.height, count=1, crs=src.crs,
                       transform=src.transform, tiled=True, blockxsize=256, blockysize=256,
                       compress="deflate", predictor=2, dtype="uint8" if is_shadow else "int16",
                       nodata=255 if is_shadow else -32768)
        valid_count = 0
        undocumented_count = 0
        with rasterio.open(temporary, "w", **profile) as target:
            target.scales = (1 if is_shadow else scale,)
            target.offsets = (0 if is_shadow else offset,)
            for _, window in target.block_windows(1):
                data = src.read(1, window=window, masked=True)
                valid = data.compressed()
                if is_shadow:
                    if not np.isin(valid, (-20000, 0, 20000)).all():
                        raise ValueError(f"{source}: unexpected shadow class")
                    # The converted TIFF contains a few DN=0 pixels outside the label's two classes.
                    undocumented_count += int(np.count_nonzero(valid == 0))
                    missing = np.ma.getmaskarray(data) | (data.data == 0)
                    pixels = np.where(missing, 255, data.data == 20000).astype("uint8")
                else:
                    if ((valid < 0) | (valid > 25000)).any():
                        raise ValueError(f"{source}: illumination outside documented range")
                    pixels = data.filled(-32768)
                target.write(pixels, 1, window=window)
                valid_count += valid.size
        valid_count -= undocumented_count
        if not valid_count:
            raise ValueError(f"{source}: no valid pixels")
    temporary.replace(output)
    return {
        "path": output.name, "layer": layer, "product_id": product_id,
        "name": "NASA LOLA permanent shadow" if is_shadow else "NASA LOLA long-term solar illumination",
        "version": label_value(label, "PRODUCT_VERSION_ID"), "source_url": source_url,
        "label_url": label_url, "documentation": CATALOG, "sha256": digest(output),
        "source_sha256": digest(source), "label_sha256": digest(label_path),
        "retrieved_at": datetime.fromtimestamp(source.stat().st_mtime, timezone.utc).date().isoformat(),
        "frame": "MOON_ME_DE421", "reference_radius_m": 1737400, "projection": "Polar stereographic",
        "pole_latitude": pole, "projected_bounds_m": BOUNDS, "resolution_m": 60,
        "units": "fraction", "nodata": profile["nodata"],
        "scale": 1 if is_shadow else scale, "offset": 0 if is_shadow else offset,
        "effective_resolution_m": None, "quality_flags": None,
        "valid_pixel_count": valid_count,
        "undocumented_pixels_masked": undocumented_count,
        "quality": ("Permanent-shadow classification modeled from LOLA topography." if is_shadow else
                    "Fraction of modeled time steps with any solar disc visible over an approximately 18.6-year cycle."),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / "work/polar-water-source")
    parser.add_argument("--output", type=Path, default=ROOT / "data/lunar_preview")
    parser.add_argument("--download", action="store_true", help="Fetch missing NASA sources and PDS labels")
    parser.add_argument("--shadow-only", action="store_true", help="Package only the permanent shadow products")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    products = {}
    source_lock = json.loads(LOCK.read_text(encoding="utf-8"))
    layers = [("shadow", "LPSR")]
    if not args.shadow_only:
        layers.append(("illumination", "AVGVISIB"))
    for hemisphere, letter, pole in (("south", "S", -90), ("north", "N", 90)):
        for layer, prefix in layers:
            product_id = f"{prefix}_85{letter}_060M_201608"
            source_url = f"{RASTERS}/{product_id}.TIF"
            label_url = f"{LABELS}/{product_id}.LBL"
            source = args.source_dir / f"{product_id}.TIF"
            completed = args.source_dir / f"{product_id}.full.TIF"
            if completed.exists():
                source = completed
            label = args.source_dir / f"{product_id}.LBL"
            locked = source_lock[product_id]
            if args.download:
                for url, path, checksum, size in (
                    (source_url, source, locked["source_sha256"], locked["bytes"]),
                    (label_url, label, locked["label_sha256"], None),
                ):
                    if not path.is_file() or digest(path) != checksum:
                        fetch(url, path, checksum, size)
            if digest(source) != locked["source_sha256"] or digest(label) != locked["label_sha256"]:
                raise ValueError(f"{product_id}: source data or label does not match the locked SHA-256")
            key = f"{layer}_{hemisphere}"
            output = args.output / f"water_{key}.tif"
            products[key] = package(source, label, output, layer, pole, product_id, source_url, label_url)
            print(f"{key}: {output.stat().st_size:,} bytes")
    manifest = args.output / "water_evidence.json"
    temporary = manifest.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(products, indent=2) + "\n", encoding="utf-8")
    temporary.replace(manifest)


if __name__ == "__main__":
    main()
