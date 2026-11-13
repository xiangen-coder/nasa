"""Coordinate queries for documented lunar water and ice evidence."""

import json
from functools import lru_cache

import numpy as np
import rasterio
from fastapi import APIRouter, HTTPException, Query, Response
from pyproj import Transformer
from rasterio.io import MemoryFile
from rasterio.windows import Window

from . import lunar_rasters as rasters
from .large_raster import product_path
from .terrain import GEO, RADIUS, verify

router = APIRouter(prefix="/api/research", tags=["Water and ice evidence"])
DATA = rasters.ROOT / "data/lunar_preview"
POLAR_LAYERS = ("shadow", "illumination")
TEMPERATURE_LAYERS = ("temperature_min", "temperature_max")
SOURCES = {
    "shadow": "https://pgda.gsfc.nasa.gov/products/69",
    "illumination": "https://pgda.gsfc.nasa.gov/products/69",
    "temperature_min": "https://www.diviner.ucla.edu/data",
    "temperature_max": "https://www.diviner.ucla.edu/data",
    "surface_ice": "https://doi.org/10.1073/pnas.1802345115",
    "hydrogen": "https://pds-geosciences.wustl.edu/missions/lro/lend.htm",
}


@lru_cache(maxsize=1)
def polar_catalog():
    try:
        return json.loads((DATA / "water_evidence.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def open_layer(layer, latitude, *, wide=False):
    hemisphere = "north" if latitude >= 0 else "south"
    key = f"{layer}_{hemisphere}"
    catalog = polar_catalog()
    product = catalog.get(f"{key}_wide") if layer == "shadow" and (wide or 65 <= abs(latitude) < 85) else None
    product = product or catalog.get(key)
    if product:
        path = product_path(DATA, product)
        verify(str(path), path.stat().st_mtime_ns, product["sha256"])
        return rasterio.open(path), product
    if layer in TEMPERATURE_LAYERS and hemisphere == "south":
        return rasters.opened(layer)
    return None, None


def read_window(dataset, product, window):
    samples = dataset.read(1, window=window, boundless=True, masked=True)
    values = samples.astype("float64").filled(np.nan) * dataset.scales[0] + dataset.offsets[0]
    if product["units"] == "K":
        values[(values <= 0) | (values > 500)] = np.nan
    elif product.get("layer") == "shadow":
        values[~np.isin(values, (0, 1))] = np.nan
    else:
        values[(values < 0) | (values > 1)] = np.nan
    return values


def sample_layer(layer, latitude, longitude, radius_m):
    result = {"status": "unavailable", "value": None, "source_url": SOURCES[layer]}
    try:
        dataset, product = open_layer(layer, latitude)
        if dataset is None:
            return result
        with dataset:
            x, y = Transformer.from_crs(GEO, dataset.crs, always_xy=True).transform(longitude, latitude)
            row, col = dataset.index(x, y)
            inside = 0 <= row < dataset.height and 0 <= col < dataset.width
            result.update(source=product, units=product["units"], sampling="native pixel at the selected coordinate")
            if inside:
                value = read_window(dataset, product, Window(col, row, 1, 1))[0, 0]
                result.update(status="no_data")
                if np.isfinite(value):
                    result.update(status="available", value=float(value))
            else:
                result.update(status="outside_coverage")
            if radius_m is not None:
                result["footprint"] = footprint(dataset, product, x, y, radius_m)
        return result
    except (OSError, ValueError, KeyError, rasterio.errors.RasterioError):
        return {**result, "status": "error"}


def footprint(dataset, product, x, y, radius_m):
    row, col = dataset.index(x, y)
    # Stereographic projection has local scale 1 + r²/(4R²).
    scale = 1 + (x*x + y*y) / (4 * RADIUS**2)
    radius = radius_m * scale
    extent = int(np.ceil(radius / min(dataset.res))) + 1
    if extent > 512:
        return {"coverage_fraction": 0, "mean": None, "minimum": None, "maximum": None}
    cx, cy = dataset.xy(row, col)
    offsets = np.arange(-extent, extent + 1)
    xs = cx + offsets[None, :] * dataset.res[0]
    ys = cy - offsets[:, None] * dataset.res[1]
    included = (xs - x)**2 + (ys - y)**2 <= radius**2
    values = read_window(dataset, product, Window(col-extent, row-extent, 2*extent+1, 2*extent+1))
    valid = included & np.isfinite(values)
    weights = (1 + (xs**2 + ys**2) / (4 * RADIUS**2))**-2
    if not valid.any():
        return {"coverage_fraction": 0, "mean": None, "minimum": None, "maximum": None}
    return {
        "coverage_fraction": float(weights[valid].sum() / weights[included].sum()),
        "mean": float(np.average(values[valid], weights=weights[valid])),
        "minimum": float(values[valid].min()),
        "maximum": float(values[valid].max()),
    }


def research_shadow(latitude, longitude, radius_m, candidates=()):
    """Measure a geodesic circle and distances to shadow pixels inside it."""
    empty = {"coverage_fraction": 0, "shadow_fraction": None, "distances_m": [None] * len(candidates)}
    if abs(latitude) < 64:
        return empty
    try:
        dataset, product = open_layer("shadow", latitude)
        if dataset is None:
            return empty
        with dataset:
            forward = Transformer.from_crs(GEO, dataset.crs, always_xy=True)
            inverse = Transformer.from_crs(dataset.crs, GEO, always_xy=True)
            x, y = forward.transform(longitude, latitude)
            row, col = dataset.index(x, y)
            scale = 1 + (x*x + y*y) / (4 * RADIUS**2)
            extent = int(np.ceil(radius_m * scale * 1.02 / min(dataset.res))) + 2
            window = Window(col-extent, row-extent, 2*extent+1, 2*extent+1)
            values = read_window(dataset, product, window)
            cx, cy = dataset.xy(row, col)
            offsets = np.arange(-extent, extent+1)
            xs, ys = np.meshgrid(cx + offsets*dataset.res[0], cy - offsets*dataset.res[1])
            lon, lat = inverse.transform(xs, ys)
            delta_lat = np.radians(lat-latitude)
            delta_lon = np.radians(lon-longitude)
            hav = np.sin(delta_lat/2)**2 + np.cos(np.radians(latitude))*np.cos(np.radians(lat))*np.sin(delta_lon/2)**2
            included = hav <= np.sin(radius_m/(2*RADIUS))**2
            in_coverage = included & (np.abs(lat) >= 65)
            missing = in_coverage & ~np.isfinite(values)
            if missing.any() and min(dataset.res) < 240:
                wider, wider_product = open_layer("shadow", latitude, wide=True)
                if wider is not None:
                    with wider:
                        if min(wider.res) > min(dataset.res):
                            transform = Transformer.from_crs(GEO, wider.crs, always_xy=True)
                            wx, wy = transform.transform(lon[missing], lat[missing])
                            cols, rows = (~wider.transform) * (wx, wy)
                            rows, cols = np.floor(rows).astype(int), np.floor(cols).astype(int)
                            top, left = rows.min(), cols.min()
                            coarse = read_window(wider, wider_product, Window(
                                left, top, cols.max()-left+1, rows.max()-top+1,
                            ))
                            values[missing] = coarse[rows-top, cols-left]
            valid = in_coverage & np.isfinite(values)
            if not valid.any():
                return empty
            weights = (1 + (xs**2 + ys**2)/(4*RADIUS**2))**-2
            shaded = valid & (values == 1)
            distances = []
            slon, slat = lon[shaded], lat[shaded]
            for candidate in candidates:
                if not slon.size:
                    distances.append(None)
                    continue
                _, _, distances_to_pixels = rasters.GEOD.inv(
                    np.full_like(slon, candidate.longitude), np.full_like(slat, candidate.latitude), slon, slat,
                )
                distances.append(float(np.min(distances_to_pixels)))
            return {
                "coverage_fraction": float(weights[valid].sum()/weights[included].sum()),
                "shadow_fraction": float(weights[shaded].sum()/weights[valid].sum()),
                "distances_m": distances,
            }
    except (OSError, ValueError, KeyError, rasterio.errors.RasterioError):
        return empty


@router.get("/research-area-shadow")
def research_area_shadow(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_m: int = Query(ge=250, le=20000),
):
    result = research_shadow(latitude, longitude, radius_m)
    return {key: value for key, value in result.items() if key != "distances_m"}


@router.get("/water-evidence")
def water_evidence(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-360, le=360),
    radius_m: int | None = Query(default=None, ge=120, le=5000),
):
    normalized = 0 if abs(latitude) == 90 else (longitude + 180) % 360 - 180
    return {
        "location": {"latitude": latitude, "longitude": longitude, "normalized_longitude": normalized},
        "radius_m": radius_m,
        "layers": {layer: sample_layer(layer, latitude, normalized, radius_m) for layer in SOURCES},
    }


@router.get("/water-evidence/map/{layer}")
def evidence_map(layer: str, latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)):
    if layer not in (*POLAR_LAYERS, *TEMPERATURE_LAYERS):
        raise HTTPException(404, "Unknown water evidence layer.")
    try:
        dataset, product = open_layer(layer, latitude)
        if dataset is None:
            raise HTTPException(404, "Layer unavailable at this point.")
        with dataset:
            x, y = Transformer.from_crs(GEO, dataset.crs, always_xy=True).transform(
                0 if abs(latitude) == 90 else longitude, latitude)
            row, col = dataset.index(x, y)
            if not (0 <= row < dataset.height and 0 <= col < dataset.width):
                raise HTTPException(404, "Point is outside layer coverage.")
            size = 129
            values = read_window(dataset, product, Window(col-size//2, row-size//2, size, size))
            valid = np.isfinite(values)
            if product["units"] == "K":
                values = values / 400
            level = (np.clip(np.nan_to_num(values), 0, 1) * 255).astype("uint8")
            if layer == "shadow":
                level = 255 - level
            with MemoryFile() as memory:
                with memory.open(driver="PNG", width=size, height=size, count=2, dtype="uint8") as image:
                    image.write(level, 1)
                    image.write(valid.astype("uint8") * 255, 2)
                return Response(memory.read(), media_type="image/png")
    except (OSError, ValueError, KeyError, rasterio.errors.RasterioError) as exc:
        raise HTTPException(503, "The water evidence map could not be read.") from exc
