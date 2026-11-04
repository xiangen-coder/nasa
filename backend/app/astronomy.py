"""Bounded Horizons vector queries; independent of the landing-site SPICE model.

All body states share SSB origin, geometric J2000 ecliptic axes and km/s units.
No offline orbital model substitutes an unavailable Horizons response.
"""
import csv
import hashlib
import io
import json
import math
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import BaseModel, ConfigDict, field_validator
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix='/api/astronomy', tags=['Astronomical simulation'])
UTC = timezone.utc
ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api'
BODIES = {'sun': '10', 'earth': '399', 'moon': '301'}
QUERY_LOCK = Lock()  # Horizons requests are deliberately serialized.
VERSION = 'horizons-ssb-ecliptic-1'
MAX_BYTES = 2_000_000
ZONES = ('UTC', 'Asia/Kuala_Lumpur', 'Asia/Kolkata', 'Asia/Tokyo',
         'America/New_York', 'Europe/London', 'Australia/Sydney')


class AstronomyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    local_time: datetime
    timezone: Literal['UTC', 'Asia/Kuala_Lumpur', 'Asia/Kolkata', 'Asia/Tokyo',
                      'America/New_York', 'Europe/London', 'Australia/Sydney'] = 'UTC'
    window_days: Literal[2, 7, 30, 366] = 30
    include_paths: bool = True

    @field_validator('local_time')
    @classmethod
    def civil_time(cls, value):
        if value.tzinfo is not None:
            raise ValueError('Enter a local date/time without an offset and select its time zone.')
        if value.microsecond:
            raise ValueError('Time precision is one second; fractional seconds are not supported.')
        return value


class HorizonsUnavailable(Exception):
    pass


class HorizonsRangeError(Exception):
    pass


def utc_time(value, zone):
    try:
        tz = ZoneInfo(zone)
        a, b = value.replace(tzinfo=tz, fold=0), value.replace(tzinfo=tz, fold=1)
        converted = a.astimezone(UTC)
        if converted.astimezone(tz).replace(tzinfo=None) != value:
            raise ValueError('This local time does not exist during the daylight-saving transition. Select another time or UTC.')
        if a.utcoffset() != b.utcoffset():
            raise ValueError('This local time is ambiguous during the daylight-saving transition. Select UTC to identify the exact instant.')
        return converted
    except (OverflowError, ZoneInfoNotFoundError) as exc:
        raise ValueError('The time or time zone is outside the supported calendar.') from exc


def iso(value):
    return value.isoformat(timespec='seconds').replace('+00:00', 'Z')


def julian(value):
    # Proleptic Gregorian, avoiding platform timestamp limitations before 1970.
    return (value - datetime(2000, 1, 1, 12, tzinfo=UTC)).total_seconds() / 86400 + 2451545


def samples(center, days, intervals):
    values = []
    for i in range(intervals + 1):
        try:
            values.append(center + timedelta(seconds=round((i / intervals - .5) * days * 86400)))
        except OverflowError:
            continue
    return values


def parse_vectors(payload, times, body):
    """Reject wrong bodies, frames, origins, units, epochs and incomplete tables."""
    if not isinstance(payload, dict) or not isinstance(payload.get('result'), str):
        raise HorizonsUnavailable('NASA returned an invalid response object.')
    text = payload['result']
    if payload.get('error') or '$$SOE' not in text or '$$EOE' not in text:
        message = str(payload.get('error') or text)
        if re.search(r'(No ephemeris|outside.*(?:range|coverage)|Cannot output|out of range|before.*start|after.*end)', message, re.I):
            raise HorizonsRangeError('Horizons does not provide all requested dates for these bodies. Select a different date or shorter window.')
        raise HorizonsUnavailable('NASA could not generate the requested vector table. No substitute positions were generated.')
    header = text.split('$$SOE', 1)[0]
    checks = [f'({BODIES[body]})' in header.split('Center body name:')[0],
              bool(re.search(r'Center body name:\s*Solar System Barycenter \(0\)', header)),
              'Ecliptic of J2000.0' in header, bool(re.search(r'Output units\s*:\s*KM-S', header)),
              'GEOMETRIC' in header, 'JDUT' in header]
    if not all(checks):
        raise HorizonsUnavailable('NASA vector metadata did not match the required body, SSB origin, J2000 ecliptic frame, UT time or kilometre units.')
    table = text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip()
    rows = list(csv.reader(io.StringIO(table)))
    if len(rows) != len(times):
        raise HorizonsUnavailable('NASA returned an incomplete time series.')
    states = []
    for row, time in zip(rows, times):
        try:
            numbers = [float(x.replace('D', 'E')) for x in [row[0], *row[2:8]]]
            if len(numbers) != 7 or not all(math.isfinite(x) for x in numbers):
                raise ValueError('Invalid state')
            if abs(numbers[0] - julian(time)) > 1e-7:
                raise ValueError('Mismatched epoch')
        except (ValueError, IndexError) as exc:
            raise HorizonsUnavailable('NASA returned malformed or mismatched vector samples.') from exc
        states.append({'position_km': numbers[1:4], 'velocity_km_s': numbers[4:7]})
    source = re.search(r'Target body name:.*?\{source:\s*([^}]+)', header)
    return states, source.group(1).strip() if source else 'See Horizons response'


