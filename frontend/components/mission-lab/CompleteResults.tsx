"use client";
import { useEffect, useState } from "react";
import type { MissionSession, ExperienceMode } from "./useMissionSession";
import type { LearningNotes } from "./learning-notes";
import ScenarioCharts, { type Highlight } from "./ScenarioCharts";
import EquipmentControls from "./EquipmentControls";
import EnergyOnlyCharts from "./EnergyOnlyCharts";
import ScenarioComparison from "./ScenarioComparison";
import { unavailableWindows } from "./scenario-science";
import { MoonMissionActivity } from "./MoonMissionClassroom";
export default function CompleteResults({
  session: s,
  selectedId,
  experience,
  notes,
  onNotes,
  onSelect,
  onNavigate,
  initialEvidence,
}: {
  session: MissionSession;
  selectedId: string;
  experience: ExperienceMode;
  notes: LearningNotes;
  onNotes: (n: LearningNotes) => void;
  onSelect: (id: string) => void;
  onNavigate: (v: number) => void;
  initialEvidence?: { id: string; interval: Highlight } | null;
}) {
  const [evidenceState, setEvidenceState] = useState<{
    id: string;
    interval: Highlight;
  } | null>(initialEvidence || null);
  const entry = s.entries.find((e) => e.id === selectedId) || s.entries[0],
    a = entry.analysis;
  const highlight =
    evidenceState?.id === entry.id ? evidenceState.interval : null;
  useEffect(() => {
    if (initialEvidence) {
      setEvidenceState(initialEvidence);
      document
        .getElementById("result-visibility")
        ?.scrollIntoView({ block: "start" });
    }
  }, [initialEvidence]);
  if (!a || !entry.energy)
    return (
      <section className="panel">
        <h2>Your complete results</h2>
        <p>
          {entry.error ||
            "Calculate a mission scenario to view its complete results."}
        </p>
        <button className="button primary" onClick={() => onNavigate(12)}>
          Go to comparison
        </button>
      </section>
    );
  const metrics = a.metrics,
    energy = entry.energy;
  const evidence = (id: string, h: Highlight) => {
    onSelect(id);
    setEvidenceState({ id, interval: h });
    window.setTimeout(
      () =>
        document
          .getElementById("result-visibility")
          ?.scrollIntoView({ block: "start" }),
      0,
    );
  };
  const sections = [
    ["summary", "Summary"],
    ["visibility", "Visibility"],
    ["energy", "Energy"],
    ["terrain", "Terrain"],
    ["comparison", "Comparison"],
    ["methods", "Methods"],
  ];
  const table = (body: "sun" | "earth") => {
    const windows = unavailableWindows(a, body);
    return windows.length ? (
      <div className="table-scroll">
        <table>
          <caption>
            {body === "sun" ? "Darkness intervals" : "Earth-visibility outages"}{" "}
            · UTC, left-endpoint sampling
          </caption>
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={w.start}>
                <td>{w.start}</td>
                <td>{w.end}</td>
                <td>{w.hours.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p>
        No sampled {body === "sun" ? "darkness" : "Earth-visibility outage"}{" "}
        within this stay.
      </p>
    );
  };
  return (
    <div className="complete-results scenario-workspace">
      <div className="scenario-toolbar">
        <button className="button subtle" onClick={() => onNavigate(12)}>
          ← Back to comparison
        </button>
        <label>
          Selected scenario
          <select value={entry.id} onChange={(e) => onSelect(e.target.value)}>
            {s.entries.map((e, i) => (
              <option key={e.id} value={e.id}>
                {String.fromCharCode(65 + i)} — {e.site.name} ·{" "}
                {e.mission.start.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <button className="button subtle" onClick={() => onNavigate(4)}>
          Generate mission report / export
        </button>
      </div>
      <nav className="result-section-nav" aria-label="Results sections">
        {sections.map(([key, label]) => (
          <button
            key={key}
            className="button subtle"
            onClick={() =>
              document
                .getElementById(`result-${key}`)
                ?.scrollIntoView({ block: "start" })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <section id="result-summary" className="result-section">
        <span className="eyebrow">COMPLETE SCENARIO RESULTS</span>
        <h2>{entry.site.name}</h2>
        <p>
          {entry.site.latitude.toFixed(4)}° N /{" "}
          {entry.site.longitude.toFixed(4)}° E
        </p>
        <p>
          {entry.mission.start} → {entry.mission.end} ·{" "}
          {(
            (Date.parse(entry.mission.end) - Date.parse(entry.mission.start)) /
            86400000
          ).toFixed(2)}{" "}
          days
        </p>
        <p>
          {entry.mission.interval_minutes}-minute samples ·{" "}
          {entry.mission.clearance_deg}° Earth clearance ·{" "}
          {a.mode.replaceAll("_", " ")}
        </p>
        {experience === "education" ? (
          <MoonMissionActivity
            session={s}
            id={entry.id}
            notes={notes}
            onNotes={onNotes}
            onCompare={() => onNavigate(12)}
          />
        ) : null}
        <div className="result-metric-grid">
          {[
            ["Sunlight availability", `${metrics.sun_visible_pct.toFixed(1)}%`],
            ["Earth visibility", `${metrics.earth_visible_pct.toFixed(1)}%`],
            [
              "Simultaneous visibility",
              `${metrics.simultaneous_pct.toFixed(1)}%`,
            ],
            [
              "Longest darkness",
              `${metrics.longest_darkness_hours.toFixed(2)} h`,
            ],
            [
              "Longest Earth outage",
              `${metrics.longest_blackout_hours.toFixed(2)} h`,
            ],
            ["Estimated solar energy", `${energy.total_kwh.toFixed(2)} kWh`],
          ].map(([label, value]) => (
            <article className="glass" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <p>
          Geometric availability is not landing-success probability. Solar
          estimates use the equipment assumptions below.
        </p>
      </section>
      <section id="result-visibility" className="result-section">
        <h2>Sun, Earth & mission time</h2>
        {highlight && (
          <div className="info">
            Highlighted {highlight.body} interval: {highlight.start} →{" "}
            {highlight.end}
            <button
              className="text-button"
              onClick={() => setEvidenceState(null)}
            >
              Clear highlight
            </button>
          </div>
        )}
        <ScenarioCharts analysis={a} highlight={highlight} />
        <h3>Darkness & Earth-visibility outages</h3>
        <p>
          Intervals use the same left-endpoint flags as the scientific metrics;
          crossing times are not interpolated.
        </p>
        {table("sun")}
        {table("earth")}
        <h3>Simultaneous visibility windows</h3>
        {metrics.operational_windows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Start UTC</th>
                  <th>End UTC</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {metrics.operational_windows.map((w) => (
                  <tr key={w.start}>
                    <td>{w.start}</td>
                    <td>{w.end}</td>
                    <td>{w.hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No sampled simultaneous visibility in this stay.</p>
        )}
        <button
          className="button subtle"
          disabled={s.pending.includes(entry.key)}
          onClick={() => s.finer(entry.id)}
        >
          Check with a finer time step
        </button>
        {s.message && <p role="status">{s.message}</p>}
      </section>
      <section id="result-energy" className="result-section">
        <h2>Estimated solar energy</h2>
        <p>
          Idealised estimate: {energy.total_kwh.toFixed(3)} kWh total ·{" "}
          {energy.daily_kwh.toFixed(3)} kWh/day.
        </p>
        <p>
          {entry.solar.demand_enabled
            ? `Unserved equipment demand: ${energy.unmet_kwh?.toFixed(3)} kWh. Curtailed surplus: ${energy.curtailed_kwh.toFixed(3)} kWh.`
            : "Equipment demand and storage are not configured."}
        </p>
        <EquipmentControls
          value={entry.solar}
          onChange={(v) => s.setEquipment(entry.id, v)}
        />
        <EnergyOnlyCharts analysis={a} energy={energy} />
      </section>
      <section id="result-terrain" className="result-section">
        <h2>Terrain & remaining unknowns</h2>
        <dl className="scenario-metrics">
          <div>
            <dt>Elevation</dt>
            <dd>
              {a.terrain.elevation_m == null
                ? "Unknown"
                : `${a.terrain.elevation_m} m`}
            </dd>
          </div>
          <div>
            <dt>Slope</dt>
            <dd>
              {a.terrain.slope_deg == null
                ? "Unknown"
                : `${a.terrain.slope_deg.toFixed(2)}°`}
            </dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>
              {a.terrain.resolution_m == null
                ? "Unknown"
                : `${a.terrain.resolution_m} m`}
            </dd>
          </div>
          <div>
            <dt>Horizon coverage</dt>
            <dd>
              {a.terrain.available
                ? "Measured terrain rays to 20 km"
                : "Unavailable"}
            </dd>
          </div>
        </dl>
        <p>
          {a.terrain.reason ||
            a.terrain.method ||
            "No measured terrain layer is available."}
        </p>
        {a.terrain.grid.length > 0 && (
          <div
            className="terrain-grid"
            role="img"
            aria-label="Local elevation heatmap; north is up"
          >
            {(() => {
              const values = a.terrain.grid.flatMap((p) =>
                  p.elevation_m === null ? [] : [p.elevation_m],
                ),
                lo = Math.min(...values),
                hi = Math.max(...values);
              return [...a.terrain.grid]
                .sort((x, y) => y.north_m - x.north_m || x.east_m - y.east_m)
                .map((p, i) => (
                  <div
                    key={i}
                    title={`${p.east_m} m E, ${p.north_m} m N: ${p.elevation_m ?? "Unknown"} m`}
                    style={{
                      background:
                        p.elevation_m === null
                          ? "#42485a"
                          : `hsl(${75 + ((p.elevation_m - lo) / (hi - lo || 1)) * 50} 25% ${20 + ((p.elevation_m - lo) / (hi - lo || 1)) * 55}%)`,
                    }}
                  />
                ));
            })()}
          </div>
        )}
        {a.terrain.horizon && (
          <details className="learning-disclosure">
            <summary>Measured horizon profile</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Azimuth °</th>
                    <th>Horizon elevation °</th>
                  </tr>
                </thead>
                <tbody>
                  {a.terrain.horizon.map((p) => (
                    <tr key={p.azimuth}>
                      <td>{p.azimuth}</td>
                      <td>{p.elevation.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <p>
          Local rocks, subpixel hazards, touchdown safety, flight trajectory and
          thermal conditions remain unassessed. Measured slope alone does not
          establish a safe landing.
        </p>
        <div className="reference-links">
          <a
            href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm"
            target="_blank"
            rel="noreferrer"
          >
            NASA PDS / LOLA
          </a>
          <a
            href="https://quickmap.lroc.asu.edu/"
            target="_blank"
            rel="noreferrer"
          >
            LROC QuickMap
          </a>
          <a
            href="https://trek.nasa.gov/moon/"
            target="_blank"
            rel="noreferrer"
          >
            NASA Moon Trek
          </a>
        </div>
      </section>
      <section id="result-comparison" className="result-section">
        <h2>Comparison & explanations</h2>
        <ScenarioComparison
          session={s}
          onInspect={onSelect}
          onEvidence={evidence}
        />
      </section>
      <section id="result-methods" className="result-section">
        <h2>Methods, sources & limitations</h2>
        <p>
          {a.provenance.ephemeris} · {a.provenance.orientation}
        </p>
        <ul>
          {a.provenance.assumptions.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3>Solar and storage assumptions</h3>
        <p>
          Constant normal irradiance (default 1361 W/m²). Power = irradiance ×
          area × efficiency × (1 − losses) × positive panel-incidence cosine,
          gated by the calculated Sun visibility flag. This is a separate
          idealised equipment model, not a change to the astronomy.
        </p>
        <p>
          Azimuth is clockwise from north in the local east/north/up frame. Tilt
          is measured from horizontal (panel normal from zenith): 0° faces up,
          90° is vertical. Ideal tracking assumes normal incidence whenever the
          Sun is visible.
        </p>
        <p>
          Left-endpoint power and visibility are held over each actual timestamp
          interval, including a shorter final interval. No energy is added after
          the last timestamp. Surplus charges the battery with the configured
          charge efficiency; deficits draw stored energy with discharge losses.
          Excess at capacity is curtailed; demand beyond available energy is
          recorded as unserved.
        </p>
        <p>
          No thermal, dust, degradation, charge-rate, self-discharge or failure
          model is included.{" "}
          {a.terrain.available
            ? "Only the supplied terrain horizon is included; unresolved and beyond-range shadows remain unknown."
            : "Local terrain shadows are unmodelled."}{" "}
          Panel efficiency is an input, not sunlight availability.
        </p>
        <p>
          <a
            href="https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/point-value-models/pvwatts/"
            target="_blank"
            rel="noreferrer"
          >
            Sandia photovoltaic modelling reference
          </a>{" "}
          · This application uses the simple model documented above, not the
          full terrestrial PVWatts model.
        </p>
        <button className="button primary" onClick={() => onNavigate(4)}>
          Generate mission report
        </button>
      </section>
    </div>
  );
}
