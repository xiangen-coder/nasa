import json
from datetime import datetime, timezone
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import astronomy as a

UTC=timezone.utc
REFERENCE=Path(__file__).parent/'fixtures/horizons-earth-2026-11-04.json'

def state(position):
    return {'position_km':position,'velocity_km_s':[0,0,0]}

def synthetic_fetch(body,times):
    # Analytic test-only states; never used as a runtime fallback.
    offset={'sun':0,'earth':150_000_000,'moon':150_400_000}[body]
    return [state([offset,10000+i,100]) for i,_ in enumerate(times)],'synthetic-test-only'

@pytest.fixture
def astro_client(tmp_path,monkeypatch):
    monkeypatch.setenv('CACHE_PATH',str(tmp_path/'astro.sqlite'))
    app=FastAPI();app.include_router(a.router)
    with TestClient(app) as client: yield client

@pytest.mark.parametrize('local,zone,expected',[
    ('2026-11-04T08:00:00','Asia/Kuala_Lumpur','2026-11-04T00:00:00Z'),
    ('2026-07-01T12:00:00','America/New_York','2026-07-01T16:00:00Z'),
    ('2026-01-01T12:00:00','America/New_York','2026-01-01T17:00:00Z'),
    ('2026-11-04T00:30:00','Asia/Kolkata','2026-11-03T19:00:00Z')])
def test_timezone_conversion(local,zone,expected):
    assert a.iso(a.utc_time(datetime.fromisoformat(local),zone))==expected

@pytest.mark.parametrize('local',['2026-03-08T02:30:00','2026-11-01T01:30:00'])
def test_dst_gap_and_ambiguity_rejected(local):
    with pytest.raises(ValueError): a.utc_time(datetime.fromisoformat(local),'America/New_York')

def test_julian_reference_and_proleptic_gregorian():
    assert a.julian(datetime(2000,1,1,12,tzinfo=UTC))==2451545
    assert a.julian(datetime(1970,1,1,tzinfo=UTC))==2440587.5
    assert a.julian(datetime(1,1,1,tzinfo=UTC))==1721425.5

def test_real_nasa_parser_reference():
    raw=json.loads(REFERENCE.read_text(encoding='utf-8-sig'))
    states,source=a.parse_vectors(raw,[datetime(2026,11,4,tzinfo=UTC)],'earth')
    assert source=='DE441'
    assert states[0]['position_km']==pytest.approx([111482356.6964369,97003936.6322806,6892.034855589271])
    assert states[0]['velocity_km_s']==pytest.approx([-20.09379818512271,22.31412420511611,-.0004222457391023227])

@pytest.mark.parametrize('old,new',[
    ('Ecliptic of J2000.0','ICRF'),('KM-S','AU-D'),('Solar System Barycenter (0)','Earth (399)'),
    ('Earth (399)','Moon (301)'),('GEOMETRIC','ASTROMETRIC'),('JDUT','JDTDB'),
    ('2461348.500000000','2461349.500000000'),('1.114823566964369E+08','NaN')])
def test_reject_wrong_frame_units_origin_body_time_and_nonfinite(old,new):
    raw=json.loads(REFERENCE.read_text(encoding='utf-8-sig'));raw['result']=raw['result'].replace(old,new)
    with pytest.raises(a.HorizonsUnavailable): a.parse_vectors(raw,[datetime(2026,11,4,tzinfo=UTC)],'earth')

def test_incomplete_and_range_errors():
    raw=json.loads(REFERENCE.read_text(encoding='utf-8-sig'))
    with pytest.raises(a.HorizonsUnavailable):a.parse_vectors(raw,[datetime(2026,11,4,tzinfo=UTC)]*2,'earth')
    with pytest.raises(a.HorizonsRangeError):a.parse_vectors({'result':'No ephemeris for target at requested date'},[],'moon')
    with pytest.raises(a.HorizonsUnavailable):a.parse_vectors({'error':'upstream error'},[],'earth')

