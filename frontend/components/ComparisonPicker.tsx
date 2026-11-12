"use client";
import { useState, type FormEvent } from "react";
import type { Mission, Site } from "../app/types";
export { terrainReference } from "../lib/reference-sites";

export const siteKey = (s: Site) =>
  `${s.latitude.toFixed(6)},${(Math.abs(s.latitude) === 90 ? 0 : s.longitude === 180 ? -180 : s.longitude).toFixed(6)}`;

export const comparisonRadiusKm = 20;
export const comparisonAreaMessage = `Choose a comparison point within ${comparisonRadiusKm} km of the first landing point.`;

export function inComparisonArea(first: Site, candidate: Site) {
  const radians = Math.PI / 180;
  const latitude = first.latitude * radians;
  const otherLatitude = candidate.latitude * radians;
  const halfLongitudeDifference = (candidate.longitude - first.longitude) * radians / 2;
  const haversine = Math.sin((otherLatitude - latitude) / 2) ** 2
    + Math.cos(latitude) * Math.cos(otherLatitude) * Math.sin(halfLongitudeDifference) ** 2;
  const distanceKm = 2 * 1737.4 * Math.asin(Math.sqrt(Math.min(1, haversine)));
  return distanceKm <= comparisonRadiusKm + 1e-6;
}
type Candidate = {
  location: Site;
  distance_m: number;
  terrain_score_change: number | null;
};
export type TerrainComparisonPoint = Pick<Candidate, "location" | "distance_m"> & {
  resolution_m: number;
  slope_p95_deg: number;
};
type Rejected = Pick<Candidate, "location" | "distance_m"> & {
  assessment: { constraints_failed: string[] };
};
type Shortlist = {
  candidates: Candidate[];
  exploration_candidates?: TerrainComparisonPoint[];
  comparison_candidates?: Pick<Candidate, "location" | "distance_m">[];
  inspection_candidates?: Rejected[];
  searched: number;
  overlap_excluded: number;
  outside_or_missing: number;
  failed_limits: number;
  passing_terrain_candidates: number;
  scope: string;
};

