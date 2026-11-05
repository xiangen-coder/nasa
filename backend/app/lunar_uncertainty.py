"""Windowed NASA RMS-error and LOLA shot-density measurements."""
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
from . import lunar_rasters as r

def uncertainty(location,radius_m):
    root,products,_=r.registry();out={'available':False,'layers':{}}
    try:
        dem,meta=r.opened('lola')
        with dem:
            x,y=Transformer.from_crs(r.GEO,dem.crs,always_xy=True).transform(location.longitude,location.latitude)
            row,col=dem.index(x,y);n=int(np.ceil(radius_m/min(dem.res)))
            if row-n<0 or col-n<0 or row+n>=dem.height or col+n>=dem.width:raise ValueError('Uncertainty footprint is outside DEM coverage.')
            yy,xx=np.mgrid[-n:n+1,-n:n+1];circle=(xx*dem.res[0])**2+(yy*dem.res[1])**2<=radius_m**2
            for kind,units in [('slope_uncertainty','degree RMS'),('height_uncertainty','m RMS'),('sample_count','count')]:
                try:
                    m=products[kind];p=root/m['path'];r.verify(str(p),p.stat().st_mtime_ns,m['sha256'])
                    with rasterio.open(p) as ds:
                        if ds.crs!=dem.crs or ds.transform!=dem.transform or ds.shape!=dem.shape or m.get('units')!=units or m.get('frame')!='MOON_ME_DE421':raise ValueError('Uncertainty layer is not aligned to the DEM or lacks matching units/frame.')
                        z=ds.read(1,window=Window(col-n,row-n,2*n+1,2*n+1),masked=True)*ds.scales[0]+ds.offsets[0]
                        a=z[circle]
                        if np.ma.getmaskarray(a).any() or not np.isfinite(a).all() or (a<0).any():raise ValueError('Missing/invalid values inside uncertainty footprint.')
                        a=np.asarray(a)
                        out['layers'][kind]={'available':True,'maximum':float(a.max()),'p95':float(np.percentile(a,95)),'zero_fraction':float((a==0).mean()),'source':m}
                except (OSError,KeyError,ValueError,rasterio.errors.RasterioError) as exc:out['layers'][kind]={'available':False,'reason':str(exc)}
        out['available']=all(out['layers'][k]['available'] for k in ['slope_uncertainty','height_uncertainty'])
    except (OSError,ValueError,KeyError,rasterio.errors.RasterioError) as exc:out['reason']=str(exc)
    return out
