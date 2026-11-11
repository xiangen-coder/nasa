"""Verified, windowed lunar raster measurements. No network work at query time."""
import json
import os
from pathlib import Path
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
RASTER_ERRORS = (OSError, ValueError, KeyError, rasterio.errors.RasterioError)

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
    if not override and path==default and 'ice' not in products:
        try:
            bundled=json.loads(preview.read_text())['products']['ice']
            products['ice']={**bundled,'path':(Path('..')/'lunar_preview'/bundled['path']).as_posix()}
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
    expected='K' if kind.startswith('temperature') else 'm' if kind in ('lola','horizon_dem') else 'fraction'
    if not crs or abs(crs.ellipsoid.semi_major_metre-RADIUS)>1 or abs(crs.ellipsoid.semi_minor_metre-RADIUS)>1 or meta.get('units')!=expected:
        ds.close();raise ValueError('Product requires a spherical lunar CRS and declared physical units.')
    if kind in ('lola','horizon_dem') and (meta.get('reference')!='radius_minus_1737400m' or meta.get('frame')!='MOON_ME_DE421'):
        ds.close();raise ValueError('LOLA vertical datum / mean-Earth frame not confirmed.')
    return ds,meta

def pixel(ds,lon,lat):
    x,y=Transformer.from_crs(GEO,ds.crs,always_xy=True).transform(lon,lat)
    row,col=ds.index(x,y)
    if not (0<=row<ds.height and 0<=col<ds.width): raise ValueError('Outside product coverage.')
    z=ds.read(1,window=Window(col,row,1,1),masked=True)[0,0]
    if np.ma.is_masked(z) or not np.isfinite(z): raise ValueError('No valid measurement at this location.')
    return float(z)*ds.scales[0]+ds.offsets[0]

def measurement(kind,location):
    try:
        ds,meta=opened(kind)
        with ds: value=pixel(ds,location.longitude,location.latitude)
        if (kind.startswith('temperature') and not 0<value<=500) or (kind in ('hazards','ice') and not 0<=value<=1):
            raise ValueError('Measurement is nodata or outside documented units/range.')
        if kind=='ice' and meta.get('interpretation') not in ('mapped_ice_evidence','psr_fraction'):
            raise ValueError('Ice product must identify mapped evidence or a PSR proxy.')
        if kind=='hazards' and meta.get('method') not in ('manual','automatic','published'):
            raise ValueError('Hazard product must identify manual, automatic or published assessment.')
        return {'available':True,'value':value,'source':meta,'kind':'derived raster measurement'}
    except (OSError,ValueError,KeyError,rasterio.errors.RasterioError) as exc:
        return {'available':False,'value':None,'reason':str(exc),'source_url':SOURCES[kind]}

def ice_evidence(location, radius_m):
    """Use a complete native PSR window for the fraction of mapped shadow."""
    _, products, _ = registry()
    if products.get('ice', {}).get('sampling') != 'neighbourhood_fraction':
        return measurement('ice', location)
    try:
        ds, meta = opened('ice')
        with ds:
            if (meta.get('interpretation') != 'psr_fraction' or not ds.crs.is_projected
                    or ds.transform.b or ds.transform.d or min(ds.res) < 1):
                raise ValueError('A projected PSR fraction product is required.')
            x, y = Transformer.from_crs(GEO, ds.crs, always_xy=True).transform(
                location.longitude, location.latitude)
            row, col = ds.index(x, y)
            extent = int(np.ceil(radius_m / min(ds.res))) + 1
            if not (0 <= row < ds.height and 0 <= col < ds.width):
                raise ValueError('Outside mapped PSR coverage.')
            window = Window(col-extent, row-extent, 2*extent+1, 2*extent+1)
            values = ds.read(1, window=window, boundless=True, masked=True)
            centre_x, centre_y = ds.xy(row, col)
            offsets = np.arange(-extent, extent+1)
            circle = ((centre_x + offsets[None, :] * ds.res[0] - x)**2 +
                      (centre_y - offsets[:, None] * ds.res[1] - y)**2 <= radius_m**2)
            samples = values[circle]
            if not samples.size or np.ma.getmaskarray(samples).any() or not np.isin(samples, [0, 1]).all():
                raise ValueError('The neighbourhood has incomplete PSR coverage.')
            return {'available': True, 'value': float(samples.mean()), 'source': meta,
                    'radius_m': radius_m, 'samples': int(samples.size), 'kind': 'mapped permanent shadow fraction'}
    except RASTER_ERRORS as exc:
        return {'available': False, 'value': None, 'reason': str(exc), 'source_url': SOURCES['horizon_dem']}


def local_terrain(location, radius_m=100, *, allow_regional=False):
    footprint = _terrain_window('lola', location, radius_m)
    if footprint['available'] or not allow_regional:
        return footprint
    regional = _terrain_window('horizon_dem', location, radius_m)
    if regional['available']:
        return {**regional, 'coverage_type': 'regional', 'footprint_reason': footprint['reason']}
    return {**footprint, 'reason': f"{footprint['reason']} Regional window: {regional['reason']}"}


def _terrain_window(kind, location, radius_m):
    try:
        ds,meta=opened(kind)
        with ds:
            if not ds.crs.is_projected or ds.transform.b or ds.transform.d:
                raise ValueError('Local slope calculation needs an unrotated projected metre raster.')
            x,y=Transformer.from_crs(GEO,ds.crs,always_xy=True).transform(location.longitude,location.latitude)
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
    except (OSError,ValueError,KeyError,rasterio.errors.RasterioError) as exc:
        return {'available':False,'reason':str(exc),'grid':[]}

def _sample_horizon_pixels(dataset, xs, ys):
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


def horizon(location,height):
    """Finite 20 km terrain screening; missing rays never imply a flat horizon."""
    try:
        try:
            ds,meta=opened('horizon_dem')
        except (OSError,ValueError,KeyError,rasterio.errors.RasterioError):
            ds,meta=opened('lola')
        with ds:
            transform=Transformer.from_crs(GEO,ds.crs,always_xy=True)
            azimuths=np.arange(0,360,5); distances=np.arange(max(25,max(ds.res)),20001,max(25,max(ds.res)))
            az,dist=np.meshgrid(azimuths,distances,indexing='ij')
            lon,lat,_=GEOD.fwd(np.full(az.size,location.longitude),np.full(az.size,location.latitude),az.ravel(),dist.ravel())
            xs,ys=transform.transform(lon,lat)
            if np.min(xs)<ds.bounds.left or np.max(xs)>=ds.bounds.right or np.min(ys)<=ds.bounds.bottom or np.max(ys)>ds.bounds.top:
                raise ValueError('DEM does not cover every horizon ray to 20 km; reference geometry remains provisional.')
            vals = _sample_horizon_pixels(ds, xs, ys)
            heights=vals.reshape(az.shape)*ds.scales[0]+ds.offsets[0]
            angle=dist/RADIUS
            angles=np.degrees(np.arctan2((RADIUS+heights)*np.cos(angle)-(RADIUS+height),(RADIUS+heights)*np.sin(angle)))
            return {'available':True,'profile':[{'azimuth':int(a),'elevation':float(e)} for a,e in zip(azimuths,angles.max(axis=1))],
                    'method':f'5 degree azimuth spacing; nearest-neighbour rays to 20 km using {max(ds.res):g} m DEM; farther terrain and subpixel obstacles excluded. Reference-frame alignment and DEM errors remain unquantified.','source':meta}
    except (OSError,ValueError,KeyError,rasterio.errors.RasterioError) as exc:
        return {'available':False,'profile':None,'reason':str(exc)}