def fetch_batch(body, times):
    params = {'format': 'json', 'COMMAND': f"'{BODIES[body]}'", 'OBJ_DATA': "'NO'",
              'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'", 'CENTER': "'500@0'",
              'REF_SYSTEM': "'ICRF'", 'REF_PLANE': "'ECLIPTIC'", 'OUT_UNITS': "'KM-S'",
              'VEC_TABLE': "'2'", 'VEC_CORR': "'NONE'", 'CSV_FORMAT': "'YES'",
              'TIME_TYPE': "'UT'", 'TLIST_TYPE': "'JD'", 'CAL_TYPE': "'GREGORIAN'",
              'TIME_DIGITS': "'FRACSEC'",
              'TLIST': ','.join(f"'{julian(t):.9f}'" for t in times)}
    try:
        # Fixed endpoint only; no URL or proxy is accepted from the user.
        with httpx.Client(timeout=httpx.Timeout(45, connect=10), follow_redirects=False) as client:
            with client.stream('GET', ENDPOINT, params=params) as response:
                response.raise_for_status()
                raw = bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw) > MAX_BYTES:
                        raise HorizonsUnavailable('NASA response exceeded the size limit.')
        payload = json.loads(raw)
    except (httpx.HTTPError, ValueError) as exc:
        raise HorizonsUnavailable('NASA JPL Horizons is unavailable or timed out. Retry later; no artificial positions were substituted.') from exc
    return parse_vectors(payload, times, body)


def fetch_body(body, times):
    # Keep encoded GET URLs small enough for NASA gateways and local proxies.
    # No concurrent requests and no synthesized points between batches.
    states, source = [], None
    for offset in range(0, len(times), 32):
        batch, batch_source = fetch_batch(body, times[offset:offset + 32])
        if source is not None and source != batch_source:
            raise HorizonsUnavailable('NASA changed the source ephemeris during this query. Please retry.')
        states.extend(batch)
        source = batch_source
    return states, source


def subtract(a, b):
    return [x - y for x, y in zip(a, b)]


def norm(value):
    return math.sqrt(sum(x * x for x in value))


def geometry(states):
    sun, earth, moon = (states[b]['position_km'] for b in BODIES)
    ms, me = subtract(sun, moon), subtract(earth, moon)
    denominator = norm(ms) * norm(me)
    if denominator == 0:
        raise HorizonsUnavailable('Degenerate body geometry in the returned ephemeris.')
    cos_phase = max(-1, min(1, sum(a*b for a, b in zip(ms, me)) / denominator))
    fraction = (1 + cos_phase) / 2
    es, em = subtract(sun, earth), subtract(moon, earth)
    elongation = (math.atan2(em[1], em[0]) - math.atan2(es[1], es[0])) % (2*math.pi)
    angle = math.degrees(elongation)
    # Phase names are geometric categories, not an event-time prediction.
    if angle < 11.25 or angle >= 348.75:
        label = 'New Moon vicinity'
    elif angle < 78.75:
        label = 'Waxing crescent'
    elif angle < 101.25:
        label = 'First quarter vicinity'
    elif angle < 168.75:
        label = 'Waxing gibbous'
    elif angle < 191.25:
        label = 'Full Moon vicinity'
    elif angle < 258.75:
        label = 'Waning gibbous'
    elif angle < 281.25:
        label = 'Last quarter vicinity'
    else:
        label = 'Waning crescent'
    return {'earth_sun_km': norm(subtract(earth, sun)), 'earth_moon_km': norm(me),
            'moon_sun_km': norm(ms), 'moon_phase': {'label': label,
            'illuminated_fraction': fraction, 'phase_angle_deg': math.degrees(math.acos(cos_phase)),
            'geocentric_ecliptic_elongation_deg': angle}}


