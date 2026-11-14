"""Transparent first-version research ranking; never a landing certification."""
import json
import math
import os
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
WEIGHTS={'T':35/85,'S':25/85,'C':20/85,'I':5/85}
NAMES={'T':'Terrain safety','S':'Sunlight availability','C':'Earth communication','I':'Water ice potential'}

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


class ResearchAreaRequest(ResearchRequest):
    radius_m: int = Field(ge=250, le=20000)
    focus: Literal["overall", "T", "S", "C", "I"] = "overall"

def clamp(x): return max(0.,min(100.,float(x)))

def score_factors(terrain,geometry,hazards,ice,limits):
    factors={k:{'name':NAMES[k],'weight':w,'score':None,'contribution':None,'quality':'unavailable','explanation':'No supported measurement.'} for k,w in WEIGHTS.items()}
    failures=[];warnings=[]
    t=terrain
    regional=t.get('coverage_type')=='regional'
    if t.get('regional_only'):
        factors['T']['explanation'] = 'Regional slope, roughness and relief are available. Detailed landing scoring requires finer coverage.'
    elif t.get('available'):
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
            if regional:
                factors['T']['quality']='regional DEM screening'
                factors['T']['explanation']+=f" Regional screening uses {t['resolution_m']:g} m pixels; finer hazards and footprint slopes are unresolved."
            if t.get('preliminary_only'):
                factors['T']['quality'] = 'preliminary Kaguya screening'
                factors['T']['explanation'] += ' ' + t['source']['quality']
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
                explanation='Duration-weighted percentage of mission intervals with body centre above the sampled terrain horizon. Subpixel obstructions are unresolved.' if geometry['mode'].endswith('terrain_screened') else 'Duration-weighted percentage above reference tangent plane. Terrain obstruction unknown; geometric screening only.')
    else: warnings.append(geometry.get('reason','Horizons unavailable.'))
    if ice.get('available'):
        factors['I'].update(score=clamp(100*ice['value']),quality=ice['source']['interpretation'],source=ice['source'],
            explanation='100 × registered mapped ice-evidence or PSR fraction. PSR is a resource-potential proxy, not confirmed ice abundance, accessibility or safety.')
        if 'radius_m' in ice:
            factors['I']['explanation']=(
                f"{100 * ice['value']:.1f}% of sampled pixels within {ice['radius_m']:g} m "
                "are mapped in permanent shadow by NASA LOLA. This is a cold-trap proxy; ice presence and abundance remain unverified."
            )
        elif ice['source']['interpretation'] == 'psr_pixel':
            classification = 'mapped in permanent shadow' if ice['value'] else 'outside mapped permanent shadow'
            factors['I']['explanation'] = (
                f"The selected {ice['source']['resolution_m']:g} m LOLA map pixel is {classification}. "
                'The classification is a regional indicator of cold-trap potential. Ice presence is unknown.'
            )
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
    provisional=bool(regional or missing or not hazards.get('available') or geometry.get('mode')!='terrain_screened' or ice.get('source',{}).get('interpretation') in ('psr_fraction', 'psr_pixel'))
    # A terrain measurement alone does not support a mission score.
    has_visibility = factors['S']['score'] is not None and factors['C']['score'] is not None
    for f in factors.values():
        f['effective_weight']=f['weight']/available if has_visibility and f['score'] is not None else 0
        if has_visibility and f['score'] is not None: f['contribution']=f['score']*f['effective_weight']
    return {'factors':factors,'score':sum(f['contribution'] or 0 for f in factors.values()) if has_visibility else None,
            'available_weight':available,'missing':missing,'provisional':provisional,'constraints_failed':failures,'warnings':warnings,
            'safety_status':'fails_configured_limits' if failures else 'not_established',
            'formula':'(35T + 25S + 20C + 5I) / 85; available weights renormalized for provisional scores. Temperature is displayed as historical evidence.'}

def regional_slope_score(terrain, limits):
    """Use the configured slope preference for a standalone regional score."""
    if not terrain.get('regional_only') or terrain['resolution_m'] > 60:
        return terrain
    slope = terrain['slope_p95_deg']
    score = clamp(100 * (limits.max_slope_deg - slope) /
                  (limits.max_slope_deg - limits.good_slope_deg))
    return {**terrain, 'regional_score': score}


