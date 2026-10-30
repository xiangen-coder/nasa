import hashlib
import io
import json
import os
import sqlite3
from pathlib import Path
from contextlib import asynccontextmanager
from threading import RLock
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, JSONResponse
from .models import Mission, Location, Comparison, ExportRequest
from .sites import SITES
from .science import initialize, ephemeris, visible, metrics, ROOT
from .terrain import terrain

CACHE_LOCK = RLock()
ALGORITHM_VERSION = '1.0.0'
CACHE_PATH = Path(os.getenv('CACHE_PATH', str(ROOT/'data/cache.sqlite')))

def connection():
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(CACHE_PATH, timeout=30)
    db.execute('CREATE TABLE IF NOT EXISTS calculations (key TEXT PRIMARY KEY, result TEXT NOT NULL)')
    return db

@asynccontextmanager
async def lifespan(app):
    initialize()
    with connection():
        pass
    yield

app = FastAPI(title='Lunar Landing Site Navigator', version=ALGORITHM_VERSION, lifespan=lifespan)

@app.exception_handler(Exception)
async def failure(request, exc):
    import logging
    logging.exception('Analysis failed')
    return JSONResponse(status_code=503, content={'detail': 'Scientific calculation unavailable. Check backend logs and kernel/terrain configuration; no substitute data was generated.'})

@app.get('/api/health')
def health():
    initialize()
    return {'status': 'ok', 'ephemeris': 'NASA/JPL DE421 + NAIF IAU_MOON', 'terrain_configured': bool(os.getenv('LOLA_MANIFEST')), 'version': ALGORITHM_VERSION}

@app.get('/api/sites')
def sites():
    return SITES

@app.get('/api/sites/{site_id}')
def site(site_id: str):
    match = next((s for s in SITES if s['id'] == site_id), None)
    if not match:
        raise HTTPException(404, 'Site not found')
    return match

@app.post('/api/terrain')
def terrain_endpoint(location: Location):
    return terrain(location)

@app.post('/api/ephemeris')
def ephemeris_endpoint(mission: Mission):
    return {'series': ephemeris(mission), 'frame': 'IAU_MOON', 'correction': 'NONE', 'longitude_convention': 'east positive', 'time_scale': 'UTC input, SPICE ET internal'}

def analyze(mission: Mission):
    dem = terrain(mission)
    # Include actual terrain provenance in cache identity so datasets cannot be mixed.
    identity = {'mission': mission.model_dump(mode='json'), 'terrain': dem, 'version': ALGORITHM_VERSION, 'kernels': json.loads((ROOT/'data/kernels/manifest.json').read_text())}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    with CACHE_LOCK, connection() as db:
        row = db.execute('SELECT result FROM calculations WHERE key=?', (key,)).fetchone()
    if row:
        return dict(json.loads(row[0]), cached=True)
    series = ephemeris(mission, dem['elevation_m'] or 0)
    horizon = dem['horizon'] if dem['available'] else None
    for row in series:
        row['sun_visible'] = visible(row['sun_elevation'], row['sun_azimuth'], horizon)
        row['earth_visible'] = visible(row['earth_elevation'], row['earth_azimuth'], horizon, mission.clearance_deg)
        row['simultaneous'] = row['sun_visible'] and row['earth_visible']
    result = {'mission': mission.model_dump(mode='json'), 'series': series, 'metrics': metrics(series), 'terrain': dem, 'mode': 'terrain_screened' if dem['available'] else 'reference_sphere', 'cached': False, 'provenance': {'algorithm': ALGORITHM_VERSION, 'ephemeris': 'NASA/JPL DE421', 'orientation': 'NAIF pck00010 IAU_MOON (IAU 2009 low-precision lunar orientation)', 'kernels': identity['kernels'], 'sources': ['https://ssd.jpl.nasa.gov/planets/eph_export.html', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/', 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm'], 'assumptions': ['Planetocentric latitude; east-positive longitude; spherical lunar radius 1737.4 km.', 'Geometric body centers; no light time, stellar aberration, refraction, solar disk or Earth angular extent.', 'IAU_MOON is not a high-precision DE421 lunar principal-axis frame. Near-horizon mission decisions require a compatible binary lunar PCK and validated DEM frame alignment.', 'Availability uses left-endpoint samples weighted by interval duration. Transitions and blackout durations are uncertain by up to one sampling interval per boundary.', 'No terrain data means reference-sphere geometry only, not terrain clearance. Geometry is not power generation or guaranteed radio communication.', 'Sun/Earth directions use SPICE UTC-to-ET conversion; leap-second kernel is current through 2017. Future leap seconds are unknown.', 'Site coordinates are exploratory geographic references, not NASA-approved landing points.']}}
    with CACHE_LOCK, connection() as db:
        db.execute('INSERT OR REPLACE INTO calculations VALUES (?,?)', (key, json.dumps(result)))
    return result

@app.post('/api/analyze')
def analyze_endpoint(mission: Mission):
    return analyze(mission)

@app.post('/api/compare')
def compare(request: Comparison):
    if len({(s.latitude, s.longitude) for s in request.locations}) != len(request.locations):
        raise HTTPException(422, 'Choose distinct locations.')
    results = [analyze(Mission(**(request.mission.model_dump() | s.model_dump()))) for s in request.locations]
    modes = {r['mode'] for r in results}
    if len(modes) > 1:
        raise HTTPException(422, 'Cannot rank mixed terrain and reference-sphere analyses. Choose sites with consistent DEM coverage.')
    weights = request.weights.model_dump()
    weight_fields = {'sunlight':'sun_visible_pct', 'earth':'earth_visible_pct', 'simultaneous':'simultaneous_pct'}
    ranking = []
    for result in results:
        contributions = {k: result['metrics'][weight_fields[k]]*w/sum(weights.values()) for k,w in weights.items()}
        ranking.append({'mission': result['mission'], 'metrics': result['metrics'], 'slope_deg': result['terrain']['slope_deg'], 'score': sum(contributions.values()), 'contributions': contributions})
    ranking.sort(key=lambda r: r['score'], reverse=True)
    return {'ranking': ranking, 'weights': weights, 'mode': results[0]['mode'], 'explanation': 'Score is the weighted mean of sunlight, Earth-center visibility and simultaneous availability percentages. Terrain slope/hazards are reported separately and are not scored. Similar scores are not statistically significant; sampling and frame uncertainty are not quantified.'}

@app.post('/api/export')
def export(request: ExportRequest):
    result = analyze(request.mission)
    if request.format == 'json':
        return Response(json.dumps(result, indent=2), media_type='application/json', headers={'Content-Disposition':'attachment; filename="lunar-analysis.json"'})
    rows = [dict(row, site=result['mission']['name'], latitude=request.mission.latitude, longitude=request.mission.longitude, mode=result['mode'], ephemeris='NASA/JPL DE421', frame='IAU_MOON', clearance_deg=request.mission.clearance_deg, interval_minutes=request.mission.interval_minutes) for row in result['series']]
    return Response(pd.DataFrame(rows).to_csv(index=False), media_type='text/csv', headers={'Content-Disposition':'attachment; filename="lunar-analysis.csv"'})
