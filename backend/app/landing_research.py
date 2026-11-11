"""Transparent first-version research ranking; never a landing certification."""
import json
import math
import time
from threading import Lock
from urllib.parse import urlencode
from typing import Literal
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, ConfigDict, model_validator
import httpx
import numpy as np
from .models import Mission, Location
from .surface_horizons import surface_observations
from .astronomy import HorizonsUnavailable
from .science import metrics, windows, visible
from . import lunar_rasters as rasters
from datetime import datetime

router=APIRouter(prefix='/api/research',tags=['Landing research'])
WEIGHTS={'T':.35,'S':.25,'C':.20,'H':.15,'I':.05}
NAMES={'T':'Terrain safety','S':'Sunlight availability','C':'Earth communication','H':'Temperature suitability','I':'Water ice potential'}

class Limits(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    radius_m: int=Field(default=100,ge=25,le=500)
    good_slope_deg: float=Field(default=2,ge=0,le=45)
    max_slope_deg: float=Field(default=15,gt=0,le=60)
    max_roughness_m: float=Field(default=5,gt=0,le=100)
    max_relief_m: float=Field(default=50,gt=0,le=500)
    max_resolution_m: float=Field(default=20,ge=1,le=100)
    hazard_penalty: float=Field(default=100,ge=0,le=100)
    max_hazard_fraction: float=Field(default=.05,ge=0,le=1)
    min_temperature_k: float=Field(default=100,ge=0,le=499)
    max_temperature_k: float=Field(default=350,gt=0,le=500)
    @model_validator(mode='after')
    def ranges(self):
        if self.good_slope_deg>=self.max_slope_deg or self.min_temperature_k>=self.max_temperature_k:
            raise ValueError('Good slope must be below maximum slope; minimum temperature below maximum.')
        return self

class ResearchRequest(BaseModel):
    mission: Mission
    limits: Limits=Field(default_factory=Limits)

def clamp(x): return max(0.,min(100.,float(x)))

def score_factors(terrain,geometry,thermal,hazards,ice,limits):
    factors={k:{'name':NAMES[k],'weight':w,'score':None,'contribution':None,'quality':'unavailable','explanation':'No supported measurement.'} for k,w in WEIGHTS.items()}
    failures=[];warnings=[]
    t=terrain
    if t.get('available'):
        if t['slope_max_deg']>limits.max_slope_deg: failures.append('Measured maximum neighbourhood slope exceeds the configured limit.')
        if t['roughness_m']>limits.max_roughness_m: failures.append('Measured detrended roughness exceeds the configured limit.')
        if t['relief_m']>limits.max_relief_m: failures.append('Measured neighbourhood relief exceeds the configured limit.')
        if t['resolution_m']<=limits.max_resolution_m:
            slope=clamp(100*(limits.max_slope_deg-t['slope_p95_deg'])/(limits.max_slope_deg-limits.good_slope_deg))
            rough=clamp(100*(1-t['roughness_m']/limits.max_roughness_m))
            relief=clamp(100*(1-t['relief_m']/limits.max_relief_m))
            penalty=limits.hazard_penalty*hazards['value'] if hazards.get('available') else 0
            factors['T'].update(score=clamp(.6*slope+.25*rough+.15*relief-penalty),quality='topographic screening; hazards incomplete' if not hazards.get('available') else 'topography plus mapped hazards',
                explanation='60% slope component + 25% detrended roughness + 15% relief, minus configured hazard penalty × mapped hazard fraction. Missing hazards are not assumed absent; T and overall score remain provisional.',source=t['source'])
        else:
            reason = f"The terrain raster has {t['resolution_m']:g} m pixels. The configured limit is {limits.max_resolution_m:g} m."
            factors['T']['explanation'] = reason
            warnings.append(reason)
    else:
        factors['T']['explanation'] = (
            'Terrain scoring requires a complete local elevation window for slope, roughness and relief. '
            + t.get('reason', 'A valid terrain window is unavailable.')
        )
        warnings.append('Terrain safety cannot be evaluated without valid neighbourhood coverage.')
    if hazards.get('available') and hazards['value']>limits.max_hazard_fraction:
        failures.append('Mapped hazard fraction exceeds the configured limit.')
    if not hazards.get('available'): warnings.append('Boulder/crater hazards have not been comprehensively mapped for this point.')
    if geometry.get('available'):
        for key,field in [('S','sun_visible_pct'),('C','earth_visible_pct')]:
            factors[key].update(score=clamp(geometry['metrics'][field]),quality=geometry['mode'],source={'source_url':geometry['source_url'],'name':'JPL Horizons lunar surface observer'},
                explanation='Duration-weighted percentage of mission intervals with body centre above terrain horizon.' if geometry['mode']=='terrain_screened' else 'Duration-weighted percentage above reference tangent plane. Terrain obstruction unknown; geometric screening only.')
    else: warnings.append(geometry.get('reason','Horizons unavailable.'))
    if thermal.get('available'):
        lo,hi=thermal['minimum_k'],thermal['maximum_k']
        value=100. if lo==hi and limits.min_temperature_k<=lo<=limits.max_temperature_k else 0. if lo==hi else clamp(100*max(0,min(hi,limits.max_temperature_k)-max(lo,limits.min_temperature_k))/(hi-lo))
        factors['H'].update(score=value,quality='historical seasonal range proxy',source=thermal['source'],
            explanation='100 × length of overlap between observed seasonal min–max range and operating range / observed range width. Not time-in-range, mission temperature prediction or equipment thermal modelling.')
        if lo<limits.min_temperature_k or hi>limits.max_temperature_k: warnings.append('Historical seasonal temperature range extends outside configured operating limits; mission thermal modelling is required.')
    if ice.get('available'):
        factors['I'].update(score=clamp(100*ice['value']),quality=ice['source']['interpretation'],source=ice['source'],
            explanation='100 × registered mapped ice-evidence or PSR fraction. PSR is a resource-potential proxy, not confirmed ice abundance, accessibility or safety.')
    else:
        reason = ice.get('reason')
        factors['I']['explanation'] = (
            'The site has no validated ice or permanently shadowed region layer configured for scoring.'
            if reason == 'ice product is not configured.' else
            'A validated ice or permanently shadowed region measurement is needed at this point.'
            + (f' {reason}' if reason else '')
        )
    available=sum(v['weight'] for v in factors.values() if v['score'] is not None)
    missing=[k for k,v in factors.items() if v['score'] is None]
    provisional=bool(missing or not hazards.get('available') or geometry.get('mode')!='terrain_screened' or thermal.get('available') or ice.get('source',{}).get('interpretation')=='psr_fraction')
    for f in factors.values():
        f['effective_weight']=f['weight']/available if available and f['score'] is not None else 0
        if f['score'] is not None: f['contribution']=f['score']*f['effective_weight']
    return {'factors':factors,'score':sum(f['contribution'] or 0 for f in factors.values()) if available else None,
            'available_weight':available,'missing':missing,'provisional':provisional,'constraints_failed':failures,'warnings':warnings,
            'safety_status':'fails_configured_limits' if failures else 'not_established',
            'formula':'0.35T + 0.25S + 0.20C + 0.15H + 0.05I; available weights renormalized for provisional scores only.'}

def research(request):
    mission=request.mission;limits=request.limits
    t=rasters.local_terrain(mission,limits.radius_m)
    observer_height={'available':True,'value':t['elevation_m'],'source':t['source']} if t.get('available') else rasters.measurement('horizon_dem',mission)
    screening=rasters.horizon(mission,observer_height['value']) if observer_height.get('available') else {'available':False,'profile':None,'reason':'Observer terrain height unavailable.'}
    hazards=rasters.measurement('hazards',mission);ice=rasters.measurement('ice',mission)
    lo=rasters.measurement('temperature_min',mission);hi=rasters.measurement('temperature_max',mission)
    thermal={'available':False,'minimum':lo,'maximum':hi}
    if lo['available'] and hi['available'] and lo['value']<=hi['value'] and lo['source'].get('observation_period')==hi['source'].get('observation_period'):
        thermal.update(available=True,minimum_k=lo['value'],maximum_k=hi['value'],source=lo['source'])
    try:
        geometry=surface_observations(mission,observer_height['value'] if observer_height.get('available') else 0)
        for row in geometry['series']:
            profile=screening['profile']
            for body in ['sun','earth']:
                row[body+'_horizon_deg']=float(np.interp(row[body+'_azimuth']%360,[p['azimuth'] for p in profile]+[360],[p['elevation'] for p in profile]+[profile[0]['elevation']]))+(mission.clearance_deg if body=='earth' else 0) if profile else None
            row['sun_visible']=visible(row['sun_elevation'],row['sun_azimuth'],screening['profile'])
            row['earth_visible']=visible(row['earth_elevation'],row['earth_azimuth'],screening['profile'],mission.clearance_deg)
            row['simultaneous']=row['sun_visible'] and row['earth_visible']
        geometry.update(available=True,mode='terrain_screened' if screening['available'] else 'reference_geometry_only',metrics=metrics(geometry['series']))
        rows=[dict(r,dt=datetime.fromisoformat(r['time'])) for r in geometry['series']]
        geometry['sunlight_windows']=windows(rows,[r['sun_visible'] for r in rows])
        geometry['earth_windows']=windows(rows,[r['earth_visible'] for r in rows])
        geometry['sunlight_hours']=sum(w['hours'] for w in geometry['sunlight_windows'])
    except HorizonsUnavailable as exc:
        geometry={'available':False,'reason':str(exc)}
    return {'mission':mission.model_dump(mode='json'),'limits':limits.model_dump(),'terrain':t,'horizon':screening,'observer_height':observer_height,
            'geometry':geometry,'temperature':thermal,'hazards':hazards,'ice':ice,
            **score_factors(t,geometry,thermal,hazards,ice,limits),
            'limitations':['Research ranking only; never a NASA landing certification or a safe-site recommendation.',
                'Visibility is not a power model or communication link budget. Horizons uses apparent airless body centres; finite body disks and eclipses are excluded.',
                'Sampling uses left endpoints; transition timing is uncertain by one interval per boundary. Before 1962 Horizons UT is UT1; future leap seconds are unknown.',
                'DEM and observation frame alignment must be checked for mission use; finite horizon rays exclude distant and subpixel obstruction.']}

@router.post('/evaluate')
def evaluate(request:ResearchRequest):
    # Bound work and keep cold requests within web-proxy timeouts.
    if (request.mission.end-request.mission.start).total_seconds()/60/request.mission.interval_minutes>400:
        raise HTTPException(422,'Research evaluation allows 400 intervals per site. Increase the time step.')
    return research(request)

@router.get('/terrain')
def terrain(latitude:float=Query(ge=-90,le=90),longitude:float=Query(ge=-180,le=180),radius_m:int=Query(default=100,ge=25,le=500)):
    """Bounded local raster window; no Horizons requests or scientific downloads."""
    location=Location(latitude=latitude,longitude=longitude)
    local=rasters.local_terrain(location,radius_m)
    elevation={'available':True,'value':local['elevation_m'],'source':local['source']} if local.get('available') else rasters.measurement('horizon_dem',location)
    return {'location':location.model_dump(),'radius_m':radius_m,'terrain':local,'regional_elevation':elevation,
            'coordinate_note':'Diagnostic offsets follow projected raster axes, centred on the nearest pixel; grid up is not necessarily geographic north.',
            'limitations':['Elevation is metres above the 1737400 m lunar reference sphere in MOON_ME/DE421.',
                'Slope, relief and detrended roughness use the native-resolution neighbourhood; the displayed grid is subsampled.',
                'Regional elevation alone cannot establish footprint slope or landing safety. No horizon or hazard assessment is implied.']}

@router.get('/datasets')
def datasets():
    return {'datasets':rasters.status(),'preparation_command':'python scripts/prepare_lunar_research.py',
            'documentation_url':'https://github.com/xiangen-coder/nasa/blob/public-preview/docs/LUNAR_RESEARCH.md',
            'regions':[{'name':n,'source_url':'https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/',
                        'published':'2022-08-19','type':'official historical candidate region; no touchdown coordinate supplied'} for n in ['Faustini Rim A','Peak Near Shackleton','Connecting Ridge','Connecting Ridge Extension','de Gerlache Rim 1','de Gerlache Rim 2','de Gerlache-Kocher Massif','Haworth','Malapert Massif','Leibnitz Beta Plateau','Nobile Rim 1','Nobile Rim 2','Amundsen Rim']],
            'reference_points':[{'name':'Connecting Ridge DEM centre (research point)','latitude':-89.463162834,'longitude':-137.489552922,'description':'Derived centre of NASA PGDA Site01 raster, not an official touchdown point.','id':'pgda-site01-centre'}]}

# Bounded cached imagery proxy. Only fixed, verified Lunaserv layers; no arbitrary URL input.
IMAGE_LOCK=Lock();IMAGE_CACHE={}
@router.get('/imagery')
def imagery(latitude:float=Query(ge=-90,le=-85.5),longitude:float=Query(ge=-180,le=180),layer:Literal['nac','psr']='nac',span_m:int=Query(default=4000,ge=1000,le=20000)):
    if not math.isfinite(latitude+longitude): raise HTTPException(422,'Finite coordinates required.')
    from pyproj import CRS,Transformer
    from .terrain import GEO
    crs=CRS.from_proj4('+proj=stere +lat_0=-90 +lon_0=0 +R=1737400 +units=m')
    x,y=Transformer.from_crs(GEO,crs,always_xy=True).transform(longitude,latitude)
    params={'SERVICE':'WMS','VERSION':'1.1.1','REQUEST':'GetMap','LAYERS':'luna_nac_sp_mosaic' if layer=='nac' else 'luna_nac_pole_psr_south',
            'STYLES':'','SRS':'IAU2000:30120','BBOX':f'{x-span_m/2},{y-span_m/2},{x+span_m/2},{y+span_m/2}', 'WIDTH':'512','HEIGHT':'512','FORMAT':'image/png'}
    key=urlencode(params)
    with IMAGE_LOCK:
        cached=IMAGE_CACHE.get(key)
        if cached and cached[0]>time.time()-86400: return Response(cached[1],media_type='image/png',headers={'Cache-Control':'public,max-age=86400'})
    try:
        with httpx.Client(timeout=30) as client:
            with client.stream('GET','https://wms.im-ldi.com/',params=params) as response:
                response.raise_for_status();raw=bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw)>4_000_000: raise ValueError('Image too large')
        if not raw.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('No PNG image returned')
        with IMAGE_LOCK:
            if len(IMAGE_CACHE)>=32: IMAGE_CACHE.pop(next(iter(IMAGE_CACHE)))
            IMAGE_CACHE[key]=(time.time(),bytes(raw))
        return Response(bytes(raw),media_type='image/png',headers={'Cache-Control':'public,max-age=86400'})
    except (httpx.HTTPError,ValueError) as exc: raise HTTPException(503,'LROC preview unavailable; use the source viewer.') from exc