def research(request, *, deadline=None, allow_remote=True):
    mission=request.mission;limits=request.limits
    terrain_options = {} if allow_remote else {'allow_remote': False}
    t=rasters.local_terrain(mission,limits.radius_m,allow_regional=True,**terrain_options)
    t = regional_slope_score(t, limits)
    observer_height = rasters.site_elevation(mission, t)
    hazards=rasters.measurement('hazards',mission);ice=rasters.ice_evidence(mission,limits.radius_m)
    thermal=rasters.temperature_range(mission)
    screening = rasters.horizon(mission, None, **terrain_options)
    observer_height = screening.pop('observer_height', observer_height)
    broad_horizon = screening.get('quality') in ('global', 'regional')
    try:
        height = observer_height['value'] if observer_height.get('available') else 0
        geometry = (surface_observations(mission, height) if deadline is None
                    else surface_observations(mission, height, deadline=deadline))
        for row in geometry['series']:
            profile=screening['profile']
            for body in ['sun','earth']:
                row[body+'_horizon_deg']=float(np.interp(row[body+'_azimuth']%360,[p['azimuth'] for p in profile]+[360],[p['elevation'] for p in profile]+[profile[0]['elevation']]))+(mission.clearance_deg if body=='earth' else 0) if profile else None
            row['sun_visible']=visible(row['sun_elevation'],row['sun_azimuth'],screening['profile'])
            row['earth_visible']=visible(row['earth_elevation'],row['earth_azimuth'],screening['profile'],mission.clearance_deg)
            row['simultaneous']=row['sun_visible'] and row['earth_visible']
        mode = 'broad_terrain_screened' if broad_horizon else 'terrain_screened' if screening['available'] else 'reference_geometry_only'
        geometry.update(available=True,mode=mode,metrics=metrics(geometry['series']))
        rows=[dict(r,dt=datetime.fromisoformat(r['time'])) for r in geometry['series']]
        geometry['sunlight_windows']=windows(rows,[r['sun_visible'] for r in rows])
        geometry['earth_windows']=windows(rows,[r['earth_visible'] for r in rows])
        geometry['sunlight_hours']=sum(w['hours'] for w in geometry['sunlight_windows'])
    except HorizonsUnavailable as exc:
        geometry={'available':False,'reason':str(exc)}
    assessment = score_factors(t,geometry,hazards,ice,limits)
    if broad_horizon and not t['available']:
        resolution = screening['source']['resolution_m']
        assessment['factors']['T']['explanation'] = (
            f'The {resolution:g} m elevation layer supports surrounding-terrain screening. '
            f'Footprint scoring requires a complete local window with pixels at most {limits.max_resolution_m:g} m.'
        )
    return {'mission':mission.model_dump(mode='json'),'limits':limits.model_dump(),'terrain':t,'horizon':screening,'observer_height':observer_height,
            'geometry':geometry,'temperature':thermal,'hazards':hazards,'ice':ice,
            **assessment,
            'limitations':['Research ranking only; never a NASA landing certification or a safe-site recommendation.',
                'Visibility is not a power model or communication link budget. Horizons uses apparent airless body centres; finite body disks and eclipses are excluded.',
                'Sampling uses left endpoints; transition timing is uncertain by one interval per boundary. Before 1962 Horizons UT is UT1; future leap seconds are unknown.',
                'DEM and observation frame alignment must be checked for mission use; finite horizon rays exclude distant and subpixel obstruction.']}

def check_research_intervals(request:ResearchRequest):
    # Bound work and keep cold requests within web-proxy timeouts.
    if (request.mission.end-request.mission.start).total_seconds()/60/request.mission.interval_minutes>400:
        raise HTTPException(422,'Research evaluation allows 400 intervals per site. Increase the time step.')

@router.post('/evaluate')
def evaluate(request:ResearchRequest):
    check_research_intervals(request)
    return research(request)

@router.post('/plan-b')
def evaluate_plan_b(request:ResearchRequest):
    check_research_intervals(request)
    return plan_b_outcome(research(request))


