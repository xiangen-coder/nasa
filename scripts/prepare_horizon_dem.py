"""Prepare a bounded native 20 m NASA COG subset for offline horizon screening.
Run after prepare_lunar_research.py. Reads remote raster windows, not a whole globe.
"""
import argparse,hashlib,json,os
from datetime import datetime,timezone
from pathlib import Path
import rasterio
from rasterio.windows import from_bounds
ROOT=Path(__file__).resolve().parents[1]
URL='https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF'
def prepare(output,bounds):
 output.mkdir(parents=True,exist_ok=True)
 with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT='60',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.TIF'):
  with rasterio.open(URL) as ds:
   from pyproj import CRS
   crs=CRS(ds.crs)
   if abs(crs.ellipsoid.semi_major_metre-1737400)>1 or ds.res!=(20.,20.):raise ValueError('Unexpected lunar reference sphere or native spacing.')
   w=from_bounds(*bounds,ds.transform).round_offsets().round_lengths()
   if w.width<=0 or w.height<=0 or w.width*w.height>30_000_000:raise ValueError('Select a valid subset of at most 30 million pixels.')
   p=output/'horizon_dem.tif';tmp=output/'horizon_dem.download.tif'
   profile=ds.profile.copy();profile.update(width=int(w.width),height=int(w.height),transform=ds.window_transform(w),compress='deflate',predictor=3,dtype='float32',tiled=True,blockxsize=256,blockysize=256)
   with rasterio.open(tmp,'w',**profile) as out:
    for _,block in out.block_windows(1):
     window=rasterio.windows.Window(w.col_off+block.col_off,w.row_off+block.row_off,block.width,block.height)
     out.write(ds.read(window=window),window=block)
   tmp.replace(p)
   meta={'name':'NASA adjusted LOLA south-pole 20 m horizon DEM subset','path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_url':URL,'documentation':'https://pgda.gsfc.nasa.gov/products/90','units':'m','frame':'MOON_ME_DE421','reference':'radius_minus_1737400m','resolution_m':20,'projected_bounds_m':list(rasterio.windows.bounds(w,ds.transform)),'retrieved_at':datetime.now(timezone.utc).isoformat(),'quality':'Native 20 m regional horizon DEM. Effective resolution varies; errors and frame alignment remain unquantified. Not footpad-scale topography.','observation_period':'See NASA PGDA product 90 documentation; observation cutoff not inferred from retrieval date.'}
 if p.stat().st_size>100_000_000:raise ValueError('Compressed subset exceeds supported 100 MB packaging bound.')
 meta['parts']=[]
 with p.open('rb') as data:
  i=0
  while block:=data.read(2_000_000):
   part=output/f'horizon_dem.part{i:02d}';part.write_bytes(block)
   meta['parts'].append({'path':part.name,'sha256':hashlib.sha256(block).hexdigest()});i+=1
 for manifest in [output/'manifest.json',ROOT/'data/lunar/manifest.json']:
  if manifest.exists():
   value=json.loads(manifest.read_text(encoding='utf-8'));value.setdefault('products',{})['horizon_dem']={**meta,'path':os.path.relpath(p,manifest.parent).replace(chr(92),'/'),'parts':[{**item,'path':os.path.relpath(output/item['path'],manifest.parent).replace(chr(92),'/')} for item in meta['parts']]}
   manifest.write_text(json.dumps(value,indent=2),encoding='utf-8')
 return meta
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'data/lunar_preview');parser.add_argument('--bounds',type=float,nargs=4,default=[-70000,-40000,30000,45000]);a=parser.parse_args();print(json.dumps(prepare(a.output,a.bounds),indent=2))
