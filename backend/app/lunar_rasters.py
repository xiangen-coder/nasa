"""Verified local raster measurements and windowed NASA horizon screening."""
import json
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from functools import lru_cache
from io import BufferedIOBase, SEEK_CUR, SEEK_END, SEEK_SET
from threading import BoundedSemaphore
from time import monotonic
import httpx
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import CRS, Transformer
from .science import ROOT
from .terrain import GEO, GEOD, RADIUS, verify

SOURCES={'lola':'https://pgda.gsfc.nasa.gov/products/78',
 'temperature_min':'https://www.diviner.ucla.edu/data','temperature_max':'https://www.diviner.ucla.edu/data',
 'hazards':'https://pds.lroc.im-ldi.com/data/', 'ice':'https://pds-geosciences.wustl.edu/missions/lro/lend.htm'}

for _kind in ['height_uncertainty','slope_uncertainty','sample_count']:
    SOURCES[_kind]='https://pgda.gsfc.nasa.gov/products/78'
SOURCES['horizon_dem']='https://pgda.gsfc.nasa.gov/products/90'
SOURCES['global_dem']='https://ode.rsl.wustl.edu/mercury/pagehelp/Content/Missions_Instruments/Lunar%20Reconnaissance%20Orbiter%20%28LRO%29/LOLA/GDR/GDRDEM.htm'
SOURCES['temperature_min_global'] = SOURCES['temperature_min']
SOURCES['temperature_max_global'] = SOURCES['temperature_max']
ELEVATION_PRODUCTS = ('lola', 'horizon_dem', 'global_dem')
RASTER_ERRORS = (OSError, ValueError, KeyError, rasterio.errors.RasterioError)
POLAR_HORIZON_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF'
POLAR_SHADOW_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF'
SOUTH_REGIONAL_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF'
HORIZON_RANGE_M = 20_000
# A site this close to the source's 80° S boundary cannot fit a complete window.
POLAR_HORIZON_LIMIT = -80 - np.degrees(HORIZON_RANGE_M / RADIUS)
_polar_horizon_slots = BoundedSemaphore(2)


class _ElevationRangeReader(BufferedIOBase):
    """Seekable view of the public COG that refuses full or mismatched responses."""

    def __init__(self, client, url, size, chunk_size=1_048_576):
        self.client = client
        self.url = url
        self.size = size
        self.chunk_size = chunk_size
        self.position = 0
        self.deadline = monotonic() + 45
        self.chunk = lru_cache(maxsize=48)(self._fetch_chunk)

    def tell(self):
        return self.position

    def seekable(self):
        return True

    def readable(self):
        return True

    def seek(self, offset, whence=SEEK_SET):
        # Rasterio's Windows opener stores stat size in a signed C long.
        # TIFF block offsets still use the original byte positions.
        stat_size = min(self.size, 2**31 - 1) if os.name == 'nt' else self.size
        self.position = {SEEK_SET: 0, SEEK_CUR: self.position, SEEK_END: stat_size}[whence] + offset
        return self.position

    def _fetch_chunk(self, start):
        end = min(start + self.chunk_size, self.size) - 1
        remaining = self.deadline - monotonic()
        if remaining <= 0:
            raise OSError('NASA elevation window timed out.')
        try:
            # A distinct URL per byte range prevents shared caches returning another range.
            with self.client.stream('GET', self.url, params={'block': start},
                                    headers={'Range': f'bytes={start}-{end}'},
                                    timeout=min(remaining, 8)) as response:
                if (response.status_code != 206
                        or response.headers.get('Content-Range') != f'bytes {start}-{end}/{self.size}'
                        or response.headers.get('Content-Length') != str(end - start + 1)):
                    raise OSError('NASA returned an unexpected elevation byte range.')
                data = response.read()
        except httpx.HTTPError as exc:
            raise OSError('NASA elevation download failed.') from exc
        if len(data) != end - start + 1:
            raise OSError('NASA returned an incomplete elevation byte range.')
        return data

    def read(self, size=-1):
        if size < 0 or size > 16 * self.chunk_size:
            return b''
        stop = min(self.position + size, self.size)
        blocks = []
        while self.position < stop:
            start = self.position // self.chunk_size * self.chunk_size
            offset = self.position - start
            try:
                data = self.chunk(start)[offset:offset + stop - self.position]
            except OSError:
                # A short read signals failure safely across Rasterio's native callback.
                break
            blocks.append(data)
            self.position += len(data)
        return b''.join(blocks)

    def close(self):
        self.chunk.cache_clear()

    def open(self, path, mode='rb'):
        self.seek(0)
        return self

    def prefetch(self, dataset, block_ids, blocks_per_row):
        chunks = set()
        for block_id in block_ids:
            row, col = divmod(int(block_id), blocks_per_row)
            offset = dataset.get_tag_item(f'BLOCK_OFFSET_{col}_{row}', 'TIFF', bidx=1)
            size = dataset.get_tag_item(f'BLOCK_SIZE_{col}_{row}', 'TIFF', bidx=1)
            if offset and size:
                first = int(offset) // self.chunk_size
                last = (int(offset) + int(size) - 1) // self.chunk_size
                chunks.update(i * self.chunk_size for i in range(first, last + 1))
        with ThreadPoolExecutor(max_workers=6) as pool:
            for _ in pool.map(self.chunk, sorted(chunks)):
                pass


