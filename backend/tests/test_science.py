from datetime import datetime, timedelta, timezone
import hashlib
import json
import numpy as np
import pytest
import spiceypy as spice
from app.science import basis, horizontal, visible, metrics, ephemeris, initialize, KERNELS, ROOT, LOCK

@pytest.mark.parametrize('lat,lon', [(0,0),(-90,0),(-89.54,0),(-88.48,-87.1),(45,180)])
def test_local_basis_is_right_handed_orthonormal(lat,lon):
    axes=np.array(basis(lat,lon))
    np.testing.assert_allclose(axes @ axes.T, np.eye(3), atol=1e-14)
    np.testing.assert_allclose(np.cross(axes[0], axes[1]), axes[2], atol=1e-14)

def test_azimuth_cardinals_and_zenith():
    axes=basis(0,0)
    assert horizontal(axes[0],axes)==(90.,0.)
    assert horizontal(axes[1],axes)==(0.,0.)
    assert horizontal(axes[2],axes)[1]==90.

def test_horizon_interpolation_wrap_clearance_and_equality():
    horizon=[{'azimuth':0,'elevation':4},{'azimuth':180,'elevation':8}]
    assert not visible(6,90,horizon)
    assert visible(6.01,90,horizon)
    assert not visible(6.5,270,horizon,1)
    assert visible(4.1,360,horizon)
    assert not visible(0,0)

def test_weighted_partial_interval_and_blackouts():
    # 60-minute interval followed by 30-minute terminal interval; not sample counts.
    start=datetime(2026,1,1,tzinfo=timezone.utc)
    rows=[{'time':(start+timedelta(minutes=m)).isoformat(),'sun_visible':s,'earth_visible':e,'simultaneous':s and e} for m,s,e in [(0,True,False),(60,False,True),(90,True,True)]]
    result=metrics(rows)
    assert result['sun_visible_pct']==pytest.approx(200/3)
    assert result['earth_visible_pct']==pytest.approx(100/3)
    assert result['simultaneous_pct']==0
    assert result['longest_blackout_hours']==1
    assert result['longest_darkness_hours']==.5

def test_adjacent_windows_merge_and_end_is_excluded():
    start=datetime(2026,1,1,tzinfo=timezone.utc)
    rows=[{'time':(start+timedelta(hours=i)).isoformat(),'sun_visible':True,'earth_visible':True,'simultaneous':True} for i in range(4)]
    result=metrics(rows)
    assert result['operational_windows']==[{'start':rows[0]['time'],'end':rows[-1]['time'],'hours':3}]
    assert result['simultaneous_pct']==100
    assert result['longest_darkness_hours']==0

def test_real_kernel_series_is_finite_and_has_terminal_sample(mission):
    rows=ephemeris(mission)
    assert len(rows)==25
    assert rows[-1]['time']==mission.end.isoformat()
    assert all(0<=r['sun_azimuth']<360 and -90<=r['earth_elevation']<=90 for r in rows)
    assert rows[0]['sun_azimuth'] != rows[-1]['sun_azimuth']

def test_nasa_kernel_checksums_and_moon_reference_radius():
    initialize()
    # Independent checksum published in the SpiceyPyTestKernels README.
    assert hashlib.md5(KERNELS[0].read_bytes()).hexdigest()=='25a2fff30b0dedb4d76c06727b1895b1'
    assert hashlib.md5(KERNELS[1].read_bytes()).hexdigest()=='da153641f7346bd5b6a1226778e0d51b'
    with LOCK:
        _, radii=spice.bodvrd('MOON','RADII',3)
    np.testing.assert_allclose(radii,[1737.4]*3)

@pytest.mark.parametrize('date', ['2000-01-01 12:00:00 UTC','2026-10-01 00:00:00 UTC','2050-01-01 00:00:00 UTC'])
def test_nasa_de421_vectors_against_independent_skyfield_reader(date):
    """Same NASA reference dataset, independent SPK evaluator and vector chain.
    This does not validate the IAU_MOON approximation against Horizons or flight data.
    """
    from skyfield.api import load, load_file
    initialize()
    kernel=load_file(str(KERNELS[2])); ts=load.timescale(builtin=True)
    with LOCK:
        et=spice.str2et(date)
        jd=spice.unitim(et,'ET','JDTDB')
        time=ts.tdb_jd(jd)
        for body in ['sun','earth']:
            expected=(kernel[body]-kernel['moon']).at(time).position.km
            actual,_=spice.spkpos(body.upper(),et,'J2000','NONE','MOON')
            np.testing.assert_allclose(actual,expected,atol=.02,rtol=1e-11)
    kernel.close()
