"""Spacecraft-assumption screening and bounded local backup search."""


from fastapi import APIRouter,HTTPException

from pydantic import BaseModel,Field,ConfigDict,model_validator

from .landing_research import ResearchRequest, candidate_radii, radial_candidate, research, score_factors

from . import lunar_rasters as rasters

from .lunar_uncertainty import uncertainty



router=APIRouter(prefix='/api/reliability',tags=['Landing reliability'])

class Vehicle(BaseModel):

    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)

    name:str=Field(default='Apollo Lunar Module — historical reference',max_length=100,min_length=1)

    diameter_m:float=Field(default=9.4488,gt=0,le=100)

    landing_dispersion_m:float=Field(default=50,ge=0,le=400)

    rms_multiplier:float=Field(default=2,ge=0,le=4)

    search_radius_m:float=Field(default=500,ge=100,le=2000)

    diversion_range_m:float|None=Field(default=None,gt=0,le=10000)

    battery_wh:float|None=Field(default=None,gt=0,le=1e8)

    load_w:float|None=Field(default=None,gt=0,le=1e7)

    reserve_fraction:float=Field(default=.2,ge=0,lt=1)

    @model_validator(mode='after')

    def paired(self):

        if (self.battery_wh is None)!=(self.load_w is None):raise ValueError('Provide battery capacity and load together, or leave both blank.')

        return self

class ReliabilityRequest(ResearchRequest):

    vehicle:Vehicle=Field(default_factory=Vehicle)



def screened(location,limits,vehicle):

    radius=max(limits.radius_m,vehicle.landing_dispersion_m+vehicle.diameter_m/2)

    if radius>500:raise HTTPException(422,'Footprint plus radial position uncertainty exceeds the supported 500 m evaluation radius.')

    limits=limits.model_copy(update={'max_slope_deg':min(limits.max_slope_deg,12),'good_slope_deg':min(limits.good_slope_deg,5.999)})

    t=rasters.local_terrain(location,radius);u=uncertainty(location,radius);adjusted=dict(t)

    if t.get('available') and u['available']:

        se=u['layers']['slope_uncertainty']['maximum']*vehicle.rms_multiplier

        ze=u['layers']['height_uncertainty']['maximum']*vehicle.rms_multiplier

        adjusted.update(slope_mean_deg=min(90,t['slope_mean_deg']+se),slope_p95_deg=min(90,t['slope_p95_deg']+se),slope_max_deg=min(90,t['slope_max_deg']+se),roughness_m=t['roughness_m']+ze,relief_m=t['relief_m']+2*ze)

    hazards=rasters.measurement('hazards',location)

    nominal=score_factors(t,{},hazards,{},limits)

    conservative=score_factors(adjusted,{},hazards,{},limits)

    if adjusted.get('slope_mean_deg',0)>6:conservative['constraints_failed'].append('Apollo reference mean-slope limit of 6 degrees exceeded under sensitivity screen.')

    known=bool(t.get('available') and u['available'] and t['resolution_m']<=limits.max_resolution_m)

    return {'terrain':t,'uncertainty':u,'screening_radius_m':radius,'bounds':{k:adjusted.get(k) for k in ['slope_mean_deg','slope_p95_deg','slope_max_deg','roughness_m','relief_m']},

      'nominal_terrain_score':nominal['factors']['T']['score'],'margin_terrain_score':conservative['factors']['T']['score'] if known else None,

      'constraints_failed':conservative['constraints_failed'],'status':'insufficient_evidence' if not known else 'fails_available_terrain_checks' if conservative['constraints_failed'] else 'passes_available_terrain_checks',

      'hazards_available':hazards.get('available',False),'method':'Sensitivity screen: add multiplier × maximum published RMS slope error; add multiplier × maximum height RMS to roughness and twice that margin to relief. This is not a calibrated confidence interval or touchdown probability.'}



