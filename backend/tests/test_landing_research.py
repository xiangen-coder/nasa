import json
from pathlib import Path
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient
from app.models import Location, Mission
from app.surface_horizons import parse_observer, epochs
from app.astronomy import HorizonsUnavailable
from app.landing_research import Limits, score_factors, research
from app import lunar_rasters

def score(t=None,g=None,h=None,haz=None,ice=None):
    return score_factors(t or {},g or {},h or {},haz or {},ice or {},Limits())

def test_missing_is_not_zero():
    r=score();assert r['score'] is None;assert r['available_weight']==0
    assert all(f['score'] is None for f in r['factors'].values())

def test_provisional_weights_and_contributions():
    r=score(g={'available':True,'mode':'reference_geometry_only','metrics':{'sun_visible_pct':80,'earth_visible_pct':40},'source_url':'https://ssd.jpl.nasa.gov/'})
    assert r['score']==pytest.approx((.25*80+.2*40)/.45)
    assert sum(f['effective_weight'] for f in r['factors'].values())==pytest.approx(1)
    assert r['provisional'];assert r['missing']==['T','H','I']

def test_high_score_does_not_override_hard_failure():
    r=score(t={'available':True,'slope_max_deg':20,'slope_p95_deg':1,'roughness_m':0,'relief_m':0,'resolution_m':5,'source':{}})
    assert r['safety_status']=='fails_configured_limits'

def test_historical_temperature_changes_score_without_a_limit_failure():
    geometry = dict(available=True, mode='terrain_screened',
                    metrics=dict(sun_visible_pct=80, earth_visible_pct=40),
                    source_url='https://ssd.jpl.nasa.gov/')
    warm = score(g=geometry, h=dict(available=True, minimum_k=150, maximum_k=250, source={}))
    cold = score(g=geometry, h=dict(available=True, minimum_k=40, maximum_k=80, source={}))
    assert cold['factors']['H']['score'] == 0
    assert cold['score'] < warm['score']
    assert cold['constraints_failed'] == []


def test_bad_resolution_not_terrain_score():
    r=score(t={'available':True,'slope_max_deg':1,'slope_p95_deg':1,'roughness_m':0,'relief_m':0,'resolution_m':240,'source':{}})
    assert r['factors']['T']['score'] is None

@pytest.mark.parametrize('kwargs',[{'good_slope_deg':16},{'min_temperature_k':400},{'max_roughness_m':0},{'max_slope_deg':float('nan')}])
def test_invalid_limits(kwargs):
    with pytest.raises(ValueError):Limits(**kwargs)

def test_partial_last_interval():
    m=Mission(latitude=-89,longitude=0,start='2026-11-05T00:00:00Z',end='2026-11-05T01:15:00Z',interval_minutes=60)
    assert len(epochs(m))==3;assert epochs(m)[-1]==m.end

@pytest.fixture
def raster_registry(tmp_path,monkeypatch):
    from hashlib import sha256
    def make(z,nodata=-9999,units='m',kind='lola'):
        path=tmp_path/f'{kind}.tif'
        with rasterio.open(path,'w',driver='GTiff',width=z.shape[1],height=z.shape[0],count=1,dtype='float32',crs='+proj=stere +lat_0=-90 +lon_0=0 +R=1737400 +units=m',transform=from_origin(-152.5,152.5,5,5),nodata=nodata) as ds:ds.write(z.astype('float32'),1)
        meta={'path':path.name,'sha256':sha256(path.read_bytes()).hexdigest(),'units':units,'reference':'radius_minus_1737400m','frame':'MOON_ME_DE421','name':'SYNTHETIC TEST ONLY','source_url':'https://example.com/test'}
        (tmp_path/'manifest.json').write_text(json.dumps({'products':{kind:meta}}))
        monkeypatch.setenv('LUNAR_DATA_MANIFEST',str(tmp_path/'manifest.json'))
        return path
    return make

def test_planar_slope_and_detrended_roughness(raster_registry):
    z=np.tile(np.arange(61)*5*np.tan(np.deg2rad(10)),(61,1));raster_registry(z)
    r=lunar_rasters.local_terrain(Location(latitude=-90,longitude=0),100)
    assert r['available'];assert r['slope_p95_deg']==pytest.approx(10,abs=.001)
    assert r['roughness_m']<.001;assert r['relief_m']>0

def test_nodata_not_flat_safe_ground(raster_registry):
    z=np.zeros((61,61));z[30,30]=-9999;raster_registry(z)
    assert not lunar_rasters.local_terrain(Location(latitude=-90,longitude=0))['available']

def test_integrity_failure(raster_registry):
    path=raster_registry(np.zeros((61,61)));path.write_bytes(path.read_bytes()+b'changed')
    assert not lunar_rasters.local_terrain(Location(latitude=-90,longitude=0))['available']

def test_horizon_outside_coverage_is_unknown(raster_registry):
    raster_registry(np.zeros((61,61)))
    assert not lunar_rasters.horizon(Location(latitude=-90,longitude=0),0)['available']

def test_missing_temperature_rejects_nodata(raster_registry):
    raster_registry(np.full((61,61),-9999),kind='temperature_min',units='K')
    assert not lunar_rasters.measurement('temperature_min',Location(latitude=-90,longitude=0))['available']


def test_regional_terrain_is_an_opt_in_screening_fallback(raster_registry):
    raster_registry(np.zeros((61, 61)), kind='horizon_dem')
    location = Location(latitude=-90, longitude=0)
    assert not lunar_rasters.local_terrain(location)['available']
    result = lunar_rasters.local_terrain(location, allow_regional=True)
    assert result['coverage_type'] == 'regional'
    assert score(t=result)['factors']['T']['quality'] == 'regional DEM screening'