@pytest.mark.parametrize('moon,expected', [([9,0,0],0),([11,0,0],1)])
def test_phase_new_and_full(moon,expected):
    result=a.geometry({'sun':state([0,0,0]),'earth':state([10,0,0]),'moon':state(moon)})
    assert result['moon_phase']['illuminated_fraction']==expected

def test_quarter_phase_and_geometric_distance():
    result=a.geometry({'sun':state([0,10,0]),'earth':state([1,0,0]),'moon':state([0,0,0])})
    assert result['moon_phase']['illuminated_fraction']==pytest.approx(.5)
    assert result['earth_moon_km']==1
    assert result['earth_sun_km']==pytest.approx(101**.5)

def test_translation_invariance():
    states={'sun':state([0,0,0]),'earth':state([10,0,0]),'moon':state([11,2,3])}
    shifted={k:state([v+delta for v,delta in zip(s['position_km'],[1234,-999,88])]) for k,s in states.items()}
    assert a.geometry(states)==a.geometry(shifted)

def test_same_utc_instant_reuses_validated_cache(astro_client,monkeypatch):
    calls=[]
    def fetch(body,times):calls.append(body);return synthetic_fetch(body,times)
    monkeypatch.setattr(a,'fetch_body',fetch)
    first=astro_client.post('/api/astronomy',json={'local_time':'2026-11-04T08:00:00','timezone':'Asia/Kuala_Lumpur'})
    assert first.status_code==200
    result=first.json();assert not result['cached'];assert calls==['sun','earth','moon']
    assert result['frames'][result['selected_index']]['time']=='2026-11-04T00:00:00Z'
    assert len(result['frames'])==121 and len(result['earth_path'])==73
    second=astro_client.post('/api/astronomy',json={'local_time':'2026-11-04T00:00:00','timezone':'UTC'})
    assert second.status_code==200 and second.json()['cached']
    assert calls==['sun','earth','moon']
    assert second.json()['frames']==result['frames']

@pytest.mark.parametrize('body',[
    {'local_time':'not a time'}, {'local_time':'2026-11-04T00:00:00Z'},
    {'local_time':'2026-11-04T00:00:00','timezone':'invented'},
    {'local_time':'2026-11-04T00:00:00','window_days':999},
    {'local_time':'2026-11-04T00:00:00','url':'https://example.com'},
    {'local_time':'2026-03-08T02:30:00','timezone':'America/New_York'}])
def test_input_validation_before_network(astro_client,monkeypatch,body):
    monkeypatch.setattr(a,'fetch_body',lambda *_:pytest.fail('Invalid input reached NASA'))
    assert astro_client.post('/api/astronomy',json=body).status_code==422

def test_upstream_failure_never_substituted_or_cached(astro_client,monkeypatch):
    calls=[]
    def fail(*args):calls.append(1);raise a.HorizonsUnavailable('NASA offline')
    monkeypatch.setattr(a,'fetch_body',fail)
    for _ in range(2):
        response=astro_client.post('/api/astronomy',json={'local_time':'2030-01-01T00:00:00'})
        assert response.status_code==503 and 'frames' not in response.json()
    assert len(calls)==2

def test_get_query_batches_are_bounded(monkeypatch):
    sizes=[]
    def batch(body,times):sizes.append(len(times));return synthetic_fetch(body,times)
    monkeypatch.setattr(a,'fetch_batch',batch)
    times=a.samples(datetime(2026,11,4,tzinfo=UTC),30,120)
    states,_=a.fetch_body('earth',times)
    assert len(states)==121 and sizes==[32,32,32,25]

def test_conflicting_batch_ephemerides_rejected(monkeypatch):
    count=[]
    def batch(body,times):count.append(1);return [],str(len(count))
    monkeypatch.setattr(a,'fetch_batch',batch)
    with pytest.raises(a.HorizonsUnavailable):a.fetch_body('earth',[datetime(2026,11,4,tzinfo=UTC)]*33)