def calculate(request, cache_path):
    center = utc_time(request.local_time, request.timezone)
    animation = samples(center, request.window_days, 120)
    earth_path_times = samples(center, 366, 72) if request.include_paths else []
    # One ordered union is submitted for each body, so all vectors share epochs.
    times = sorted(set(animation + earth_path_times + [center]))
    identity = json.dumps([VERSION, [iso(t) for t in times]], separators=(',', ':'))
    key = hashlib.sha256(identity.encode()).hexdigest()
    cache_path = Path(cache_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if not QUERY_LOCK.acquire(timeout=2):
        raise HTTPException(429, 'Another Horizons query is in progress. Please retry shortly.', headers={'Retry-After': '5'})
    try:
        with sqlite3.connect(cache_path, timeout=30) as db:
            db.execute('CREATE TABLE IF NOT EXISTS astronomy_vectors (key TEXT PRIMARY KEY, created REAL NOT NULL, value TEXT NOT NULL)')
            row = db.execute('SELECT created, value FROM astronomy_vectors WHERE key=?', (key,)).fetchone()
            now = datetime.now(UTC)
            if row and now.timestamp() - row[0] < 86400:
                packed = json.loads(row[1])
                cached = True
            else:
                by_body, sources = {}, {}
                for body in BODIES:
                    by_body[body], sources[body] = fetch_body(body, times)
                packed = {'states': by_body, 'sources': sources, 'retrieved_at': iso(now)}
                db.execute('INSERT OR REPLACE INTO astronomy_vectors VALUES (?,?,?)', (key, now.timestamp(), json.dumps(packed)))
                # Bound storage without deleting the landing-analysis cache.
                db.execute('DELETE FROM astronomy_vectors WHERE key NOT IN (SELECT key FROM astronomy_vectors ORDER BY created DESC LIMIT 48)')
                cached = False
    finally:
        QUERY_LOCK.release()
    lookup = {t: i for i, t in enumerate(times)}
    def frame(t):
        states = {b: packed['states'][b][lookup[t]] for b in BODIES}
        return {'time': iso(t), 'bodies': states, **geometry(states)}
    frames = [frame(t) for t in animation]
    earth_path = [{'time': iso(t), 'relative_km': subtract(packed['states']['earth'][lookup[t]]['position_km'], packed['states']['sun'][lookup[t]]['position_km'])} for t in earth_path_times]
    moon_path = [{'time': f['time'], 'relative_km': subtract(f['bodies']['moon']['position_km'], f['bodies']['earth']['position_km'])} for f in frames]
    return {'selected_time': iso(center), 'selected_index': animation.index(center), 'frames': frames,
            'earth_path': earth_path, 'moon_path': moon_path if request.include_paths else [],
            'cached': cached, 'provenance': {'source': 'NASA/JPL Horizons API', 'url': ENDPOINT,
            'documentation': 'https://ssd-api.jpl.nasa.gov/doc/horizons.html', 'body_ids': BODIES,
            'ephemerides': packed['sources'], 'origin': 'Solar System Barycenter (500@0)',
            'frame': 'Ecliptic of J2000.0; ICRF-based fixed IAU76/80 obliquity',
            'units': 'km; velocities km/s', 'correction': 'NONE (geometric simultaneous vectors)',
            'time_scale': 'Horizons UT: UTC from 1962, UT1 before 1962; future leap seconds unknown',
            'calendar': 'Proleptic Gregorian', 'retrieved_at': packed['retrieved_at'],
            'uncertainty': 'Uncertainty not quantified for these major-body vectors in this response.',
            'paths': 'Earth minus Sun at each annual sample; Moon minus Earth at each timeline sample. Relative paths are translated to the current central body for display, not inertial trajectories.',
            'phase': 'Geometric illuminated fraction (1 + cos(Sun–Moon–Earth angle))/2; category uses geocentric ecliptic elongation. No light-time, eclipse darkening or topocentric effects.',
            'visuals': 'Body-centre geometry is ephemeris-derived. Texture orientation is illustrative; no body-fixed attitude or rotation model is computed.'}}


@router.post('')
def astronomy_endpoint(request: AstronomyRequest):
    import os
    path = os.getenv('CACHE_PATH', str(Path(__file__).resolve().parents[2] / 'data/cache.sqlite'))
    try:
        return calculate(request, path)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except HorizonsRangeError as exc:
        raise HTTPException(422, str(exc)) from exc
    except HorizonsUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
