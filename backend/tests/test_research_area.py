import pytest

from app import landing_research as research
from app import landing_reliability as reliability
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
        )[2] <= radius + 1e-6
        if len(seen) == 1:
            return {"score": None}
        return {"mission": mission, "score": 80, "geometry": {"available": True}}

    monkeypatch.setattr(research, "research", evaluate)
    monkeypatch.setattr(water, "research_shadow", lambda *args: {
        "distances_m": list(reversed(range(len(args[-1])))),
    })
    result = research.find_research_area(request)
    assert len(seen) == (25 if radius == 500 else 49)
    terrain_sites = []

    def screen(site, *_):
        terrain_sites.append((site.latitude, site.longitude))
        return {"status": "insufficient_evidence", "constraints_failed": []}

    monkeypatch.setattr(reliability, "screened", screen)
    monkeypatch.setattr(reliability, "exploration_candidates", lambda *_: [])
    reliability.alternatives(
        reliability.ReliabilityRequest(mission=request.mission),
        {"screening_radius_m": 0}, search_radius_m=radius,
    )
    assert set(terrain_sites) == {(site.latitude, site.longitude) for site in seen[1:]}
    assert any(site.longitude < 0 for site in seen)
    assert result["counts"]["missing"] == 1
    assert result["results"][0]["mission"] == seen[-1]
    assert len(result["results"]) == 5


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


def test_area_ranks_scores_even_with_limit_failures(monkeypatch):
    request = research.ResearchAreaRequest(
        mission=dict(name="Centre", latitude=-86.1315, longitude=148.3593,
                     start="2026-10-01T00:00:00Z", end="2026-10-08T00:00:00Z",
                     interval_minutes=60, clearance_deg=0),
        radius_m=20000,
    )

    scores = iter(range(49))

    def evaluate(candidate, **kwargs):
        return {"mission": candidate.mission, "score": next(scores),
                "constraints_failed": ["Slope exceeded"]}

    monkeypatch.setattr(research, "research", evaluate)
    result = research.find_research_area(request)
    assert result["recommended"]
    assert result["counts"]["evaluated"] == 49
    assert [point["score"] for point in result["results"]] == [48, 47, 46, 45, 44]
    assert result["results"][0]["mission"] != request.mission
