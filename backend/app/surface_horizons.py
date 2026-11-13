"""Airless lunar topocentric observer tables; separate from legacy SPICE results."""
import csv
import hashlib
import io
import json
import math
import os
import re
import sqlite3
import time
from datetime import timedelta
from pathlib import Path
import httpx
from .astronomy import ENDPOINT, QUERY_LOCK, julian, HorizonsUnavailable
from .science import ROOT

AU_KM = 149597870.7

def epochs(mission):
    times = [mission.start]
    while times[-1] < mission.end:
        times.append(min(times[-1] + timedelta(minutes=mission.interval_minutes), mission.end))
    return times

def parse_observer(payload, times, target, location, height):
    if not isinstance(payload,dict) or not isinstance(payload.get('result'),str):
        raise HorizonsUnavailable('NASA returned an invalid observation response.')
    text = payload.get('result', '')
    if payload.get('error') or '$$SOE' not in text or '$$EOE' not in text:
        raise HorizonsUnavailable('Horizons did not return a surface observation table; check supported dates or retry.')
    head, table = text.split('$$SOE', 1)
    if not (re.search(r'Target body name:.*?\(' + target + r'\)', head)
            and re.search(r'Center body name:\s*Moon \(301\)', head)
            and 'NO (AIRLESS)' in head and 'JDUT' in head
            and '1-way_down_LT' in head and '149597870.7' in head):
        raise HorizonsUnavailable('Unexpected Horizons target, centre, units or airless observation metadata.')
    site = re.search(r'Center geodetic\s*:\s*([^\n{]+)', head)
    try:
        lon, lat, alt = [float(v) for v in site.group(1).strip().split(',')]
        if abs((lon-location.longitude+180)%360-180) > 1e-4 or abs(lat-location.latitude)>1e-4 or abs(alt-height/1000)>1e-4:
            raise ValueError('site mismatch')
    except (ValueError, AttributeError) as exc:
        raise HorizonsUnavailable('Horizons observer coordinates did not match the selected site.') from exc
    raw = list(csv.reader(io.StringIO(table.split('$$EOE')[0].strip())))
    if len(raw) != len(times):
        raise HorizonsUnavailable('Incomplete surface observation time series.')
    result = []
    for row, epoch in zip(raw, times):
        try:
            jd, az, el, au, lt = [float(row[i]) for i in (1,4,5,6,8)]
            if not all(math.isfinite(v) for v in (jd,az,el,au,lt)) or abs(jd-julian(epoch))>1e-7 or not 0<=az<=360 or not -90<=el<=90 or au<=0 or lt<=0:
                raise ValueError('Invalid sample')
            if abs(au*AU_KM/299792.458-lt*60)>0.05:
                raise ValueError('Range/light-time unit mismatch')
            result.append({'azimuth':az,'elevation':el,'distance_km':au*AU_KM,'light_time_seconds':lt*60})
        except (ValueError, IndexError) as exc:
            raise HorizonsUnavailable('Malformed surface observation sample.') from exc
    pole = re.search(r'Center pole/equ\s*:\s*([^\n{]+)',head)
    source = re.search(r'Target body name:.*?\{source:\s*([^}]+)',head)
    return result, {'orientation':pole.group(1).strip() if pole else 'Unknown', 'ephemeris':source.group(1).strip() if source else 'Unknown'}

def surface_observations(mission, height=0, *, deadline=None):
    times = epochs(mission)
    # Bounded epoch batches include the final endpoint, even for partial intervals.
    identity = {'version':'surface-1','latitude':mission.latitude,'longitude':mission.longitude,
                'start':mission.start.isoformat(),'end':mission.end.isoformat(), 'step':mission.interval_minutes,'height':height}
    key = hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()
    path = Path(os.getenv('CACHE_PATH', str(ROOT/'data/cache.sqlite')))
    path.parent.mkdir(parents=True,exist_ok=True)
    def connection():
        db=sqlite3.connect(path,timeout=30)
        db.execute('CREATE TABLE IF NOT EXISTS surface_horizons (key TEXT PRIMARY KEY, created REAL, result TEXT)')
        return db
    with connection() as db:
        row=db.execute('SELECT result FROM surface_horizons WHERE key=? AND created>?',(key,time.time()-86400)).fetchone()
    if row:
        return dict(json.loads(row[0]), cached=True)
    if not QUERY_LOCK.acquire(timeout=2):
        raise HorizonsUnavailable('NASA request queue is busy. Please retry shortly.')
    try:
        series=[{'time':t.isoformat()} for t in times]
        sources={}
        deadline=min(deadline or float("inf"), time.monotonic()+110)
        with httpx.Client(timeout=httpx.Timeout(50,connect=10),follow_redirects=False) as client:
            for body,target in [('sun','10'),('earth','399')]:
                values=[]
                # TLIST batches bound URL length, also support nonaligned end instants.
                for start in range(0,len(times),32):
                    batch=times[start:start+32]
                    params={'format':'json','COMMAND':f"'{target}'",'OBJ_DATA':"'NO'",'MAKE_EPHEM':"'YES'",
                            'EPHEM_TYPE':"'OBSERVER'",'CENTER':"'coord@301'",'COORD_TYPE':"'GEODETIC'",
                            'SITE_COORD':f"'{mission.longitude},{mission.latitude},{height/1000}'",
                            'TLIST':','.join(f"'{julian(t):.9f}'" for t in batch),'TLIST_TYPE':"'JD'",
                            'QUANTITIES':"'4,20,21'",'CSV_FORMAT':"'YES'",'CAL_FORMAT':"'BOTH'",
                            'CAL_TYPE':"'GREGORIAN'",'TIME_DIGITS':"'FRACSEC'",'TIME_TYPE':"'UT'",
                            'APPARENT':"'AIRLESS'",'ANG_FORMAT':"'DEG'",'EXTRA_PREC':"'YES'"}
                    remaining=deadline-time.monotonic()
                    if remaining<=0: raise HorizonsUnavailable('NASA request budget exceeded. Use fewer intervals or retry later.')
                    with client.stream('GET',ENDPOINT,params=params,timeout=min(45,remaining)) as response:
                        response.raise_for_status()
                        raw=bytearray()
                        for chunk in response.iter_bytes():
                            raw.extend(chunk)
                            if len(raw)>2_000_000:
                                raise HorizonsUnavailable('NASA surface response exceeded size limit.')
                    parsed, source=parse_observer(json.loads(raw),batch,target,mission,height)
                    if body in sources and sources[body]!=source:
                        raise HorizonsUnavailable('NASA models changed during the request; retry.')
                    values.extend(parsed); sources[body]=source
                for row,value in zip(series,values):
                    row.update({f'{body}_{k}':v for k,v in value.items()})
        result={'series':series,'sources':sources,'cached':False,'observer_height_m':height,
                'source_url':'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
                'retrieved_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        with connection() as db:
            db.execute('INSERT OR REPLACE INTO surface_horizons VALUES (?,?,?)',(key,time.time(),json.dumps(result)))
            db.execute('DELETE FROM surface_horizons WHERE key NOT IN (SELECT key FROM surface_horizons ORDER BY created DESC LIMIT 96)')
        return result
    except (httpx.HTTPError, ValueError) as exc:
        raise HorizonsUnavailable('NASA surface observations unavailable. No substitute geometry was generated.') from exc
    finally:
        QUERY_LOCK.release()
