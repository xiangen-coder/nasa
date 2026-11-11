import json
import numpy as np
import rasterio
from rasterio.transform import from_origin
from hashlib import sha256
from app import lunar_rasters as r
from app.models import Location, Mission

def test_wide_horizon_covers_site_without_local_dem(tmp_path,monkeypatch):
 p=tmp_path/'wide.tif'
 with rasterio.open(p,'w',driver='GTiff',height=601,width=601,count=1,dtype='float32',crs='+proj=stere +lat_0=-90 +lon_0=0 +R=1737400 +units=m',transform=from_origin(-60100,60100,200,200),nodata=-9999) as ds:ds.write(np.zeros((601,601),dtype='float32'),1)
 m={'products':{'horizon_dem':{'path':p.name,'sha256':sha256(p.read_bytes()).hexdigest(),'units':'m','reference':'radius_minus_1737400m','frame':'MOON_ME_DE421','name':'SYNTHETIC TEST ONLY'}}}
 manifest=tmp_path/'manifest.json';manifest.write_text(json.dumps(m));monkeypatch.setenv('LUNAR_DATA_MANIFEST',str(manifest))
 out=r.horizon(Location(latitude=-90,longitude=0),0)
 assert out['available'];assert len(out['profile'])==72;assert max(x['elevation'] for x in out['profile'])<0
 assert not r.local_terrain(Location(latitude=-90,longitude=0))['available']
 p.write_bytes(p.read_bytes()+b'broken')
 assert not r.horizon(Location(latitude=-90,longitude=0),0)['available']

def test_research_uses_broad_observer_height_without_local_score(monkeypatch):
 from app import landing_research as module
 monkeypatch.setattr(r,'local_terrain',lambda *a:{'available':False})
 monkeypatch.setattr(r,'measurement',lambda kind,*a:{'available':True,'value':123.,'source':{}} if kind=='horizon_dem' else {'available':False})
 monkeypatch.setattr(r,'horizon',lambda *a:{'available':True,'profile':None})
 heights=[]
 def geometry(m,height):
  heights.append(height)
  return {'source_url':'https://ssd.jpl.nasa.gov','series':[{'time':t.isoformat(),'sun_elevation':1,'sun_azimuth':0,'earth_elevation':1,'earth_azimuth':0} for t in [m.start,m.end]]}
 monkeypatch.setattr(module,'surface_observations',geometry)
 m=Mission(latitude=-89,longitude=0,start='2026-11-05T00:00:00Z',end='2026-11-06T00:00:00Z')
 out=module.research(module.ResearchRequest(mission=m))
 assert heights==[123.];assert out['geometry']['mode']=='terrain_screened';assert out['factors']['T']['score'] is None
