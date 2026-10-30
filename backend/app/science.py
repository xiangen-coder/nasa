"""Geometric center visibility in IAU_MOON, no refraction or light-time correction."""
import hashlib
import json
import os
from pathlib import Path
from threading import RLock
from datetime import timedelta
import numpy as np
import spiceypy as spice
from importlib.metadata import distribution

ROOT = Path(__file__).resolve().parents[2]
LOCK = RLock()  # CSPICE has global state; serialize all access.
KERNELS = [ROOT/'data/kernels/naif0012.tls', ROOT/'data/kernels/pck00010.tpc', Path(distribution('skyfield-data').locate_file('skyfield_data/data/de421.bsp'))]
RADIUS_KM = 1737.4
_loaded = False

def initialize():
    global _loaded
    with LOCK:
        if not _loaded:
            manifest = json.loads((ROOT/'data/kernels/manifest.json').read_text())
            for kernel in KERNELS:
                digest = hashlib.sha256(kernel.read_bytes()).hexdigest()
                if digest != manifest[kernel.name]['sha256']:
                    raise RuntimeError(f'Kernel integrity check failed: {kernel.name}')
            for kernel in KERNELS:
                spice.furnsh(str(kernel))
            _loaded = True

def basis(latitude, longitude):
    lat, lon = np.radians([latitude, longitude])
    up = np.array([np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0])
    north = np.cross(up, east)
    return east, north, up

def horizontal(vector, axes):
    east, north, up = (float(np.dot(vector, a)) for a in axes)
    return float(np.degrees(np.arctan2(east, north)) % 360), float(np.degrees(np.arctan2(up, np.hypot(east, north))))

def ephemeris(mission, height_m=0):
    initialize()
    axes = basis(mission.latitude, mission.longitude)
    observer = axes[2] * (RADIUS_KM + height_m/1000)
    times = [mission.start]
    while times[-1] < mission.end:
        times.append(min(times[-1] + timedelta(minutes=mission.interval_minutes), mission.end))
    rows = []
    with LOCK:
        for time in times:
            et = spice.str2et(time.strftime('%Y-%m-%d %H:%M:%S.%f') + ' UTC')
            row = {'time': time.isoformat()}
            for body, prefix in [('SUN', 'sun'), ('EARTH', 'earth')]:
                vector, _ = spice.spkpos(body, et, 'IAU_MOON', 'NONE', 'MOON')
                az, el = horizontal(np.array(vector) - observer, axes)
                row[prefix+'_azimuth'] = az
                row[prefix+'_elevation'] = el
            rows.append(row)
    return rows

def visible(elevation, azimuth, horizon=None, clearance=0):
    # Missing terrain must be represented by the caller as a geometric-only mode.
    obstruction = 0.0 if horizon is None else float(np.interp(azimuth % 360, [p['azimuth'] for p in horizon] + [360], [p['elevation'] for p in horizon] + [horizon[0]['elevation']]))
    return elevation > obstruction + clearance

def windows(rows, flags):
    """Left-endpoint quadrature on [start,end); final sample has zero duration."""
    out = []
    for i, flag in enumerate(flags[:-1]):
        if flag:
            if out and out[-1]['end'] == rows[i]['time']:
                out[-1]['end'] = rows[i+1]['time']
                out[-1]['hours'] += (rows[i+1]['dt'] - rows[i]['dt']).total_seconds()/3600
            else:
                out.append({'start': rows[i]['time'], 'end': rows[i+1]['time'], 'hours': (rows[i+1]['dt'] - rows[i]['dt']).total_seconds()/3600})
    return out

def metrics(series):
    from datetime import datetime
    rows = [dict(r, dt=datetime.fromisoformat(r['time'])) for r in series]
    duration = (rows[-1]['dt']-rows[0]['dt']).total_seconds()/3600
    result = {}
    for field in ['sun_visible', 'earth_visible', 'simultaneous']:
        spans = windows(rows, [r[field] for r in rows])
        result[field+'_pct'] = 100 * sum(w['hours'] for w in spans)/duration
        if field == 'simultaneous':
            result['operational_windows'] = spans
    for field, name in [('sun_visible', 'darkness'), ('earth_visible', 'blackout')]:
        spans = windows(rows, [not r[field] for r in rows])
        result['longest_'+name+'_hours'] = max((w['hours'] for w in spans), default=0)
        result[name+'_windows'] = spans
    return result