@contextmanager
def _remote_polar_raster(url, size, chunk_size=1_048_576, *, resolution=20):
    if not _polar_horizon_slots.acquire(timeout=1):
        raise ValueError('NASA raster requests are busy. Try again shortly.')
    try:
        with httpx.Client() as client:
            reader = _ElevationRangeReader(client, url, size, chunk_size)
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'), rasterio.open(
                    'lola-polar.tif', opener=reader.open) as ds:
                crs = CRS(ds.crs)
                if (crs.to_json_dict().get('id') != {'authority': 'IAU', 'code': 30135}
                        or abs(crs.ellipsoid.semi_major_metre - RADIUS) > 1
                        or abs(crs.ellipsoid.semi_minor_metre - RADIUS) > 1
                        or ds.res != (resolution, resolution) or ds.count != 1):
                    raise ValueError('Unexpected NASA polar raster projection or spacing.')
                yield ds, reader
    finally:
        _polar_horizon_slots.release()


def _remote_polar_enabled(location):
    return os.getenv('LUNAR_REMOTE_HORIZON') == '1' and location.latitude <= -80


POLAR_ELEVATION_SOURCE = {
    'name': 'NASA adjusted LOLA south-pole 20 m DEM',
    'source_url': POLAR_HORIZON_URL, 'documentation': SOURCES['horizon_dem'],
    'resolution_m': 20, 'units': 'm', 'frame': 'MOON_ME_DE421',
    'reference': 'radius_minus_1737400m',
}
POLAR_SHADOW_SOURCE = {
    'name': 'NASA adjusted LOLA south-pole 20 m permanent-shadow mask',
    'source_url': POLAR_SHADOW_URL, 'documentation': SOURCES['horizon_dem'],
    'resolution_m': 20, 'units': 'fraction', 'frame': 'MOON_ME_DE421',
    'interpretation': 'psr_fraction',
}
SOUTH_REGIONAL_SOURCE = {
    **POLAR_ELEVATION_SOURCE, 'name': 'NASA adjusted LOLA south-region 240 m DEM',
    'source_url': SOUTH_REGIONAL_URL, 'resolution_m': 240,
}

