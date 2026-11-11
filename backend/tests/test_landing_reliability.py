import pytest
from pydantic import ValidationError
from app import landing_reliability as r
from app.models import Mission
from app.landing_research import Limits

def mission():return Mission(latitude=-89.463162834,longitude=-137.489552922,start='2026-11-05T00:00:00Z',end='2026-11-06T00:00:00Z',interval_minutes=360)
def terrain():return dict(available=True,slope_mean_deg=1,slope_p95_deg=2,slope_max_deg=3,roughness_m=.1,relief_m=.5,resolution_m=5,source={},grid=[])
def quality(error=1):return {'available':True,'layers':{'slope_uncertainty':{'available':True,'maximum':error},'height_uncertainty':{'available':True,'maximum':.1},'sample_count':{'available':True,'zero_fraction':.9}}}
@pytest.fixture
def raster(monkeypatch):
 monkeypatch.setattr(r.rasters,'local_terrain',lambda *a:terrain())
 monkeypatch.setattr(r,'uncertainty',lambda *a:quality())
 monkeypatch.setattr(r.rasters,'measurement',lambda *a:{'available':False})

def test_margin_cannot_increase_terrain_score(raster):
 a=r.screened(mission(),Limits(),r.Vehicle());assert a['margin_terrain_score']<a['nominal_terrain_score'];assert a['bounds']['slope_max_deg']==5

def test_apollo_effective_slope_cap_cannot_be_loosened(raster,monkeypatch):
 t=terrain();t['slope_max_deg']=13
 monkeypatch.setattr(r.rasters,'local_terrain',lambda *a:t)
 assert r.screened(mission(),Limits(max_slope_deg=30),r.Vehicle(rms_multiplier=0))['status']=='fails_available_terrain_checks'

def test_mean_slope_gate(raster,monkeypatch):
 t=terrain();t['slope_mean_deg']=7
 monkeypatch.setattr(r.rasters,'local_terrain',lambda *a:t)
 a=r.screened(mission(),Limits(),r.Vehicle(rms_multiplier=0));assert any('mean-slope' in x for x in a['constraints_failed'])

def test_missing_uncertainty_prevents_candidate(raster,monkeypatch):
 monkeypatch.setattr(r,'uncertainty',lambda *a:{'available':False,'layers':{}})
 q=r.ReliabilityRequest(mission=mission());a=r.screened(q.mission,q.limits,q.vehicle)
 assert a['margin_terrain_score'] is None;assert not r.alternatives(q,a)['candidates']

def test_regional_terrain_can_be_compared_without_passing_apollo(raster,monkeypatch):
 def local(*args,allow_regional=False):
  return {**terrain(),'resolution_m':20,'coverage_type':'regional'} if allow_regional else {'available':False}
 monkeypatch.setattr(r.rasters,'local_terrain',local)
 monkeypatch.setattr(r,'uncertainty',lambda *a:{'available':False,'layers':{}})
 report=r.shortlist(r.ReliabilityRequest(mission=mission(),vehicle=r.Vehicle(search_radius_m=1000)))
 assert not report['candidates'] and report['passing_terrain_candidates']==0
 assert report['outside_or_missing']==24 and report['search_radius_m']==1000
 assert report['exploration_candidates']
 assert all(c['resolution_m']==20 and 'margin_terrain_score' not in c for c in report['exploration_candidates'])

def test_regional_comparison_rejects_nominal_slope_over_apollo_cap(raster,monkeypatch):
 monkeypatch.setattr(r.rasters,'local_terrain',lambda *a,allow_regional=False:
     {**terrain(),'slope_max_deg':13,'resolution_m':20} if allow_regional else {'available':False})
 monkeypatch.setattr(r,'uncertainty',lambda *a:{'available':False,'layers':{}})
 report=r.shortlist(r.ReliabilityRequest(mission=mission(),limits=Limits(max_slope_deg=30)))
 assert not report['exploration_candidates']

def test_diversion_and_spatial_separation(raster):
 q=r.ReliabilityRequest(mission=mission(),vehicle=r.Vehicle(diversion_range_m=450))
 a=r.screened(q.mission,q.limits,q.vehicle);b=r.alternatives(q,a)
 assert 0<len(b['candidates'])<=3;assert all(200<=c['distance_m']<=450 for c in b['candidates'])
 for c in b['candidates']:assert c['visibility_status']=='not_evaluated_at_candidate'

def test_failed_sites_never_become_backups(raster,monkeypatch):
 monkeypatch.setattr(r,'uncertainty',lambda *a:quality(15))
 q=r.ReliabilityRequest(mission=mission());a=r.screened(q.mission,q.limits,q.vehicle);b=r.alternatives(q,a)
 assert not b['candidates'];assert b['inspection_candidates'];assert all(c['assessment']['constraints_failed'] for c in b['inspection_candidates'])

def test_bad_vehicle_inputs():
 with pytest.raises(ValidationError):r.Vehicle(battery_wh=100)
 with pytest.raises(ValidationError):r.Vehicle(search_radius_m=float('nan'))
 with pytest.raises(ValidationError):r.Vehicle(diversion_range_m=-1)

def test_position_envelope_uses_vehicle_span(raster):
 assert r.screened(mission(),Limits(),r.Vehicle(diameter_m=40,landing_dispersion_m=200))['screening_radius_m']==220
