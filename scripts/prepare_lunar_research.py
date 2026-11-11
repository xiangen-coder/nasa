"""Offline NASA product download/registration. Never runs on a map click.

Run: python scripts/prepare_lunar_research.py [--output data/lunar]
Downloads about 210 MB once, converts verified numeric GeoTIFFs to compressed tiles.
"""
import argparse
import hashlib
import json
import sys
import ssl
from datetime import datetime, timezone
from pathlib import Path
import httpx
import numpy as np
import rasterio
from rasterio.windows import Window

ROOT=Path(__file__).resolve().parents[1]
DIV='https://luna1.diviner.ucla.edu/~jpierre/diviner/level4_polar/additional_maps/'
PRODUCTS={
 'lola': {'url':'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif','name':'LOLA Site01 Connecting Ridge 5 m DEM','units':'m','frame':'MOON_ME_DE421','reference':'radius_minus_1737400m','observation_period':'See Barker et al. 2021 product documentation','documentation':'https://pgda.gsfc.nasa.gov/products/78','quality':'Interpolated altimetry; approximately 90% of 5 m pixels interpolated. Not boulder-scale certification.'},
 'temperature_min': {'url':DIV+'polar_south_80_summer_min-float.tif','name':'Diviner south-pole summer minimum','units':'K','frame':'MOON_ME','observation_period':'2009-07-05 to 2019-02-17','documentation':'https://www.diviner.ucla.edu/data','quality':'Historical summer bolometric brightness-temperature composite; not a mission forecast.'},
 'temperature_max': {'url':DIV+'polar_south_80_summer_max-float.tif','name':'Diviner south-pole summer maximum','units':'K','frame':'MOON_ME','observation_period':'2009-07-05 to 2019-02-17','documentation':'https://www.diviner.ucla.edu/data','quality':'Historical summer bolometric brightness-temperature composite; not a mission forecast.'}
}

for kind,suffix,units in [('height_uncertainty','toterr','m RMS'),('slope_uncertainty','slperr','degree RMS'),('sample_count','ldec','count')]:
    PRODUCTS[kind]={'url':f'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_{suffix}.tif','name':f'LOLA Site01 {kind.replace("_"," ")}','units':units,'frame':'MOON_ME_DE421','observation_period':'See Barker et al. 2021 product documentation','documentation':'https://pgda.gsfc.nasa.gov/products/78','quality':'Published RMS uncertainty or native laser shot counts; no calibrated landing probability.'}

def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle,'sha256').hexdigest()

def download(url,path):
    if path.exists():
        # Validate existing files before reuse; failed partial downloads have a distinct suffix.
        with rasterio.open(path) as ds:
            ds.read(1,window=Window(0,ds.height-1,ds.width,1))
        return
    temp=path.with_suffix('.download')
    with httpx.Client(timeout=httpx.Timeout(120,connect=20),follow_redirects=True,verify=ssl.create_default_context()) as client:
        with client.stream('GET',url) as response:
            response.raise_for_status()
            total=0
            with temp.open('wb') as out:
                for chunk in response.iter_bytes():
                    total+=len(chunk)
                    if total>100_000_000: raise ValueError('Product exceeds 100 MB download limit')
                    out.write(chunk)
    with rasterio.open(temp) as ds:
        ds.read(1,window=Window(0,ds.height-1,ds.width,1))
    temp.replace(path)

def prepare(output):
    output.mkdir(parents=True,exist_ok=True)
    raw=output/'raw';raw.mkdir(exist_ok=True)
    manifest={'version':1,'products':{},'missing':{}}
    old=output/'manifest.json'
    if old.exists():
        previous=json.loads(old.read_text(encoding='utf-8'))
        manifest['products']={k:v for k,v in previous.get('products',{}).items() if k not in PRODUCTS}
    for kind,meta in PRODUCTS.items():
        try:
            print('Preparing',kind,flush=True)
            source=raw/f'{kind}.tif';download(meta['url'],source)
            target=output/f'{kind}.tif'
        except Exception as exc:
            manifest['missing'][kind]=str(exc);print(kind,exc,flush=True);continue
        try:
            from pyproj import CRS
            with rasterio.open(source) as src:
                if not src.crs or abs(CRS(src.crs).ellipsoid.semi_major_metre-1737400)>1:
                    raise ValueError('Missing or incompatible lunar CRS')
                profile=src.profile.copy();profile.update(driver='GTiff',dtype='float32',nodata=-9999,tiled=True,blockxsize=256,blockysize=256,compress='deflate',predictor=3)
                with rasterio.open(target,'w',**profile) as dst:
                    for _,win in dst.block_windows(1):
                        values=src.read(1,window=win,masked=True).astype('float32')*src.scales[0]+src.offsets[0]
                        if kind.startswith('temperature'): values=np.ma.masked_where((values<=0)|(values>500),values)
                        dst.write(values.filled(-9999),1,window=win)
                manifest['products'][kind]={**meta,'path':target.name,'sha256':digest(target),'source_sha256':digest(source),
                    'source_url':meta['url'],'resolution_m':max(src.res),'retrieved_at':datetime.now(timezone.utc).isoformat(),'status':'processed'}
        except Exception as exc:
            manifest['missing'][kind]=str(exc);print(kind,exc,flush=True)
    temp=output/'manifest.tmp';temp.write_text(json.dumps(manifest,indent=2));temp.replace(output/'manifest.json')
    print(json.dumps({'processed':list(manifest['products']),'missing':manifest['missing']}),flush=True)
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'data/lunar')
    args=parser.parse_args();result=prepare(args.output)
    sys.exit(0 if result['products'] else 1)
