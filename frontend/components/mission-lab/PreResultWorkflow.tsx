"use client";
import { useState } from "react";
import type { Analysis, Site } from "../../app/types";
import type {
  ExperienceMode,
  MissionSession,
  Weights,
} from "./useMissionSession";
import EquipmentControls from "./EquipmentControls";
import ScenarioComparison from "./ScenarioComparison";
import type { Highlight } from "./ScenarioCharts";
export default function PreResultWorkflow({
  session: s,
  sites,
  view,
  onNavigate,
  onInspect,
  weights,
  onWeights,
  onEvidence,
}: {
  session: MissionSession;
  sites: Site[];
  view: number;
  experience: ExperienceMode;
  onNavigate: (v: number) => void;
  onInspect: (a: Analysis) => void;
  weights?: Weights;
  onWeights?: (w: Weights) => void;
  onEvidence: (a: Analysis, h: Highlight) => void;
}) {
  const [name, setName] = useState(""),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState("");
  if (view !== 12) return null;
  const inspect = (id: string) => {
    const e = s.entries.find((e) => e.id === id);
    if (e?.analysis) {
      onInspect(e.analysis);
      onNavigate(8);
    }
  };
  return (
    <section
      className="scenario-workspace"
      aria-label="Mission scenario comparison"
    >
      <span className="eyebrow">PLAN → COMPARE → CHOOSE → EXPLORE</span>
      <h2>Compare your mission options</h2>
      <p>
        Each card is a complete mission scenario. Choose what you want to
        change; the calculations remain shared between Professional and
        Education modes.
      </p>
      <div className="scenario-toolbar">
        <label>
          Comparison type
          <select
            value={s.mode}
            onChange={(e) => s.setMode(e.target.value as typeof s.mode)}
          >
            <option value="locations">Compare locations</option>
            <option value="dates">Compare dates</option>
            <option value="options">Compare mission options</option>
          </select>
        </label>
        {s.mode !== "locations" && (
          <label>
            <input
              type="checkbox"
              checked={s.equalDuration}
              onChange={(e) => s.setEqualDuration(e.target.checked)}
            />{" "}
            Keep stay durations equal
          </label>
        )}
        <button
          className="button primary"
          onClick={() => void s.calculate()}
          disabled={s.busy}
        >
          Calculate all scenarios
        </button>
        {s.mode !== "locations" && (
          <button
            className="button subtle"
            disabled={s.entries.length >= 3}
            onClick={s.addDate}
          >
            Add another landing date
          </button>
        )}
        <button className="button subtle" onClick={() => onNavigate(7)}>
          Edit primary mission
        </button>
      </div>
      {s.message && (
        <p role="status" className="info">
          {s.message}
        </p>
      )}
      {s.stale && (
        <p className="info">
          Inputs changed. Previous results are hidden until the current
          scenarios are calculated.
        </p>
      )}
      <div className="scenario-cards" data-count={s.entries.length}>
        {s.entries.map((e, i) => {
          const busy = s.pending.includes(e.key),
            base = s.entries[0];
          const different = [
            e.mission.latitude !== base.mission.latitude ||
            e.mission.longitude !== base.mission.longitude
              ? "Location"
              : "",
            Date.parse(e.mission.start) !== Date.parse(base.mission.start)
              ? "Start date"
              : "",
            Date.parse(e.mission.end) - Date.parse(e.mission.start) !==
            Date.parse(base.mission.end) - Date.parse(base.mission.start)
              ? "Duration"
              : "",
            e.mission.interval_minutes !== base.mission.interval_minutes
              ? "Sampling"
              : "",
            e.mission.clearance_deg !== base.mission.clearance_deg
              ? "Clearance"
              : "",
            JSON.stringify(e.solar) !== JSON.stringify(base.solar)
              ? "Equipment"
              : "",
          ].filter(Boolean);
          return (
            <article
              className="glass scenario-card"
              key={e.id}
              aria-label={`Scenario ${String.fromCharCode(65 + i)}`}
            >
              <div className="scenario-section-heading">
                <span className="eyebrow">
                  OPTION {String.fromCharCode(65 + i)}{" "}
                  {i === 0 ? "· PRIMARY" : ""}
                </span>
                {i > 0 && (
                  <button
                    className="button subtle"
                    onClick={() => s.removeId(e.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <h3>{e.site.name}</h3>
              <p>
                {e.site.latitude.toFixed(4)}° N / {e.site.longitude.toFixed(4)}°
                E
              </p>
              <span className="tag">
                {i === 0
                  ? "Primary mission"
                  : different.length
                    ? `Changed: ${different.join(", ")}`
                    : "Same mission inputs"}
              </span>
              <div className="scenario-fields">
                {i > 0 && s.mode === "options" && (
                  <>
                    <label>
                      Location name
                      <input
                        maxLength={100}
                        value={e.site.name}
                        onChange={(v) =>
                          s.update(e.id, { name: v.target.value })
                        }
                      />
                    </label>
                    <label>
                      Latitude (° N)
                      <input
                        type="number"
                        min={-90}
                        max={90}
                        step="any"
                        value={e.site.latitude}
                        onChange={(v) =>
                          s.update(e.id, { latitude: Number(v.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Longitude (° E)
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step="any"
                        value={e.site.longitude}
                        onChange={(v) =>
                          s.update(e.id, { longitude: Number(v.target.value) })
                        }
                      />
                    </label>
                  </>
                )}
                {i > 0 && s.mode !== "locations" ? (
                  <>
                    <label>
                      Landing start (UTC)
                      <input
                        type="datetime-local"
                        value={e.mission.start.slice(0, 16)}
                        onChange={(v) => {
                          if (v.target.value)
                            s.update(e.id, { start: `${v.target.value}:00Z` });
                        }}
                      />
                    </label>
                    <label>
                      Mission end (UTC)
                      <input
                        type="datetime-local"
                        disabled={s.equalDuration}
                        value={e.mission.end.slice(0, 16)}
                        onChange={(v) => {
                          if (v.target.value)
                            s.update(e.id, { end: `${v.target.value}:00Z` });
                        }}
                      />
                    </label>
                    <label>
                      Sampling interval (minutes)
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        value={e.mission.interval_minutes}
                        onChange={(v) =>
                          s.update(e.id, {
                            interval_minutes: Number(v.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Earth clearance (°)
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        value={e.mission.clearance_deg}
                        onChange={(v) =>
                          s.update(e.id, {
                            clearance_deg: Number(v.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <p>
                    {e.mission.start} → {e.mission.end}
                    <br />
                    {e.mission.interval_minutes}-minute samples ·{" "}
                    {e.mission.clearance_deg}° Earth clearance
                  </p>
                )}
              </div>
              <p>
                {(
                  (Date.parse(e.mission.end) - Date.parse(e.mission.start)) /
                  86400000
                ).toFixed(2)}
                -day stay
              </p>
              {busy && (
                <p role="status">
                  Calculating NASA/JPL visibility…{" "}
                  <button
                    className="text-button"
                    onClick={() => s.cancel(e.key)}
                  >
                    Cancel
                  </button>
                </p>
              )}
              {e.error && (
                <p className="error" role="alert">
                  {e.error}
                </p>
              )}
              {e.analysis ? (
                <>
                  <strong className="scenario-score">
                    {e.analysis.metrics.simultaneous_pct.toFixed(1)}%
                  </strong>
                  <p>Simultaneous Sun & Earth visibility</p>
                  <dl className="scenario-metrics">
                    <div>
                      <dt>Sunlight availability</dt>
                      <dd>{e.analysis.metrics.sun_visible_pct.toFixed(1)}%</dd>
                    </div>
                    <div>
                      <dt>Earth visibility</dt>
                      <dd>
                        {e.analysis.metrics.earth_visible_pct.toFixed(1)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Longest darkness</dt>
                      <dd>
                        {e.analysis.metrics.longest_darkness_hours.toFixed(2)} h
                      </dd>
                    </div>
                    <div>
                      <dt>Longest Earth outage</dt>
                      <dd>
                        {e.analysis.metrics.longest_blackout_hours.toFixed(2)} h
                      </dd>
                    </div>
                    <div>
                      <dt>Estimated solar energy</dt>
                      <dd>{e.energy?.total_kwh.toFixed(2)} kWh</dd>
                    </div>
                    <div>
                      <dt>Daily estimated energy</dt>
                      <dd>{e.energy?.daily_kwh.toFixed(2)} kWh/day</dd>
                    </div>
                    <div>
                      <dt>Unmet demand</dt>
                      <dd>
                        {e.energy?.unmet_kwh?.toFixed(2) ?? "Not configured"}{" "}
                        {e.energy?.unmet_kwh != null ? "kWh" : ""}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {e.analysis.terrain.available
                      ? "Terrain-screened geometry; landing hazards remain unassessed."
                      : "Reference-sphere geometry; terrain safety is unknown."}
                  </p>
                </>
              ) : (
                !busy && (
                  <p>
                    Not yet assessed. Calculate this scenario to see its current
                    results.
                  </p>
                )
              )}
              <details className="learning-disclosure">
                <summary>Scenario equipment assumptions</summary>
                <EquipmentControls
                  value={e.solar}
                  onChange={(v) => s.setEquipment(e.id, v)}
                  compact
                />
              </details>
              <div className="action-row">
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() => void s.evaluateMission(e.mission)}
                >
                  {e.analysis ? "Recalculate" : "Calculate scenario"}
                </button>
                <button
                  className="button primary"
                  disabled={!e.analysis || busy}
                  onClick={() => inspect(e.id)}
                >
                  View full results
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {s.mode !== "dates" && (
        <details className="learning-disclosure" open>
          <summary>Add a comparison location</summary>
          <div className="scenario-references">
            {sites
              .filter(
                (p) =>
                  !s.entries.some(
                    (e) =>
                      e.site.latitude === p.latitude &&
                      e.site.longitude === p.longitude,
                  ),
              )
              .slice(0, 4)
              .map((p) => (
                <button
                  className="button subtle"
                  key={p.id || p.name}
                  disabled={s.entries.length >= 3}
                  onClick={() => s.add(p)}
                >
                  {p.name} · Compare
                </button>
              ))}
          </div>
          <form
            className="scenario-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (lat.trim() && lon.trim())
                s.add({
                  name: name.trim() || "Custom location",
                  latitude: Number(lat),
                  longitude: Number(lon),
                });
            }}
          >
            <label>
              Location name
              <input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Latitude (° N)
              <input
                required
                type="number"
                min={-90}
                max={90}
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Longitude (° E)
              <input
                required
                type="number"
                min={-180}
                max={180}
                step="any"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={s.entries.length >= 3}>
              Add to comparison
            </button>
          </form>
        </details>
      )}
      {weights && onWeights && (
        <details className="learning-disclosure">
          <summary>Visibility ranking weights</summary>
          <div className="scenario-fields">
            {(["sunlight", "earth", "simultaneous"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={weights[k]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 0 && n <= 10) onWeights({ ...weights, [k]: n });
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <ScenarioComparison
        session={s}
        onInspect={inspect}
        onEvidence={(id, h) => {
          const a = s.entries.find((e) => e.id === id)?.analysis;
          if (a) onEvidence(a, h);
        }}
      />
      <p>
        {s.entries.length} / 3 scenarios selected. Availability is not
        landing-success probability.
      </p>
    </section>
  );
}
