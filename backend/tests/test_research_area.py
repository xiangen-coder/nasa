import pytest

from app import landing_research as research
from app import water_evidence as water


@pytest.mark.parametrize("radius", [500, 20000])
def test_candidates_stay_in_circle_and_use_focus(monkeypatch, radius):
    request = research.ResearchAreaRequest(
        mission=dict(name="Centre", latitude=-89.5, longitude=179.99,
                     start="2026-10-01T00:00:00Z", end="2026-10-02T00:00:00Z",
                     interval_minutes=60, clearance_deg=2),
        radius_m=radius, focus="I",
    )
    seen = []

    def evaluate(candidate, **kwargs):
        mission = candidate.mission
        seen.append(mission)
        assert mission.start == request.mission.start
        assert mission.end == request.mission.end
        assert mission.clearance_deg == 2
        assert research.rasters.GEOD.inv(
            request.mission.longitude, request.mission.latitude,
            mission.longitude, mission.latitude,
        )[2] <= radius
        if len(seen) == 1:
            return {"status": "limits", "reasons": ["Slope exceeded"]}
        return {"mission": mission, "score": 80, "geometry": {"available": True}}

    monkeypatch.setattr(research, "research", evaluate)
    monkeypatch.setattr(water, "research_shadow", lambda *args: {
        "distances_m": list(reversed(range(len(args[-1])))),
    })
    result = research.find_research_area(request)
    assert len(seen) == 17
    assert any(site.longitude < 0 for site in seen)
    assert result["counts"]["limits"] == 1
    assert result["results"][0]["mission"] == seen[-1]
    assert len(result["results"]) == 3


def test_shadow_reports_full_partial_and_missing_coverage():
    if not water.polar_catalog().get("shadow_south_wide"):
        pytest.skip("Requires the bundled wide shadow raster")
    full = water.research_shadow(-89.54, 0, 5000)
    assert full["coverage_fraction"] == pytest.approx(1)
    assert full["shadow_fraction"] == pytest.approx(0.033, abs=0.002)
    partial = water.research_shadow(-65, 179.99, 20000)
    assert 0 < partial["coverage_fraction"] < 1
    assert partial["shadow_fraction"] is not None
    assert water.research_shadow(0, 0, 5000)["shadow_fraction"] is None