def test_shadow_fraction_keeps_zero_and_rejects_incomplete_windows(raster_registry):
    path = raster_registry(np.zeros((61, 61)), kind='ice', units='fraction')
    manifest_path = path.with_name('manifest.json')
    manifest = json.loads(manifest_path.read_text())
    manifest['products']['ice'].update(sampling='neighbourhood_fraction', interpretation='psr_fraction')
    manifest_path.write_text(json.dumps(manifest))
    result = lunar_rasters.ice_evidence(Location(latitude=-90, longitude=0), 100)
    assert result['available'] and result['value'] == 0 and result['samples'] > 1
    assert not lunar_rasters.ice_evidence(Location(latitude=-90, longitude=0), 500)['available']

def test_live_horizons_fixture_and_wrong_site():
    payload=json.loads((Path(__file__).parent/'fixtures/horizons-surface-earth.json').read_text())
    m=Mission(latitude=-89.54,longitude=0,start='2026-11-05T00:00:00Z',end='2026-11-06T00:00:00Z',interval_minutes=360)
    rows,source=parse_observer(payload,epochs(m),'399',m,0)
    assert source['ephemeris']=='DE441';assert rows[0]['elevation']==pytest.approx(-2.646365203)
    assert rows[0]['light_time_seconds']==pytest.approx(1.2798276)
    with pytest.raises(HorizonsUnavailable):parse_observer(payload,epochs(m),'10',m,0)
    with pytest.raises(HorizonsUnavailable):parse_observer(payload,epochs(m),'399',m.model_copy(update={'longitude':20}),0)

def test_horizons_failure_retains_other_data(monkeypatch):
    from app import landing_research as module
    monkeypatch.setattr(module.rasters,'local_terrain',lambda *a,**kw:{'available':False})
    monkeypatch.setattr(module.rasters,'measurement',lambda *a:{'available':False})
    def fail(*args):raise HorizonsUnavailable('Offline')
    monkeypatch.setattr(module,'surface_observations',fail)
    request=module.ResearchRequest(mission=Mission(latitude=-89,longitude=0,start='2026-11-05T00:00:00Z',end='2026-11-06T00:00:00Z'))
    result=research(request)
    assert result['score'] is None and result['geometry']['reason']=='Offline'

def test_api_validation():
    from app.main import app
    client=TestClient(app)
    assert client.post('/api/research/evaluate',json={'mission':{'latitude':float(100),'longitude':0,'start':'2026-11-05T00:00:00Z','end':'2026-11-06T00:00:00Z'}}).status_code==422
    assert client.get('/api/research/imagery?latitude=0&longitude=0').status_code==422
    assert client.get('/api/research/datasets').status_code==200

def test_terrain_endpoint_native_window_no_horizons(raster_registry,monkeypatch):
    from app.main import app
    import app.landing_research as module
    raster_registry(np.tile(np.arange(61)*5*np.tan(np.deg2rad(10)),(61,1)))
    def forbidden(*args,**kwargs): raise AssertionError('Terrain endpoint must not call Horizons')
    monkeypatch.setattr(module,'surface_observations',forbidden)
    r=TestClient(app).get('/api/research/terrain?latitude=-90&longitude=0&radius_m=100')
    assert r.status_code==200
    data=r.json();assert data['terrain']['slope_p95_deg']==pytest.approx(10,abs=.001)
    assert data['regional_elevation']['value']==data['terrain']['elevation_m']
    assert data['terrain']['resolution_m']==5
    assert 'projected raster axes' in data['coordinate_note']

def test_terrain_endpoint_missing_footprint_keeps_elevation_separate(monkeypatch):
    from app.main import app
    monkeypatch.setattr(lunar_rasters,'local_terrain',lambda *args,**kw:{'available':False,'reason':'Outside footprint coverage','grid':[]})
    monkeypatch.setattr(lunar_rasters,'measurement',lambda kind,loc:{'available':True,'value':1240.,'source':{'name':'TEST REGIONAL DEM'}})
    data=TestClient(app).get('/api/research/terrain?latitude=-89&longitude=0').json()
    assert not data['terrain']['available'];assert 'slope_p95_deg' not in data['terrain']
    assert data['regional_elevation']['value']==1240

@pytest.mark.parametrize('query',['latitude=91&longitude=0','latitude=-90&longitude=181','latitude=nan&longitude=0','latitude=-90&longitude=0&radius_m=0','latitude=-90&longitude=0&radius_m=501'])
def test_terrain_endpoint_rejects_invalid_requests(query):
    from app.main import app
    assert TestClient(app).get('/api/research/terrain?'+query).status_code==422


def test_regional_metrics_do_not_apply_footprint_limits():
    result = score(t={"available": True, "coverage_type": "regional", "regional_only": True,
                      "resolution_m": 60, "slope_max_deg": 45, "roughness_m": 50, "relief_m": 200})
    assert result["factors"]["T"]["score"] is None
    assert not result["constraints_failed"]


def test_regional_slope_score_respects_scale_and_keeps_detailed_score_separate():
    from app.landing_research import regional_slope_score

    for resolution in (30, 60):
        terrain = {"regional_only": True, "resolution_m": resolution, "slope_p95_deg": 10}
        result = regional_slope_score(terrain, Limits(good_slope_deg=5, max_slope_deg=15))
        assert result["regional_score"] == 50
        assert score(t=result)["factors"]["T"]["score"] is None
    coarse = {"regional_only": True, "resolution_m": 1900}
    assert "regional_score" not in regional_slope_score(coarse, Limits())