def registry():
    preview=ROOT/'data/lunar_preview/manifest.json'
    default=ROOT/'data/lunar/manifest.json'
    override=os.getenv('LUNAR_DATA_MANIFEST')
    path=Path(override) if override else default if default.exists() else preview
    try:
        manifest=json.loads(path.read_text())
    except (OSError,ValueError):
        return path.parent,{},{}
    products=manifest.get('products',{})
    if not override and path == default:
        try:
            bundled = json.loads(preview.read_text())['products']
            for kind in ('ice', 'global_dem', 'temperature_min', 'temperature_max',
                         'temperature_min_global', 'temperature_max_global'):
                product = bundled.get(kind)
                local = products.get(kind)
                same_temperature_source = (
                    kind.startswith('temperature') and local and product
                    and product.get('source_sha256')
                    and product['source_sha256'] == local.get('source_sha256')
                    and (preview.parent / product['path']).is_file()
                )
                if product and (local is None or same_temperature_source):
                    products[kind] = {**product, 'path': (Path('..') / 'lunar_preview' / product['path']).as_posix()}
        except (OSError,ValueError,KeyError):
            pass
    return path.parent,products,manifest.get('missing',{})

def status():
    root,products,missing=registry()
    return [{'kind':k,'name':products.get(k,{}).get('name',k),'status':'configured' if k in products and ((root/products[k]['path']).is_file() or bool(products[k].get('parts')) and all((root/p['path']).is_file() for p in products[k]['parts'])) else 'unavailable',
             'source_url':products.get(k,{}).get('source_url',v),'resolution_m':products.get(k,{}).get('resolution_m'),
             'observation_period':products.get(k,{}).get('observation_period'),'quality':products.get(k,{}).get('quality'),
             'reason':missing.get(k,'Run the offline preparation command or register a validated regional product.' if k not in products else None)} for k,v in SOURCES.items()]

def opened(kind):
    root,products,_=registry()
    if kind not in products: raise ValueError(f'{kind} product is not configured.')
    meta=products[kind]
    from .large_raster import product_path
    path=product_path(root,meta)
    verify(str(path),path.stat().st_mtime_ns,meta['sha256'])
    ds=rasterio.open(path)
    crs=CRS(ds.crs) if ds.crs else None
    expected='K' if kind.startswith('temperature') else 'm' if kind in ELEVATION_PRODUCTS else 'fraction'
    if not crs or abs(crs.ellipsoid.semi_major_metre-RADIUS)>1 or abs(crs.ellipsoid.semi_minor_metre-RADIUS)>1 or meta.get('units')!=expected:
        ds.close();raise ValueError('Product requires a spherical lunar CRS and declared physical units.')
    if kind in ELEVATION_PRODUCTS and (meta.get('reference')!='radius_minus_1737400m' or meta.get('frame')!='MOON_ME_DE421'):
        ds.close();raise ValueError('LOLA vertical datum / mean-Earth frame not confirmed.')
    return ds,meta

def pixel(ds,lon,lat):
    x,y=Transformer.from_crs(GEO,ds.crs,always_xy=True).transform(lon,lat)
    if not np.isfinite((x, y)).all(): raise ValueError('Outside product coverage.')
    row,col=ds.index(x,y)
    if not (0<=row<ds.height and 0<=col<ds.width): raise ValueError('Outside product coverage.')
    z=ds.read(1,window=Window(col,row,1,1),masked=True)[0,0]
    if np.ma.is_masked(z) or not np.isfinite(z): raise ValueError('No valid measurement at this location.')
    return float(z)*ds.scales[0]+ds.offsets[0]

def measurement(kind,location):
    try:
        ds,meta=opened(kind)
        with ds:
            longitude, latitude = location.longitude, location.latitude
            if kind == 'global_dem' or kind.endswith('_global'):
                # The seam wraps and each pole is at the outer edge of its last row.
                longitude = (longitude + 180) % 360 - 180
                half_pixel = ds.res[1] / 2
                latitude = min(90 - half_pixel, max(-90 + half_pixel, latitude))
            value = pixel(ds, longitude, latitude)
        if (kind.startswith('temperature') and not 0<value<=500) or (kind in ('hazards','ice') and not 0<=value<=1):
            raise ValueError('Measurement is nodata or outside documented units/range.')
        if kind=='ice' and meta.get('interpretation') not in ('mapped_ice_evidence','psr_fraction'):
            raise ValueError('Ice product must identify mapped evidence or a PSR proxy.')
        if kind=='hazards' and meta.get('method') not in ('manual','automatic','published'):
            raise ValueError('Hazard product must identify manual, automatic or published assessment.')
        return {'available':True,'value':value,'source':meta,'kind':'derived raster measurement'}
    except (OSError,ValueError,KeyError,rasterio.errors.RasterioError) as exc:
        return {'available':False,'value':None,'reason':str(exc),'source_url':SOURCES[kind]}


