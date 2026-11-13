import pytest
from rasterio.io import MemoryFile

from app.lunar_rasters import ice_evidence
from app.models import Location
from app.water_evidence import evidence_map, polar_catalog, water_evidence

pytestmark = pytest.mark.skipif(
    not all(f"{layer}_{pole}" in polar_catalog() for layer in ("shadow", "illumination") for pole in ("north", "south")),
    reason="Prepare the four real NASA polar rasters with scripts/prepare_water_evidence.py before running these checks.",
)


def test_native_lola_values_at_poles_and_longitude_wrap():
    south = water_evidence(-90, 0, 250)["layers"]
    assert south == water_evidence(-90, 180, 250)["layers"]
    assert south["shadow"]["value"] == 0
    # Source illumination DN 6880 × 0.00004.
    assert south["illumination"]["value"] == pytest.approx(0.2752)
    assert south["illumination"]["footprint"]["coverage_fraction"] == pytest.approx(1)
    north = water_evidence(90, 0, None)["layers"]
    assert north["shadow"]["value"] == 1
    assert north["illumination"]["value"] == 0
    assert north["surface_ice"]["status"] == "unavailable"
    assert north["hydrogen"]["value"] is None


def test_outside_coverage_and_partial_footprint():
    equator = water_evidence(0, 0, 250)["layers"]["shadow"]
    assert equator["status"] == "outside_coverage"
    assert equator["value"] is None
    assert equator["footprint"]["mean"] is None
    edge = water_evidence(-85, -180, 250)["layers"]["shadow"]
    assert edge == water_evidence(-85, 180, 250)["layers"]["shadow"]
    assert edge["value"] == 1
    assert 0 < edge["footprint"]["coverage_fraction"] < 1


def test_map_serves_native_pixel_window_with_mask():
    response = evidence_map("shadow", -85, 180)
    assert response.media_type == "image/png"
    with MemoryFile(response.body) as file, file.open() as preview:
        assert preview.shape == (129, 129)
        brightness, alpha = preview.read()
        assert brightness[64, 64] == 0
        assert alpha[64, 64] == 255
        assert (alpha == 0).any()


@pytest.mark.parametrize('latitude', [-74.4726, 74.4726])
def test_wide_shadow_matches_assessment_at_both_poles(latitude, monkeypatch):
    monkeypatch.delenv('LUNAR_DATA_MANIFEST', raising=False)
    longitude = 145.7015
    reading = water_evidence(latitude, longitude, 1000)['layers']['shadow']
    assert reading['status'] == 'available'
    assert reading['source']['resolution_m'] == 240
    assert evidence_map('shadow', latitude, longitude).media_type == 'image/png'
    score = ice_evidence(Location(latitude=latitude, longitude=longitude), 100)
    assert score['value'] == reading['value'] == 0
    assert score['source']['interpretation'] == 'psr_pixel'
    assert 'radius_m' not in score
