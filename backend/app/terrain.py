"""Optional, local LOLA GeoTIFF. No invented elevations or zero-filled gaps."""
import hashlib
import json
import os
from pathlib import Path
from functools import lru_cache
import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer

RADIUS = 1737400.0
GEO = CRS.from_proj4(f'+proj=longlat +R={RADIUS} +no_defs')
GEOD = Geod(a=RADIUS, b=RADIUS)

def unavailable(reason):
    return {'available': False, 'reason': reason, 'elevation_m': None, 'slope_deg': None, 'horizon': None, 'grid': [], 'source': None}

@lru_cache(maxsize=4)
def verify(path, mtime, expected):
    with open(path, 'rb') as f:
        digest = hashlib.file_digest(f, 'sha256').hexdigest()
    if digest != expected:
        raise ValueError('Terrain SHA-256 does not match its provenance manifest.')

def terrain(location):
    manifest_path = os.getenv('LOLA_MANIFEST')
    if not manifest_path:
        return unavailable('No LOLA raster configured. Geometry uses a reference sphere; terrain obstruction is unknown.')
    try:
        manifest = json.loads(Path(manifest_path).read_text())
        if manifest['units'] != 'm' or manifest['vertical_reference'] != 'radius_minus_1737400m' or not manifest['source_url'].startswith('https://'):
            raise ValueError('Manifest must declare metre elevations relative to 1737400 m and an HTTPS source URL.')
        path = Path(manifest['path'])
        if not path.is_absolute():
            path = Path(manifest_path).parent/path
        verify(str(path), path.stat().st_mtime_ns, manifest['sha256'])
        with rasterio.open(path) as ds:
            if not ds.crs:
                raise ValueError('Raster CRS is missing.')
            crs = CRS(ds.crs)
            if abs(crs.ellipsoid.semi_major_metre - RADIUS) > 1 or abs(crs.ellipsoid.semi_minor_metre - RADIUS) > 1:
                raise ValueError('Expected spherical lunar CRS, radius 1737400 m; Earth rasters are rejected.')
            transform = Transformer.from_crs(GEO, crs, always_xy=True)
            def sample(lon, lat):
                x, y = transform.transform(float(lon), float(lat))
                row, col = ds.index(x, y)
                if row < 0 or col < 0 or row >= ds.height or col >= ds.width:
                    return None
                z = next(ds.sample([(x, y)], masked=True))[0]
                return None if np.ma.is_masked(z) or not np.isfinite(z) else float(z) * ds.scales[0] + ds.offsets[0]
            lon, lat = location.longitude, location.latitude
            z = sample(lon, lat)
            if z is None:
                return unavailable('Selected location is outside valid DEM coverage.')
            # Estimate physical pixel size at the site for ray stepping and central differences.
            inv = Transformer.from_crs(crs, GEO, always_xy=True)
            x, y = transform.transform(lon, lat)
            a = inv.transform(x + ds.res[0], y)
            b = inv.transform(x, y + ds.res[1])
            resolution = max(abs(GEOD.inv(lon, lat, *a)[2]), abs(GEOD.inv(lon, lat, *b)[2]))
            if not 1 <= resolution <= 2000:
                raise ValueError('DEM pixel spacing must be between 1 m and 2 km for this local algorithm.')
            step = max(50, resolution)
            adjacent = []
            for az in [0, 90, 180, 270]:
                lo, la, _ = GEOD.fwd(lon, lat, az, step)
                adjacent.append(sample(lo, la))
            slope = None if None in adjacent else float(np.degrees(np.arctan(np.hypot((adjacent[0]-adjacent[2])/(2*step), (adjacent[1]-adjacent[3])/(2*step)))))
            horizon = []
            coverage = True
            for az in range(0, 360, 5):
                angles = []
                for distance in np.arange(step, 20000+step, step):
                    lo, la, _ = GEOD.fwd(lon, lat, az, distance)
                    height = sample(lo, la)
                    if height is None:
                        coverage = False
                        break
                    # Exact spherical geometry of a radial DEM point relative to observer.
                    angle = distance/RADIUS
                    vertical = (RADIUS+height)*np.cos(angle) - (RADIUS+z)
                    horizontal = (RADIUS+height)*np.sin(angle)
                    angles.append(float(np.degrees(np.arctan2(vertical, horizontal))))
                horizon.append({'azimuth': az, 'elevation': max(angles) if angles and height is not None else None})
            grid = []
            for north in np.linspace(-5000, 5000, 21):
                for east in np.linspace(-5000, 5000, 21):
                    lo, la, _ = GEOD.fwd(lon, lat, np.degrees(np.arctan2(east, north)), np.hypot(east,north))
                    grid.append({'east_m': float(east), 'north_m': float(north), 'elevation_m': sample(lo, la)})
            return {'available': coverage, 'reason': None if coverage else 'DEM does not cover every horizon ray to 20 km. Obstruction metrics unavailable.', 'elevation_m': z, 'slope_deg': slope, 'horizon': horizon if coverage else None, 'grid': grid, 'source': manifest, 'resolution_m': resolution, 'ray_step_m': step, 'azimuth_step_deg': 5, 'radius_m': 20000, 'method': 'Nearest-neighbor sampling, spherical curvature, 20 km radius. Beyond-range terrain and subpixel hazards excluded.'}
    except (OSError, ValueError, KeyError, rasterio.errors.RasterioError) as exc:
        return unavailable(f'Terrain configuration error: {exc}')