def temperature_range(location):
    for suffix in ('', '_global'):
        minimum = measurement('temperature_min' + suffix, location)
        maximum = measurement('temperature_max' + suffix, location)
        result = {'available': False, 'minimum': minimum, 'maximum': maximum}
        if (minimum['available'] and maximum['available'] and minimum['value'] <= maximum['value']
                and minimum['source'].get('observation_period') == maximum['source'].get('observation_period')):
            return {**result, 'available': True, 'minimum_k': minimum['value'],
                    'maximum_k': maximum['value'], 'source': minimum['source']}
    return result


def site_elevation(location, terrain):
    if terrain['available']:
        return {'available': True, 'value': terrain['elevation_m'], 'source': terrain['source']}
    for kind in ELEVATION_PRODUCTS:
        reading = measurement(kind, location)
        if reading['available']:
            return {**reading, 'coverage_type': 'global' if kind == 'global_dem' else 'regional'}
    return reading

def ice_evidence(location, radius_m):
    """Use a complete native PSR window for the fraction of mapped shadow."""
    _, products, _ = registry()
    if products.get('ice', {}).get('sampling') != 'neighbourhood_fraction':
        return measurement('ice', location)
    try:
        ds, meta = opened('ice')
        with ds:
            return _ice_window(ds, meta, location, radius_m)
    except RASTER_ERRORS as exc:
        reason = str(exc)
    if _remote_polar_enabled(location):
        try:
            return _polar_ice(location.latitude, location.longitude, radius_m)
        except RASTER_ERRORS:
            reason = 'NASA permanent-shadow data could not supply a complete neighbourhood.'
    if abs(location.latitude) >= 65 and not os.getenv('LUNAR_DATA_MANIFEST'):
        from .water_evidence import open_layer

        try:
            ds, meta = open_layer('shadow', location.latitude)
            if ds is not None:
                with ds:
                    if meta['resolution_m'] > radius_m:
                        value = pixel(ds, location.longitude, location.latitude)
                        if value not in (0, 1):
                            raise ValueError('No mapped shadow classification at this point.')
                        return {'available': True, 'value': value, 'kind': 'mapped permanent shadow pixel',
                                'source': {**meta, 'interpretation': 'psr_pixel'}}
                    return _ice_window(ds, {**meta, 'interpretation': 'psr_fraction'}, location, radius_m)
        except RASTER_ERRORS as exc:
            reason = str(exc)
    elif abs(location.latitude) < 65:
        reason = 'No validated permanent-shadow scoring layer covers this latitude.'
    return {'available': False, 'value': None, 'reason': reason, 'source_url': 'https://pgda.gsfc.nasa.gov/products/69'}


def _ice_window(ds, meta, location, radius_m):
    if (meta.get('interpretation') != 'psr_fraction' or not ds.crs.is_projected
            or ds.transform.b or ds.transform.d or min(ds.res) < 1):
        raise ValueError('A projected PSR fraction product is required.')
    x, y = Transformer.from_crs(GEO, ds.crs, always_xy=True).transform(
        location.longitude, location.latitude)
    row, col = ds.index(x, y)
    extent = int(np.ceil(radius_m / min(ds.res))) + 1
    if not (extent <= row < ds.height - extent and extent <= col < ds.width - extent):
        raise ValueError('Outside complete mapped PSR coverage.')
    window = Window(col-extent, row-extent, 2*extent+1, 2*extent+1)
    values = ds.read(1, window=window, masked=True)
    centre_x, centre_y = ds.xy(row, col)
    offsets = np.arange(-extent, extent+1)
    circle = ((centre_x + offsets[None, :] * ds.res[0] - x)**2 +
              (centre_y - offsets[:, None] * ds.res[1] - y)**2 <= radius_m**2)
    samples = values[circle]
    if not samples.size or np.ma.getmaskarray(samples).any() or not np.isin(samples, [0, 1]).all():
        raise ValueError('The neighbourhood has incomplete PSR coverage.')
    return {'available': True, 'value': float(samples.mean()), 'source': meta,
            'radius_m': radius_m, 'samples': int(samples.size), 'kind': 'mapped permanent shadow fraction'}


