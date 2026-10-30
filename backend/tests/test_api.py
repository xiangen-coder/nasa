import pytest

@pytest.mark.parametrize('patch', [
    {'latitude':91},{'longitude':181},{'interval_minutes':0},
    {'start':'2026-10-01T00:00:00'}, {'end':'2026-09-01T00:00:00Z'},
    {'end':'2027-01-01T00:00:00Z'},{'clearance_deg':-1}, {'start':'1800-01-01T00:00:00Z'},
    {'interval_minutes':5, 'end':'2026-10-31T00:00:00Z'},
])
def test_api_rejects_invalid_inputs(client, mission,patch):
    assert client.post('/api/analyze',json=mission.model_dump(mode='json')|patch).status_code==422

def test_sites_and_missing_site(client):
    assert len(client.get('/api/sites').json())==3
    assert client.get('/api/sites/shackleton').status_code==200
    assert client.get('/api/sites/missing').status_code==404

def test_analysis_cache_and_export(client,mission,monkeypatch):
    monkeypatch.delenv('LOLA_MANIFEST',raising=False)
    payload=mission.model_dump(mode='json')
    result=client.post('/api/analyze',json=payload)
    assert result.status_code==200
    data=result.json()
    assert data['mode']=='reference_sphere'
    assert data['terrain']['horizon'] is None
    assert data['terrain']['elevation_m'] is None
    assert len(data['series'])==25
    assert client.post('/api/analyze',json=payload).json()['cached'] is True
    for fmt in ['json','csv']:
        exported=client.post('/api/export',json={'mission':payload,'format':fmt})
        assert exported.status_code==200
        assert fmt in exported.headers['content-disposition']
        if fmt=='csv':
            assert len(exported.text.splitlines())==26
            assert 'reference_sphere' in exported.text
    assert client.post('/api/export',json={'mission':payload,'format':'exe'}).status_code==422

def test_compare_consistent_windows_and_score(client,mission):
    from app.sites import SITES
    payload={'mission':mission.model_dump(mode='json'),'locations':SITES,'weights':{'sunlight':1,'earth':1,'simultaneous':2}}
    result=client.post('/api/compare',json=payload)
    assert result.status_code==200
    ranking=result.json()['ranking']
    assert len(ranking)==3
    assert all(r['mission']['start']==payload['mission']['start'] for r in ranking)
    assert [r['score'] for r in ranking]==sorted([r['score'] for r in ranking],reverse=True)
    for r in ranking:
        expected=(r['metrics']['sun_visible_pct']+r['metrics']['earth_visible_pct']+2*r['metrics']['simultaneous_pct'])/4
        assert r['score']==pytest.approx(expected)
    payload['weights']={'sunlight':0,'earth':0,'simultaneous':0}
    assert client.post('/api/compare',json=payload).status_code==422

def test_duplicate_comparison_and_ephemeris(client,mission):
    p=mission.model_dump(mode='json')
    assert client.post('/api/compare',json={'mission':p,'locations':[p,p]}).status_code==422
    result=client.post('/api/ephemeris',json=p).json()
    assert result['frame']=='IAU_MOON'
    assert len(result['series'])==25
    assert client.get('/api/health').json()['status']=='ok'