export default function ComparisonPicker({
  mission,
  chosen,
  onChange,
  onAdd,
  busy,
}: {
  mission: Mission;
  chosen: Site[];
  onChange: (sites: Site[]) => void;
  onAdd: (site: Site) => void;
  busy: boolean;
}) {
  const [suggestions, setSuggestions] = useState<{
    key: string;
    data: Shortlist;
  }>();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState("");
  const key = siteKey(mission);
  const selected = chosen.filter((s) => siteKey(s) !== key && inComparisonArea(mission, s));
  const searchKey = JSON.stringify(mission);
  const screened = suggestions?.key === searchKey ? suggestions.data : undefined;
  const canAdd = (site: Site) =>
    !busy && selected.length < 2 && inComparisonArea(mission, site) &&
    ![mission, ...selected].some((s) => siteKey(s) === siteKey(site));
  function add(site: Site) {
    if (!inComparisonArea(mission, site)) return setError(comparisonAreaMessage);
    if (selected.length >= 2)
      return setError("Choose at most two alternatives.");
    if ([mission, ...selected].some((s) => siteKey(s) === siteKey(site)))
      return setError("That point is already selected.");
    setError("");
    onAdd(site);
  }
  function custom(e: FormEvent) {
    e.preventDefault();
    add({
      name: name.trim() || "Custom comparison point",
      latitude: Number(lat),
      longitude: Number(lon),
    });
  }
  async function suggest() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/reliability/plan-b-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission }),
      });
      if (!r.ok)
        throw new Error("Terrain suggestions are unavailable for this search.");
      const data: Shortlist = await r.json();
      setSuggestions({ key: searchKey, data });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load terrain suggestions.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="panel comparison-picker"
      id="choose-comparison-sites"
      open
    >
      <summary>Choose alternative sites</summary>
      <p>{mission.name} is the centre of the {comparisonRadiusKm} km search. Added points use the original mission window.</p>
      <div className="account-actions">
        <button
          className="button subtle"
          disabled={busy || loading}
          onClick={() => void suggest()}
        >
          {loading ? "Screening nearby terrain…" : "Suggest points within 20 km"}
        </button>
      </div>
      {screened && (
        <div>
          <p className="info" role="status">
            {screened.passing_terrain_candidates} passed Apollo terrain screening · {screened.exploration_candidates?.length ?? 0} terrain comparison points
          </p>
          <details><summary>Screening details</summary>
            <p>{screened.searched} searched · {screened.overlap_excluded} overlapping · {screened.outside_or_missing} lacked Apollo evidence · {screened.failed_limits} exceeded limits.</p>
            <p>{screened.scope}</p>
          </details>
          {screened.candidates.map((c) => (
            <div key={siteKey(c.location)} className="saved-search">
              <span>
                {c.location.name} · {Math.round(c.distance_m)} m away
                {c.terrain_score_change == null
                  ? ""
                  : ` · ${c.terrain_score_change > 0 ? "+" : ""}${c.terrain_score_change.toFixed(1)} terrain points`}
              </span>
              <button
                className="button subtle"
                disabled={!canAdd(c.location)}
                onClick={() => add(c.location)}
              >
                Add to comparison
              </button>
            </div>
          ))}
          {!!screened.exploration_candidates?.length && (
            <section aria-label="Terrain comparison points">
              <h3>Terrain comparison points</h3>
              <p>Nominal terrain checks passed. Apollo footprint and uncertainty evidence is incomplete.</p>
              {screened.exploration_candidates.map((c) => (
                <div key={siteKey(c.location)} className="saved-search">
                  <span>{c.location.name} · {c.resolution_m} m DEM · {c.slope_p95_deg.toFixed(1)}° p95 slope</span>
                  <button className="button subtle" disabled={!canAdd(c.location)} onClick={() => add(c.location)}>
                    Add for comparison
                  </button>
                </div>
              ))}
            </section>
          )}
          {!!screened.comparison_candidates?.length && (
            <section aria-label="Nearby comparison points">
              <h3>Nearby comparison points</h3>
              <p>Terrain evidence is incomplete. Compare these points for sunlight and Earth visibility.</p>
              {screened.comparison_candidates.map((candidate) => (
                <div key={siteKey(candidate.location)} className="saved-search">
                  <span>{candidate.location.name} · {candidate.location.latitude.toFixed(5)}°, {candidate.location.longitude.toFixed(5)}°</span>
                  <button className="button subtle" disabled={!canAdd(candidate.location)} onClick={() => add(candidate.location)}>
                    Add for comparison
                  </button>
                </div>
              ))}
            </section>
          )}
          {!!screened.inspection_candidates?.length && (
            <details>
              <summary>Points that exceeded terrain limits</summary>
              {screened.inspection_candidates.map((c) => (
                <div key={siteKey(c.location)} className="saved-search">
                  <span>{c.location.name} · {c.assessment.constraints_failed.join(" ")}</span>
                  <button className="button subtle" disabled={!canAdd(c.location)} onClick={() => add({ ...c.location, name: c.location.name.replace("Backup terrain candidate", "Rejected terrain point") })}>
                    Compare rejected point
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
      <form className="account-actions" onSubmit={custom}>
        <label>
          Custom point
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Name (optional)"
          />
        </label>
        <label>
          Latitude
          <input
            type="number"
            min={-90}
            max={90}
            step="any"
            required
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            min={-180}
            max={180}
            step="any"
            required
            value={lon}
            onChange={(e) => setLon(e.target.value)}
          />
        </label>
        <button
          className="button subtle"
          disabled={busy || selected.length >= 2}
        >
          Add coordinates
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {selected.map((s) => (
        <div key={siteKey(s)} className="saved-search">
          <span>
            {s.name} · {s.latitude.toFixed(5)}°, {s.longitude.toFixed(5)}°
          </span>
          <button
            className="button subtle"
            disabled={busy}
            onClick={() =>
              onChange(selected.filter((p) => siteKey(p) !== siteKey(s)))
            }
            aria-label={`Remove ${s.name}`}
          >
            Remove
          </button>
        </div>
      ))}
    </details>
  );
}