@lru_cache(maxsize=128)
def _polar_ice(latitude, longitude, radius_m):
    from .models import Location

    with _remote_polar_raster(POLAR_SHADOW_URL, 154_221_202, 65_536) as (ds, _):
        return _ice_window(ds, POLAR_SHADOW_SOURCE, Location(latitude=latitude, longitude=longitude), radius_m)


def local_terrain(location, radius_m=100, *, allow_regional=False):
    footprint = _terrain_window('lola', location, radius_m)
    if footprint['available'] or not allow_regional:
        return footprint
    regional = _terrain_window('horizon_dem', location, radius_m)
    if not regional['available'] and _remote_polar_enabled(location):
        try:
            regional = _polar_terrain(location.latitude, location.longitude, radius_m)
        except RASTER_ERRORS:
            regional = {'available': False, 'reason': 'NASA LOLA elevation could not supply a complete terrain neighbourhood.'}
    if regional['available']:
        return {**regional, 'coverage_type': 'regional', 'footprint_reason': footprint['reason']}
    return {**footprint, 'reason': f"{footprint['reason']} Regional window: {regional['reason']}"}


@lru_cache(maxsize=128)
def _polar_terrain(latitude, longitude, radius_m):
    from .models import Location

    with _remote_polar_raster(POLAR_HORIZON_URL, 2_696_082_051) as (ds, _):
        return _terrain_metrics(ds, POLAR_ELEVATION_SOURCE, Location(latitude=latitude, longitude=longitude), radius_m)


def _terrain_window(kind, location, radius_m):
    try:
        ds,meta=opened(kind)
        with ds:
            return _terrain_metrics(ds, meta, location, radius_m)
    except (OSError,ValueError,KeyError,rasterio.errors.RasterioError) as exc:
        return {'available':False,'reason':str(exc),'grid':[]}

def _terrain_metrics(ds, meta, location, radius_m):
    if not ds.crs.is_projected or ds.transform.b or ds.transform.d:
        raise ValueError('Local slope calculation needs an unrotated projected metre raster.')
    x,y=Transformer.from_crs(GEO,ds.crs,always_xy=True).transform(location.longitude,location.latitude)
    if not np.isfinite((x, y)).all(): raise ValueError('Outside product coverage.')
    row,col=ds.index(x,y)
    resolution=max(ds.res)
    if not 1<=resolution<=2000: raise ValueError('Unsupported DEM pixel spacing.')
    n=int(np.ceil(radius_m/min(ds.res)))
    if n>500: raise ValueError('Requested neighbourhood exceeds processing bound.')
    if row-n<0 or col-n<0 or row+n>=ds.height or col+n>=ds.width: raise ValueError('Incomplete terrain neighbourhood coverage.')
    z=ds.read(1,window=Window(col-n,row-n,2*n+1,2*n+1),masked=True).astype(float)*ds.scales[0]+ds.offsets[0]
    yy,xx=np.mgrid[-n:n+1,-n:n+1];xx=xx*ds.res[0];yy=yy*ds.res[1]
    circle=xx**2+yy**2<=radius_m**2
    valid=circle & ~np.ma.getmaskarray(z) & np.isfinite(z.filled(np.nan))
    coverage=float(valid.sum()/circle.sum())
    if coverage<1 or valid.sum()<9: raise ValueError('Terrain neighbourhood has gaps or fewer than nine valid samples.')
    # Reject nodata in the derivative stencil too; no gradients across gaps.
    if np.ma.getmaskarray(z).any() or not np.isfinite(z).all(): raise ValueError('Slope stencil intersects missing data.')
    dzdy,dzdx=np.gradient(np.asarray(z),ds.res[1],ds.res[0])
    slopes=np.degrees(np.arctan(np.hypot(dzdx,dzdy)))[valid]
    a=np.column_stack([xx[valid],yy[valid],np.ones(valid.sum())])
    heights=np.asarray(z)[valid];residual=heights-a@np.linalg.lstsq(a,heights,rcond=None)[0]
    # Small diagnostic grid; original native resolution is retained in calculations.
    stride=max(1,int(np.ceil((2*n+1)/25)))
    grid=[{'east_m':float(xx[i,j]),'north_m':float(-yy[i,j]),'elevation_m':float(z[i,j]),'slope_deg':float(np.degrees(np.arctan(np.hypot(dzdx[i,j],dzdy[i,j]))))} for i in range(0,2*n+1,stride) for j in range(0,2*n+1,stride) if circle[i,j]]
    return {'available':True,'elevation_m':float(z[n,n]),'slope_p95_deg':float(np.percentile(slopes,95)),
            'slope_mean_deg':float(slopes.mean()),'slope_max_deg':float(slopes.max()),'roughness_m':float(np.sqrt(np.mean(residual**2))),
            'relief_m':float(np.ptp(heights)),'resolution_m':resolution,'radius_m':radius_m,'coverage':coverage,'samples':int(valid.sum()),'source':meta,'grid':grid}


