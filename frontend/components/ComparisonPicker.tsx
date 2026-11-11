"use client";
import { useState, type FormEvent } from "react";
import type { Mission, Site } from "../app/types";
import { referenceSites } from "../lib/reference-sites";
export { terrainReference } from "../lib/reference-sites";

export const siteKey = (s: Site) =>
  `${s.latitude.toFixed(6)},${(Math.abs(s.latitude) === 90 ? 0 : s.longitude === 180 ? -180 : s.longitude).toFixed(6)}`;
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
  sites,
  chosen,
  onChange,
  onAdd,
  busy,
}: {
  mission: Mission;
  sites: Site[];
  chosen: Site[];
  onChange: (sites: Site[]) => void;
  onAdd: (site: Site) => void;
  busy: boolean;
}) {
  const [suggestions, setSuggestions] = useState<{
    key: string;
    data: Shortlist;
  }>();
  const [radius, setRadius] = useState(500);
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState("");
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState("");
  const key = siteKey(mission);
  const selected = chosen.filter((s) => siteKey(s) !== key);
  const options = [...referenceSites, ...sites.filter((s) => s.id !== "connecting-ridge")].filter(
    (s, i, all) =>
      siteKey(s) !== key &&
      !selected.some((point) => siteKey(point) === siteKey(s)) &&
      all.findIndex((p) => siteKey(p) === siteKey(s)) === i,
  );
  const reference = options.find((s) => siteKey(s) === entry) ?? options[0];
  const searchKey = `${key}:${radius}`;
  const screened = suggestions?.key === searchKey ? suggestions.data : undefined;
  const canAdd = (site: Site) =>
    !busy && selected.length < 2 && !selected.some((s) => siteKey(s) === siteKey(site));
  function add(site: Site) {
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
      const r = await fetch("/api/reliability/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission, vehicle: { search_radius_m: radius } }),
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
      <summary>Choose comparison sites</summary>
      <div className="account-actions">
        <label>
          Reference point{" "}
          <select value={reference ? siteKey(reference) : ""} onChange={(e) => setEntry(e.target.value)} disabled={!reference}>
            {!reference && <option value="">All references added</option>}
            {options.map((s) => (
              <option key={siteKey(s)} value={siteKey(s)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button subtle"
          disabled={
            busy ||
            !reference ||
            selected.length >= 2
          }
          onClick={() => {
            if (reference) add(reference);
          }}
        >
          Add reference
        </button>
        <label>
          Nearby search radius
          <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
            <option value={500}>500 m</option>
            <option value={1000}>1 km</option>
            <option value={2000}>2 km</option>
          </select>
        </label>
        <button
          className="button subtle"
          disabled={busy || loading}
          onClick={() => void suggest()}
        >
          {loading ? "Screening nearby terrain…" : "Suggest nearby backups"}
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
