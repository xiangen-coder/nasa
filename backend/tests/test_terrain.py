import hashlib
import json
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from app.models import Location
from app.terrain import terrain, RADIUS

@pytest.fixture
def synthetic_dem(tmp_path, monkeypatch):
    # Artificial terrain is exclusively a test fixture, never shipped as measured data.
    crs=f'+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={RADIUS} +units=m +no_defs'
    path=tmp_path/'test.tif'
    values=np.zeros((601,601),dtype='float32')
    # Elevated ring 4–5 km from the pole should produce a blocking horizon.
    y,x=np.mgrid[-300:301,-300:301]; radius=np.hypot(x,y)*100
    values[(radius>4000)&(radius<5000)]=1000
    with rasterio.open(path,'w',driver='GTiff',width=601,height=601,count=1,dtype='float32',crs=crs,transform=from_origin(-30050,30050,100,100),nodata=-9999) as ds:
        ds.write(values,1)
    manifest=tmp_path/'manifest.json'
    data={'path':str(path),'units':'m','vertical_reference':'radius_minus_1737400m','source_url':'https://example.org/synthetic-test-only','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    manifest.write_text(json.dumps(data));monkeypatch.setenv('LOLA_MANIFEST',str(manifest))
    return path,manifest,data

def test_real_raster_algorithm_with_synthetic_ring(synthetic_dem):
    result=terrain(Location(latitude=-90,longitude=0))
    assert result['available'] is True
    assert result['elevation_m']==0
    assert result['slope_deg']==pytest.approx(0,abs=1e-5)
    assert len(result['horizon'])==72
    assert all(10<p['elevation']<15 for p in result['horizon'])
    assert len(result['grid'])==441

def test_partial_raster_does_not_invent_horizon(synthetic_dem):
    result=terrain(Location(latitude=-89.1,longitude=0))
    assert result['available'] is False
    assert result['horizon'] is None

def test_wrong_checksum_is_rejected(synthetic_dem):
    path,manifest,data=synthetic_dem
    data['sha256']='0'*64;manifest.write_text(json.dumps(data))
    result=terrain(Location(latitude=-90,longitude=0))
    assert result['available'] is False
    assert 'SHA-256' in result['reason']

def test_earth_crs_is_rejected(synthetic_dem):
    path,manifest,data=synthetic_dem
    with rasterio.open(path,'r+') as ds:
        ds.crs='EPSG:3857'
    data['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();manifest.write_text(json.dumps(data))
    result=terrain(Location(latitude=-90,longitude=0))
    assert not result['available']
    assert 'lunar CRS' in result['reason']

def test_no_dem_is_explicit(monkeypatch):
    monkeypatch.delenv('LOLA_MANIFEST',raising=False)
    result=terrain(Location(latitude=-90,longitude=0))
    assert result['slope_deg'] is None
    assert result['available'] is False