def _sample_horizon_pixels(dataset, xs, ys, prefetch=None):
    """Read each raster block touched by the selected site's rays only once."""
    if not np.isfinite(xs).all() or not np.isfinite(ys).all():
        raise ValueError('Invalid horizon ray coordinates.')
    rows, columns = map(np.asarray, rasterio.transform.rowcol(dataset.transform, xs, ys))
    if (rows.min() < 0 or rows.max() >= dataset.height or
            columns.min() < 0 or columns.max() >= dataset.width):
        raise ValueError('DEM does not cover all 20 km horizon rays.')

    block_height, block_width = dataset.block_shapes[0]
    blocks_per_row = (dataset.width + block_width - 1) // block_width
    block_ids = (rows // block_height) * blocks_per_row + columns // block_width
    if prefetch is not None:
        prefetch(dataset, np.unique(block_ids), blocks_per_row)
    order = np.argsort(block_ids)
    boundaries = np.flatnonzero(np.diff(block_ids[order])) + 1
    values = np.empty(rows.size, dtype=dataset.dtypes[0])
    for indices in np.split(order, boundaries):
        block_row, block_column = divmod(int(block_ids[indices[0]]), blocks_per_row)
        row = block_row * block_height
        column = block_column * block_width
        window = Window(column, row, min(block_width, dataset.width - column),
                        min(block_height, dataset.height - row))
        block = dataset.read(1, window=window, masked=True)
        samples = block[rows[indices] - row, columns[indices] - column]
        if np.ma.getmaskarray(samples).any() or not np.isfinite(samples).all():
            raise ValueError('DEM does not cover all 20 km horizon rays.')
        values[indices] = samples
    return values


def _horizon_profile(ds, meta, location, height, prefetch=None):
    transform = Transformer.from_crs(GEO, ds.crs, always_xy=True)
    azimuths = np.arange(0, 360, 5)
    resolution = meta.get('resolution_m') or max(ds.res)
    step = max(25, resolution)
    distances = np.append(np.arange(step, HORIZON_RANGE_M, step), HORIZON_RANGE_M)
    az, dist = np.meshgrid(azimuths, distances, indexing='ij')
    lon, lat, _ = GEOD.fwd(np.full(az.size, location.longitude),
                           np.full(az.size, location.latitude), az.ravel(), dist.ravel())
    xs, ys = transform.transform(lon, lat)
    if ds.crs.is_geographic:
        xs = (xs + 180) % 360 - 180
        half_pixel = ds.res[1] / 2
        ys = np.clip(ys, -90 + half_pixel, 90 - half_pixel)
    vals = _sample_horizon_pixels(ds, xs, ys, prefetch)
    heights = vals.reshape(az.shape) * ds.scales[0] + ds.offsets[0]
    angle = dist / RADIUS
    angles = np.degrees(np.arctan2((RADIUS + heights) * np.cos(angle) - (RADIUS + height),
                                  (RADIUS + heights) * np.sin(angle)))
    return {
        'available': True,
        'profile': [{'azimuth': int(a), 'elevation': float(e)} for a, e in zip(azimuths, angles.max(axis=1))],
        'method': f'5 degree azimuth spacing; nearest-neighbour rays to 20 km using {resolution:g} m DEM; farther terrain and subpixel obstacles excluded. Reference-frame alignment and DEM errors remain unquantified.',
        'source': meta,
        'sampled_relief_m': float(max(heights.max(), height) - min(heights.min(), height)),
    }


@lru_cache(maxsize=128)
def _polar_horizon(latitude, longitude):
    from .models import Location

    with _remote_polar_raster(POLAR_HORIZON_URL, 2_696_082_051) as (ds, reader):
        location = Location(latitude=latitude, longitude=longitude)
        height = pixel(ds, longitude, latitude)
        result = _horizon_profile(ds, POLAR_ELEVATION_SOURCE, location, height, reader.prefetch)
        return {**result, 'observer_height': {'available': True, 'value': height,
                                              'source': POLAR_ELEVATION_SOURCE, 'coverage_type': 'regional'}}


@lru_cache(maxsize=128)
def _south_regional_horizon(location_latitude, location_longitude):
    from .models import Location

    location = Location(latitude=location_latitude, longitude=location_longitude)
    with _remote_polar_raster(SOUTH_REGIONAL_URL, 218_961_039, resolution=240) as (ds, reader):
        height = pixel(ds, location.longitude, location.latitude)
        result = _horizon_profile(ds, SOUTH_REGIONAL_SOURCE, location, height, reader.prefetch)
    return {**result, 'quality': 'regional', 'observer_height': {
        'available': True, 'value': height, 'source': SOUTH_REGIONAL_SOURCE, 'coverage_type': 'regional'}}


@lru_cache(maxsize=128)
def _global_horizon(latitude, longitude):
    from .models import Location

    location = Location(latitude=latitude, longitude=longitude)
    observer = measurement('global_dem', location)
    if not observer['available']:
        raise ValueError(observer['reason'])
    ds, meta = opened('global_dem')
    with ds:
        result = _horizon_profile(ds, meta, location, observer['value'])
    return {**result, 'quality': 'global', 'observer_height': {**observer, 'coverage_type': 'global'}}


def horizon(location, height):
    """Prefer detailed terrain, then regional and Moon-wide LOLA coverage."""
    try:
        try:
            ds,meta=opened('horizon_dem')
        except (OSError,ValueError,KeyError,rasterio.errors.RasterioError):
            ds,meta=opened('lola')
        with ds:
            if height is None:
                height = pixel(ds, location.longitude, location.latitude)
                return {**_horizon_profile(ds, meta, location, height),
                        'observer_height': {'available': True, 'value': height,
                                            'source': meta, 'coverage_type': 'regional'}}
            return _horizon_profile(ds, meta, location, height)
    except RASTER_ERRORS as exc:
        reason = str(exc)
    if os.getenv('LUNAR_REMOTE_HORIZON') == '1':
        if location.latitude <= POLAR_HORIZON_LIMIT:
            try:
                return dict(_polar_horizon(location.latitude, location.longitude))
            except RASTER_ERRORS:
                reason = 'NASA LOLA elevation could not supply all 20 km horizon samples.'
        elif location.latitude <= -60 - np.degrees(HORIZON_RANGE_M / RADIUS):
            try:
                return dict(_south_regional_horizon(location.latitude, location.longitude))
            except RASTER_ERRORS:
                reason = 'NASA regional LOLA elevation could not supply all 20 km horizon samples.'
    try:
        return dict(_global_horizon(location.latitude, location.longitude))
    except RASTER_ERRORS:
        pass
    return {'available': False, 'profile': None, 'reason': reason}