def plan_b_outcome(result):
    if 'status' in result:
        return result
    if not result['geometry']['available']:
        return {'status':'unavailable', 'reasons':[result['geometry']['reason']]}
    return {'status':'evaluated', 'result':result}


def candidate_radii(maximum, *, include_nearby):
    radii = {maximum / 3, maximum * 2 / 3, maximum}
    if include_nearby:
        radii.update(radius for radius in (500, 1000, 2000) if radius < maximum)
    return sorted(radii)


def radial_candidate(centre, radius, bearing, name):
    lon, lat, _ = rasters.GEOD.fwd(centre.longitude, centre.latitude, bearing, radius)
    return centre.model_copy(update={"latitude": lat, "longitude": lon, "name": name})


@router.post('/research-area')
def find_research_area(request: ResearchAreaRequest):
    from .water_evidence import research_shadow

    check_research_intervals(request)
    centre = request.mission
    candidates = [centre]
    # Visit all rings early so a timed-out search can still include distant sites.
    radii = candidate_radii(request.radius_m, include_nearby=True)
    for bearing in (0, 180, 90, 270, 45, 225, 135, 315):
        for radius in radii:
            candidate = radial_candidate(centre, radius, bearing, f"Candidate {bearing}° / {radius:.0f} m")
            distance = rasters.GEOD.inv(
                centre.longitude, centre.latitude, candidate.longitude, candidate.latitude,
            )[2]
            if distance <= request.radius_m + 1e-6:
                candidates.append(candidate)

    counts = dict(evaluated=0, limits=0, missing=0, unavailable=0, focus_missing=0)
    assessed = []
    reasons = set()
    deadline = time.monotonic() + 65
    for candidate in candidates:
        if time.monotonic() >= deadline:
            counts["unavailable"] += 1
            reasons.add("The search time limit was reached before all points could be evaluated.")
            continue
        result = research(
            ResearchRequest(mission=candidate, limits=request.limits),
            deadline=min(deadline, time.monotonic() + 12),
            allow_remote=False,
        )
        if result["score"] is None:
            counts["missing"] += 1
            continue
        counts["evaluated"] += 1
        assessed.append((candidate, result))

    distances = [None] * len(assessed)
    if request.focus == "I" and assessed:
        distances = research_shadow(
            centre.latitude, centre.longitude, request.radius_m, [site for site, _ in assessed],
        )["distances_m"]
        counts["focus_missing"] = sum(distance is None for distance in distances)
    ranked = [(result, distance) for (_, result), distance in zip(assessed, distances)]

    def ranking(item):
        result, distance = item
        overall = result["score"] if result["score"] is not None else -1
        if request.focus == "I":
            return (-distance if distance is not None else float("-inf")), overall
        if request.focus == "overall":
            return overall, overall
        factor = result["factors"][request.focus]["score"]
        return (factor if factor is not None else -1), overall

    ranked.sort(key=ranking, reverse=True)
    results = [result for result, _ in ranked[:5]]
    recommended = bool(results)
    return {
        "counts": counts,
        "sampled": len(candidates),
        "sampling": {"radii_m": radii, "points_per_ring": 8},
        "recommended": recommended,
        "results": results,
        "reasons": sorted(reasons),
    }

@router.get('/terrain')
def terrain(latitude:float=Query(ge=-90,le=90),longitude:float=Query(ge=-180,le=180),radius_m:int=Query(default=100,ge=25,le=500)):
    """Bounded local raster window; no Horizons requests or scientific downloads."""
    location=Location(latitude=latitude,longitude=longitude)
    local=rasters.local_terrain(location,radius_m,allow_regional=True)
    local = regional_slope_score(local, Limits(radius_m=radius_m))
    elevation = rasters.site_elevation(location, local)
    return {'location':location.model_dump(),'radius_m':radius_m,'terrain':local,'regional_elevation':elevation,
            'coordinate_note':'Diagnostic offsets follow projected raster axes, centred on the nearest pixel; grid up is not necessarily geographic north.',
            'limitations':['Elevation is metres above the 1737400 m lunar reference sphere in MOON_ME/DE421.',
                'Slope, relief and detrended roughness use the assessment raster grid; the displayed grid is subsampled.',
                'Regional slope and roughness screen the wider neighbourhood. Footprint-scale and subpixel hazards require finer data.']}

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