def alternatives(request,baseline,*,search_radius_m=None):

    v=request.vehicle
    radius_limit=v.search_radius_m if search_radius_m is None else search_radius_m
    maximum=min(radius_limit,v.diversion_range_m) if v.diversion_range_m is not None else radius_limit

    rows=[];inspection=[];unverified=[];rejected=0;outside=0;overlap=0

    # Include nearby footprints in the wider Plan B search as well as distant rings.
    radii = candidate_radii(maximum, include_nearby=search_radius_m is not None)
    for radius in radii:

        for azimuth in range(0,360,45):
            if radius<2*baseline['screening_radius_m']:overlap+=1;continue

            m = radial_candidate(request.mission, radius, azimuth, f'Backup terrain candidate {azimuth}° / {radius:.0f} m')

            a=screened(m,request.limits,v)

            if a['status']=='insufficient_evidence':
                outside+=1
                unverified.append((m,radius,a))
                continue

            if a['status']!='passes_available_terrain_checks':

                rejected+=1;inspection.append({'location':m.model_dump(mode='json'),'distance_m':radius,'assessment':a,'terrain_score_change':None if baseline['margin_terrain_score'] is None else a['margin_terrain_score']-baseline['margin_terrain_score'],'improvement_verified':False,'reachability':'Rejected by terrain sensitivity limits; inspection only, not a backup landing recommendation.'});continue

            score=a['margin_terrain_score'];base=baseline['margin_terrain_score']

            rows.append({'location':m.model_dump(mode='json'),'distance_m':radius,'azimuth_deg':azimuth,'assessment':a,

              'terrain_score_change':None if base is None else score-base,'improvement_verified':base is not None and score>base,

              'visibility_status':'not_evaluated_at_candidate','reachability':'within_user_supplied_distance_only; delta-v and descent dynamics unverified' if v.diversion_range_m is not None else 'unknown; no diversion range supplied'})

    inspection.sort(key=lambda r:-(r['assessment']['margin_terrain_score'] or 0))

    rows.sort(key=lambda r:(-r['assessment']['margin_terrain_score'],r['distance_m']))

    # Spatial separation avoids presenting almost identical footprints as independent backups.

    selected=distinct_candidates(rows,baseline['screening_radius_m'])
    exploration=[] if selected else exploration_candidates(unverified,baseline['screening_radius_m'],request.limits)
    comparison=[]
    if search_radius_m is not None and not selected and not exploration and unverified:
        # Keep the comparison useful where the terrain archive has gaps.
        # Pick spaced points from the sampled grid, without assigning a terrain score.
        around_centre=sorted(
            (row for row in unverified if not row[2]['constraints_failed']),
            key=lambda row: rasters.GEOD.inv(request.mission.longitude,request.mission.latitude,
                                           row[0].longitude,row[0].latitude)[0]%360,
        )
        indices=sorted({i*len(around_centre)//3 for i in range(3)}) if around_centre else []
        for index in indices:
            mission, distance, _=around_centre[index]
            comparison.append({
                'location': {**mission.model_dump(mode='json'),
                             'name': mission.name.replace('Backup terrain candidate','Nearby comparison point')},
                'distance_m': distance,
            })
    return {'searched':8*len(radii),'overlap_excluded':overlap,'outside_or_missing':outside,'failed_limits':rejected,'passing_terrain_candidates':len(rows),'candidates':selected,'inspection_candidates':inspection[:3] if not selected else [],
      'exploration_candidates':exploration,'search_radius_m':maximum,
      'comparison_candidates':comparison,

      'scope':'Local terrain shortlist only. Candidate lighting, thermal suitability, boulders, fuel, navigation and flight reachability must be checked independently. No candidate is a certified landing site.'}



def distinct_candidates(rows, screening_radius):
    selected = []
    for row in rows:
        point = row['location']
        if all(rasters.GEOD.inv(point['longitude'], point['latitude'], p['location']['longitude'],
                               p['location']['latitude'])[2] >= 2 * screening_radius for p in selected):
            selected.append(row)
        if len(selected) == 3:
            break
    return selected


def exploration_candidates(unverified, screening_radius, limits):
    """Nominal terrain comparisons for sites without enough Apollo evidence."""
    limits = limits.model_copy(update={'max_slope_deg': min(limits.max_slope_deg, 12),
                                       'good_slope_deg': min(limits.good_slope_deg, 5.999)})
    rows = []
    for mission, distance, assessment in unverified:
        terrain = assessment['terrain']
        if not terrain.get('available'):
            terrain = rasters.local_terrain(mission, screening_radius, allow_regional=True)
        if not terrain.get('available') or terrain['slope_mean_deg'] > 6:
            continue
        hazards = rasters.measurement('hazards', mission)
        nominal = score_factors(terrain, {}, hazards, {}, limits)
        score = nominal['factors']['T']['score']
        if score is None or nominal['constraints_failed']:
            continue
        rows.append({'location': {**mission.model_dump(mode='json'),
                                  'name': mission.name.replace('Backup terrain candidate', 'Terrain comparison point')},
                     'distance_m': distance, 'resolution_m': terrain['resolution_m'],
                     'slope_p95_deg': terrain['slope_p95_deg'], 'nominal_terrain_score': score})
    rows.sort(key=lambda row: (row['resolution_m'], -row['nominal_terrain_score'], row['distance_m']))
    return distinct_candidates(rows, screening_radius)


@router.post('/alternatives')
def shortlist(request:ReliabilityRequest):
    """Find local terrain candidates without calculating ephemerides."""
    request=request.model_copy(update={'limits':request.limits.model_copy(update={'max_slope_deg':min(request.limits.max_slope_deg,12),'good_slope_deg':min(request.limits.good_slope_deg,5.999)})})
    return alternatives(request,screened(request.mission,request.limits,request.vehicle))


class PlanBSiteRequest(ResearchRequest):
    search_radius_m: int = Field(default=20000, ge=250, le=20000)
    shadow_focus: bool = False
    score_only: bool = False


@router.post('/plan-b-sites')
def plan_b_sites(request:PlanBSiteRequest):
    """Apply the existing Apollo terrain shortlist at the Compare page radius."""
    if request.score_only:
        from .water_evidence import research_shadow

        # Bound the cross-product of locations and touchdown dates.
        locations = [radial_candidate(request.mission, request.search_radius_m * fraction, bearing,
                                      f"Candidate {bearing}° / {request.search_radius_m * fraction:.0f} m")
                     for fraction, bearing in ((1/3, 0), (2/3, 90), (1, 180), (2/3, 270))]
        distances = (research_shadow(request.mission.latitude, request.mission.longitude,
                                     request.search_radius_m, locations)["distances_m"]
                     if request.shadow_focus else [None] * len(locations))
        return {"candidates": [{"location": site.model_dump(mode="json"), "shadow_distance_m": distance}
                               for site, distance in zip(locations, distances)]}
    radius = request.search_radius_m
    shadow_focus = request.shadow_focus
    request=ReliabilityRequest(mission=request.mission, limits=request.limits)
    baseline=screened(request.mission,request.limits,request.vehicle)
    result=alternatives(request,baseline,search_radius_m=radius)
    if shadow_focus and result["candidates"]:
        from .water_evidence import research_shadow

        locations = [request.mission.model_copy(update=row["location"]) for row in result["candidates"]]
        shadow = research_shadow(request.mission.latitude, request.mission.longitude, radius, locations)
        for candidate, distance in zip(result["candidates"], shadow["distances_m"]):
            candidate["shadow_distance_m"] = distance
    for candidate in result['candidates']:
        candidate['bounds']=candidate['assessment']['bounds']
        candidate['screening_radius_m']=candidate['assessment']['screening_radius_m']
        del candidate['assessment']
    return result


@router.post('/assess')

def assess(request:ReliabilityRequest):

    if (request.mission.end-request.mission.start).total_seconds()/60/request.mission.interval_minutes>400:raise HTTPException(422,'Maximum 400 research intervals; increase the time step.')

    request=request.model_copy(update={'limits':request.limits.model_copy(update={'max_slope_deg':min(request.limits.max_slope_deg,12),'good_slope_deg':min(request.limits.good_slope_deg,5.999)})})

    baseline=screened(request.mission,request.limits,request.vehicle)

    base=research(request)

    robust_terrain=dict(baseline['terrain']);robust_terrain.update(baseline['bounds'])

    adjusted=score_factors(robust_terrain if baseline['uncertainty']['available'] else {},base['geometry'],base['hazards'],base['ice'],request.limits)

    if baseline['margin_terrain_score'] is None:adjusted['score']=None
    mitigation=[{'issue':'Footprint-scale evidence and regolith bearing capacity','adjustment':'Obtain sub-metre stereo topography, boulder inventory and soil bearing evidence. A 5 m regional DEM cannot validate Apollo footpad contact, 0.61 m surface irregularities or soil penetration.','status':'required'}, {'issue':'Visibility transition uncertainty','adjustment':f'Repeat visibility calculations with a smaller time step than the current {request.mission.interval_minutes} minutes; schedule operations with a buffer around sampled rise/set and blackout boundaries.','status':'required'},{'issue':'Unmapped subpixel boulders and craters','adjustment':'Review native-resolution imagery and obtain validated hazard maps before committing to a footprint.','status':'required'},

      {'issue':'Unknown diversion flight feasibility','adjustment':'Validate candidate coordinates against descent-state, delta-v, fuel reserve, navigation and abort constraints. Distance alone does not prove reachability.','status':'required'},

      {'issue':'Historical thermal composites','adjustment':'Validate a time-dependent spacecraft thermal model; plan heaters, insulation and thermal operating windows.','status':'required'}]

    if baseline['constraints_failed']:mitigation.append({'issue':'Terrain limits exceeded under the RMS sensitivity screen','adjustment':'Inspect the passing terrain shortlist; do not loosen spacecraft limits merely to improve the score.','status':'action_needed'})

    if not base['horizon']['available']:mitigation.append({'issue':'Terrain obstruction remains unknown','adjustment':'Obtain a wider compatible DEM covering every 20 km horizon ray; assess lighting and communication again.','status':'required'})

    energy=None

    if request.vehicle.battery_wh is not None:

        endurance=request.vehicle.battery_wh*(1-request.vehicle.reserve_fraction)/request.vehicle.load_w

        darkness=base['geometry'].get('metrics',{}).get('longest_darkness_hours')

        energy={'estimated_endurance_hours':endurance,'longest_sampled_darkness_hours':darkness,'margin_hours':None if darkness is None else endurance-darkness,

          'method':'Constant user-supplied load, usable battery after reserve; excludes ageing, heater transients, charging and thermal derating. Geometry may omit terrain shadow.'}

        mitigation.append({'issue':'Power reserve','adjustment':f'Estimated battery endurance {endurance:.2f} h. Compare with darkness windows, include heater loads/derating and preserve the configured reserve.','status':'requires_power_model'})

    return {'mission':request.mission.model_dump(mode='json'),'vehicle':request.vehicle.model_dump(),'applied_limits':request.limits.model_dump(),'apollo_reference':{'span_m':9.4488,'mean_slope_limit_deg':6,'effective_slope_limit_deg':12,'footprint_irregularity_limit_m':0.6096,'sources':['https://ntrs.nasa.gov/api/citations/19720018253/downloads/19720018253.pdf','https://science.nasa.gov/wp-content/uploads/2023/09/Apollo_12.pdf'],'caution':'Historical design reference. A 5 m DEM cannot verify 0.61 m footprint irregularities, footpad bearing capacity, touchdown velocities or polar flight suitability.'},'spacecraft_suitability':'unverified; Apollo terrain reference plus user mission assumptions',

      'baseline':baseline,'nominal_analysis':base,'margin_analysis':adjusted,'alternatives':alternatives(request,baseline),'mitigations':mitigation,'energy':energy}

