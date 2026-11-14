"use client";

import { downloadReport } from "../lib/download-report";
import { formatCoordinates } from "../lib/format-coordinates";
import { useState } from "react";
import type { Mission, Site } from "../app/types";
import type { Research, ResearchComparison, ResearchSpan } from "./LandingResearch";
import { missionKey, sameMission, comparableScores, comparableVisibility, solarEstimate, type PlanBForecast } from "../lib/plan-b";
import ResearchElevationChart from "./ResearchElevationChart";
import ResearchSolarEstimate from "./ResearchSolarEstimate";
import { defaultSolar, type SolarSettings } from "./mission-lab/scenario-science";

const format = (value: number | null | undefined, unit = "") =>
  value == null ? "Unavailable" : `${value.toFixed(1)}${unit}`;
const utc = (value: string) => {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString().replace("T", " ").replace(/\.000Z$/, " UTC") : "Unavailable";
};
const totalHours = (spans: ResearchSpan[] | undefined) =>
  spans?.reduce((sum, span) => sum + span.hours, 0);

export function visibilityWindows(result: Research) {
  const { geometry } = result;
  return [
    ["Sun visible", geometry.sunlight_windows],
    ["Earth visible", geometry.earth_windows],
    ["Sun and Earth visible", geometry.metrics?.operational_windows],
    ["Darkness", geometry.metrics?.darkness_windows],
    ["Earth blackout", geometry.metrics?.blackout_windows],
  ] as const;
}

export function ResearchWindows({ result }: { result: Research }) {
  if (!result.geometry.available) return <p>{result.geometry.reason ?? "Visibility windows unavailable."}</p>;
  return <div className="research-windows">{visibilityWindows(result).map(([label, windows]) => (
    <details key={label}>
      <summary>{label} · {format(totalHours(windows), " h")}</summary>
      {windows?.length ? (
        <ul>{windows.map((span) => <li key={span.start}>{utc(span.start)} to {utc(span.end)} · {format(span.hours, " h")}</li>)}</ul>
      ) : <p>{windows ? "No intervals in this mission window." : "Intervals unavailable."}</p>}
    </details>
  ))}</div>;
}

const measurements: { label: string; value: (r: Research) => string }[] = [
  { label: "Sun visibility", value: (r) => format(r.factors.S.score, "%") },
  { label: "Earth visibility", value: (r) => format(r.factors.C.score, "%") },
  { label: "Simultaneous visibility", value: (r) => format(totalHours(r.geometry.metrics?.operational_windows), " h") },
  { label: "Longest darkness", value: (r) => format(r.geometry.metrics?.longest_darkness_hours, " h") },
  { label: "Longest Earth blackout", value: (r) => format(r.geometry.metrics?.longest_blackout_hours, " h") },
  { label: "Elevation above reference sphere", value: (r) => r.terrain.available
    ? format(r.terrain.elevation_m, r.terrain.coverage_type === "regional" ? " m · regional" : " m · footprint")
    : format(r.observer_height?.value, r.observer_height?.coverage_type === "global" ? " m · approximate global" : " m · regional") },
  { label: "DEM pixel spacing", value: (r) => format(r.terrain.available ? r.terrain.resolution_m : undefined, " m") },
  { label: "Neighbourhood slope (p95 / maximum)", value: (r) => r.terrain.available
    ? `${format(r.terrain.slope_p95_deg, "°")} / ${format(r.terrain.slope_max_deg, "°")}` : "Unavailable" },
  { label: "Neighbourhood roughness (RMS)", value: (r) => format(r.terrain.available ? r.terrain.roughness_m : undefined, " m") },
  { label: "Neighbourhood relief", value: (r) => format(r.terrain.available ? r.terrain.relief_m : undefined, " m") },
  { label: "Mapped hazard fraction", value: (r) => r.hazards?.available && r.hazards.value != null
    ? format(r.hazards.value * 100, "%") : "Unavailable" },
  { label: "Observed seasonal temperature range", value: (r) => r.temperature.available
    ? `${format(r.temperature.minimum_k)}–${format(r.temperature.maximum_k)} K` : "Unavailable" },
  { label: "Mapped permanent shadow", value: (r) => r.ice?.radius_m && r.ice.value != null
    ? `${format(100 * r.ice.value, "%")} within ${r.ice.radius_m.toLocaleString("en-GB")} m`
    : r.factors.I?.quality === "psr_pixel"
      ? `${r.ice?.value === 1 ? "Mapped shadow" : "Outside mapped shadow"} · ${r.ice?.source?.resolution_m} m pixel`
      : "Unavailable" },
  { label: "Terrain screening", value: (r) => r.geometry.mode === "terrain_screened"
    ? "Terrain-screened" : r.geometry.mode === "broad_terrain_screened"
      ? `Broad terrain screening · ${r.horizon.source?.name ?? "LOLA"}`
      : r.geometry.available ? "Reference geometry only" : "Unavailable" },
  { label: "Research suitability score", value: (r) => format(r.score, r.provisional ? " / 100 · provisional" : " / 100") },
  { label: "Missing factors", value: (r) => r.missing.map((key) => r.factors[key]?.name ?? key).join(", ") || "None" },
  { label: "Measured limits exceeded", value: (r) => r.constraints_failed.join(" ") || "None in available evidence" },
];

const csvCell = (value: string) => {
  const safe = /^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export default function ResearchComparisonReport({ mission, alternatives, comparison, scenarios, evidenceSite, onEvidenceSiteChange, onInspect, equipment = defaultSolar }: {
  mission: Mission;
  alternatives: Site[];
  comparison: ResearchComparison | null;
  scenarios: PlanBForecast[];
  evidenceSite: string;
  onEvidenceSiteChange: (site: string) => void;
  onInspect: (result: Research) => void;
  equipment?: SolarSettings;
}) {
  const [preferred, setPreferred] = useState("");
  const [baselineKey, setBaselineKey] = useState("");
  const planned = [mission, ...alternatives.map((site) => ({ ...mission, ...site }))];
  const entries = [
    ...planned.map((point) => ({
      mission: point,
      assessment: comparison?.results.find((result) => sameMission(result.mission, point)),
      failure: comparison?.failures[`${point.latitude},${point.longitude}`],
      scenario: undefined,
    })),
    ...scenarios.filter(({ result }) => !planned.some((point) => sameMission(point, result.mission)))
      .map((scenario) => ({ mission: scenario.result.mission, assessment: scenario.result, failure: undefined, scenario })),
  ];
  const complete = entries.flatMap(({ assessment }) => assessment ? [assessment] : []);
  if (!complete.length || entries.length < 2) return null;
  const choice = complete.find((r) => missionKey(r.mission) === preferred);
  const evidence = complete.find((r) => missionKey(r.mission) === evidenceSite) ?? complete[0];
  const label = (point: Mission) => entries.some((entry) => entry.scenario && sameMission(entry.mission, point))
    ? `${point.name} · ${utc(point.start)}`
    : point.name;
  const assessmentStatus = (entry: (typeof entries)[number]) => {
    if (entry.scenario?.reasons.length) return "What IF forecast · landing checks unresolved or exceeded";
    if (entry.assessment) return entry.scenario ? "What IF assessment" : "Assessed";
    return entry.failure ? "Assessment failed" : "Awaiting assessment";
  };
  const incomplete = complete.length < entries.length;
  const baseline = entries.findIndex(({ mission }) => missionKey(mission) === baselineKey);
  const baseIndex = Math.max(0, baseline);
  const base = entries[baseIndex];
  const duration = (point: Mission) => (Date.parse(point.end) - Date.parse(point.start)) / 3600000;
  const sharedWindow = entries.every(({ mission: point }) =>
    Date.parse(point.start) === Date.parse(base.mission.start) && Date.parse(point.end) === Date.parse(base.mission.end));
  const sharedLocation = entries.every(({ mission: point }) =>
    point.latitude === base.mission.latitude && point.longitude === base.mission.longitude);
  const mismatchedEvidence = complete.length > 1 && complete.some((r) => !comparableScores(complete[0], r));
  const advice = incomplete
    ? "Some selected options are awaiting an assessment or have unavailable data."
    : mismatchedEvidence
      ? "Evidence coverage or methods differ. Compare the measured factors before interpreting provisional scores."
      : "Use the mission metrics and measured limits to compare the selected options.";
  const solar = complete.map((r) => [missionKey(r.mission), solarEstimate(r, equipment)?.total_kwh] as const);
  const energy = new Map(solar);
  const sunlight = (r?: Research) => r?.geometry.sunlight_hours ?? totalHours(r?.geometry.sunlight_windows);
  const maxHours = Math.max(...entries.map(({ mission: point }) => duration(point)));
  const compatible = (entry: (typeof entries)[number]) => entry.assessment && base.assessment &&
    duration(entry.mission) === duration(base.mission) &&
    entry.mission.interval_minutes === base.mission.interval_minutes &&
    entry.mission.clearance_deg === base.mission.clearance_deg &&
    comparableVisibility(base.assessment, entry.assessment);
  const delta = (value: number | undefined, reference: number | undefined, unit: string) => {
    if (value == null || reference == null) return "Unavailable";
    const difference = value - reference;
    return (difference > 0 ? "+" : "") + format(difference, unit);
  };
  const settings = [
    ["Start (UTC)", utc(mission.start)],
    ["End (UTC)", utc(mission.end)],
    ["Duration", format((Date.parse(mission.end) - Date.parse(mission.start)) / 3600000, " h")],
    ["Sampling", `${mission.interval_minutes} min`],
    ["Earth clearance", `${mission.clearance_deg}°`],
  ];
  const identityRows = [
    ["Coordinates (planetocentric, east-positive)", ...entries.map(({ mission }) => `${mission.latitude}°, ${mission.longitude}°`)],
    ["Touchdown (UTC)", ...entries.map(({ mission }) => utc(mission.start))],
    ["Mission end (UTC)", ...entries.map(({ mission }) => utc(mission.end))],
    ["Assessment status", ...entries.map(assessmentStatus)],
  ];
  const sunlightRow = ["Sunlight (mission total)", ...entries.map(({ assessment }) => format(sunlight(assessment), " h"))];
  const energyRow = ["Estimated solar energy", ...entries.map(({ mission: point }) => format(energy.get(missionKey(point)), " kWh"))];
  const evidenceRow = ["Nominal evidence coverage", ...entries.map(({ assessment }) => format(assessment && assessment.available_weight * 100, "%"))];
  const measurementRows = measurements.map(({ label, value }) => [
    label, ...entries.map((entry) => entry.assessment ? value(entry.assessment) : "Unavailable"),
  ]);
  const grid = [
    ...identityRows, sunlightRow, energyRow, evidenceRow, ...measurementRows,
    ["Assessment notes", ...entries.map(({ assessment, scenario, failure }) =>
      [...new Set([...(failure ? [failure] : []), ...(scenario?.reasons ?? []), ...(assessment?.warnings ?? [])])].join(" ") || "—",
    )],
  ];
  const headers = ["Evidence", ...entries.map(({ mission }) => label(mission))];
  function comparisonTable(rows: string[][], title: string) {
    return <div className="table-scroll" tabIndex={0} role="region" aria-label={title}>
      <table aria-label={title}>
        <thead><tr><th scope="col">Metric</th>{entries.map(({ mission: point }, index) =>
          <th scope="col" className={`report-option-${index}`} key={missionKey(point)}>{label(point)}</th>)}</tr></thead>
        <tbody>{rows.map(([row, ...cells]) => (
          <tr key={row}><th scope="row">{row}</th>{cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>;
  }
  const operationalRows = [sunlightRow, ...measurementRows.slice(1, 5), energyRow];
  const terrainDescription = (r: Research) => r.terrain.available
    ? `${r.terrain.coverage_type === "regional" ? "Regional" : "Local"} DEM · ${format(r.terrain.resolution_m, " m")} pixels.`
    : "Local terrain measurements are unavailable.";
  const terrainRows = [
    ["DEM coverage", ...entries.map(({ assessment }) => assessment ? terrainDescription(assessment) : "Unavailable")],
    ...measurementRows.slice(5, 14),
    evidenceRow,
  ];
  const scoreRows = measurementRows.slice(14);
  return (
    <section id="research-report" className="panel research-report comparison-report" aria-labelledby="research-report-title" tabIndex={-1}>
      <header className="comparison-report-header">
        <div>
          <span className="eyebrow">Selected options · Research analysis</span>
          <h2 id="research-report-title">{sharedLocation ? "Mission date comparison report" : sharedWindow ? "Location comparison report" : "Location and mission window comparison report"}</h2>
          <p>Compare mission availability, terrain evidence and operational trade-offs.</p>
          <p role="status">{complete.length} of {entries.length} selected assessments ready</p>
        </div>
        <div className="account-actions research-export-controls">
          <button className="button primary" onClick={() => {
            const closed = Array.from(document.querySelectorAll<HTMLDetailsElement>("#research-report details:not([open])"));
            closed.forEach((details) => { details.open = true; });
            try { window.print(); }
            finally { closed.forEach((details) => { details.open = false; }); }
          }}>Print or save PDF</button>
          <details><summary className="button subtle">Export</summary>
            <button className="button subtle" onClick={() => downloadReport(JSON.stringify({
          schema_version: 1, mission, baseline: base.mission, solar_settings: equipment, preferred_site: choice?.mission ?? null, recommendation: advice,
          sites: entries.map((entry) => ({
            site: { name: entry.mission.name, latitude: entry.mission.latitude, longitude: entry.mission.longitude },
            mission: entry.mission,
            assessment: entry.assessment ?? null,
            status: assessmentStatus(entry),
            ...(entry.failure ? { error: entry.failure } : {}),
            ...(entry.scenario ? { what_if: {
              reasons: entry.scenario.reasons,
              estimated_energy_kwh: entry.scenario.energy,
              terrain_bounds: entry.scenario.bounds,
              screening_radius_m: entry.scenario.screening_radius_m,
            } } : {}),
          })),
        }, null, 2), "json")}>Export research JSON</button>
        <button className="button subtle" onClick={() => downloadReport([
          headers, ...grid, [], ["Comparison baseline", label(base.mission)],
          ...settings, ["Preferred point", choice ? label(choice.mission) : ""], ["Recommendation", advice],
        ].map((row) => row.map(csvCell).join(",")).join("\r\n"), "csv")}>Export comparison CSV</button>
          </details>
        </div>
      </header>
      <p className="report-panel">{sharedWindow ? <>Shared mission window · {utc(base.mission.start)} → {utc(base.mission.end)}</>
        : "Mission windows differ. Dates and durations are shown for each option."}</p>
      <div className="report-option-grid">
        {entries.map(({ mission: point, assessment }, index) => (
          <article className={`report-option report-option-${index}`} key={missionKey(point)}>
            <h3>{point.name}{index === baseIndex && " · Baseline"}</h3>
            <p>{formatCoordinates(point.latitude, point.longitude)} · {format(duration(point), " h")}</p>
            {!sharedWindow && <p>{utc(point.start)} → {utc(point.end)}</p>}
            <p>{assessmentStatus(entries[index])}</p>
            {assessment && <button className="text-button" onClick={() => onInspect(assessment)}>View full result ↗</button>}
          </article>
        ))}
      </div>
      <section className="report-panel">
        <h3>Executive interpretation</h3>
        <p className={mismatchedEvidence ? "report-evidence-warning" : undefined}>{advice}</p>
        {complete.some((r) => r.provisional) && <p>Provisional research scores reflect the available evidence. They do not establish landing safety.</p>}
      </section>
      <section className="report-panel">
        <h3>Mission availability &amp; energy</h3>
        <div className="report-analysis-grid">
          {comparisonTable(operationalRows, "Side-by-side research comparison")}
          <figure>
            <figcaption>Sunlight over a common {format(maxHours, " h")} scale</figcaption>
            {entries.map(({ mission: point, assessment }, index) => {
              const hours = sunlight(assessment);
              return <div key={missionKey(point)} className={`report-sun-bar report-option-${index}`}>
                <div><strong>{label(point)}</strong><span>{format(hours, " h")}</span></div>
                {hours != null && <meter min={0} max={maxHours} value={hours} aria-label={`${label(point)} sunlight hours`} />}
              </div>;
            })}
          </figure>
        </div>
        <label className="research-preferred">Comparison baseline
          <select value={missionKey(base.mission)} onChange={(event) => setBaselineKey(event.target.value)}>
            {entries.map(({ mission: point }) => <option key={missionKey(point)} value={missionKey(point)}>{label(point)}</option>)}
          </select>
        </label>
        <ul>{entries.map((entry, i) => i !== baseIndex && (
          <li key={missionKey(entry.mission)}><strong>{label(entry.mission)}</strong> · {compatible(entry) ? <>
            {delta(sunlight(entry.assessment), sunlight(base.assessment), " h")} sunlight ·{" "}
            {delta(entry.assessment?.factors.C?.score ?? undefined, base.assessment?.factors.C?.score ?? undefined, " pp")} Earth visibility ·{" "}
            {delta(totalHours(entry.assessment?.geometry.metrics?.operational_windows), totalHours(base.assessment?.geometry.metrics?.operational_windows), " h")} simultaneous visibility ·{" "}
            {delta(entry.assessment?.geometry.metrics?.longest_darkness_hours, base.assessment?.geometry.metrics?.longest_darkness_hours, " h")} longest darkness ·{" "}
            {delta(entry.assessment?.geometry.metrics?.longest_blackout_hours, base.assessment?.geometry.metrics?.longest_blackout_hours, " h")} longest Earth outage ·{" "}
            {delta(energy.get(missionKey(entry.mission)), energy.get(missionKey(base.mission)), " kWh")} solar energy
          </> : "Differences require compatible duration, sampling and visibility evidence."}</li>
        ))}</ul>
        <p>{equipment.area_m2} m² array · {equipment.efficiency_pct}% efficiency · {equipment.irradiance_wm2} W/m² · {equipment.loss_pct}% losses · {equipment.tracking ? "Sun tracking" : `Fixed panel, tilt ${equipment.tilt_deg}°, azimuth ${equipment.azimuth_deg}°`}</p>
        <p>Dark intervals increase storage needs. Earth visibility measures line of sight. Radio contact also depends on equipment and ground stations.</p>
      </section>
      <section className="report-panel">
        <h3>Terrain &amp; environmental evidence</h3>
        {comparisonTable(terrainRows, "Terrain and environmental evidence")}
        {complete.some((r) => !r.terrain.available) && (
          <p>Local terrain measurements are unavailable for {complete.filter((r) => !r.terrain.available).map((r) => label(r.mission)).join(", ")}.</p>
        )}
        <p>Historical temperatures describe previous observations. Permanent shadow can preserve ice, whose presence remains unconfirmed.</p>
      </section>
      <section className="report-panel">
        <h3>Trade-offs by option</h3>
        <div className="report-option-grid">{entries.map(({ mission: point, assessment }, index) => (
          <article className={`report-option report-option-${index}`} key={missionKey(point)}>
            <h4>{label(point)}</h4>
            <p>{assessment ? <>
              {format(sunlight(assessment), " h")} sunlight · {format(assessment.geometry.metrics?.longest_blackout_hours, " h")} longest Earth outage.
              {assessment.constraints_failed.length > 0 && <> {assessment.constraints_failed[0]}</>}
            </> : "Assessment unavailable."}</p>
          </article>
        ))}</div>
      <label className="research-preferred">Preferred point for further study
        <select value={choice ? preferred : ""} onChange={(event) => setPreferred(event.target.value)}>
          <option value="">Select an assessed point</option>
          {complete.map((r) => <option key={missionKey(r.mission)} value={missionKey(r.mission)}>{label(r.mission)}</option>)}
        </select>
      </label>
      {choice && <p><strong>{label(choice.mission)}</strong> selected for further study. {choice.constraints_failed.join(" ") || "Review the unresolved terrain and mission constraints before proceeding."}</p>}
      </section>
      <section className="report-panel">
        <h3>Questions for further study</h3>
        <ul>{complete.flatMap((r) => [
          ...(!r.terrain.available ? ["Can local terrain measurements be obtained?"] : []),
          ...(!r.temperature.available ? ["Can historical temperature coverage be verified?"] : []),
          ...(!r.hazards?.available ? ["Can boulder and crater hazards be assessed?"] : []),
          ...r.constraints_failed,
        ].map((question) => <li key={missionKey(r.mission) + question}><strong>{label(r.mission)}</strong> · {question}</li>))}</ul>
      </section>
      <details className="report-panel" open>
        <summary>Visibility timelines</summary>
      <section className="research-report-site" aria-labelledby="report-evidence-title">
        <h3 id="report-evidence-title">Mission evidence · {label(evidence.mission)}</h3>
        {complete.length > 1 && (
          <label className="research-preferred">Site to inspect
            <select value={missionKey(evidence.mission)} onChange={(event) => onEvidenceSiteChange(event.target.value)}>
              {complete.map((r) => <option key={missionKey(r.mission)} value={missionKey(r.mission)}>{label(r.mission)}</option>)}
            </select>
          </label>
        )}
        <h4>Sun and Earth elevation over time</h4>
        <ResearchElevationChart key={missionKey(evidence.mission)} result={evidence} />
        <ResearchSolarEstimate result={evidence} equipment={equipment} />
      </section>
      </details>
      <details className="report-panel">
          <summary>Score breakdown &amp; evidence coverage</summary>
          {comparisonTable(scoreRows, "Score and assessment evidence")}
          <p>Missing factors redistribute their weight across the available evidence. Both visibility factors are required for an overall score.</p>
          {complete.map((assessment) => (
            <details key={missionKey(assessment.mission)}>
              <summary>{label(assessment.mission)}</summary>
              {assessment.formula && <p>{assessment.formula}</p>}
              <ul>{Object.entries(assessment.factors).map(([key, factor]) => (
                <li key={key}>
                  <strong>{factor.name} · {format(factor.score, " / 100")}</strong>
                  <p>Nominal weight {format(factor.weight * 100, "%")} · Used weight {format(factor.effective_weight == null ? undefined : factor.effective_weight * 100, "%")}</p>
                  <p>{factor.explanation}</p>
                </li>
              ))}</ul>
            </details>
          ))}
      </details>
      <details className="report-panel">
      <summary>Sources, sampling &amp; model limitations</summary>
      <dl className="research-report-settings">{settings.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
      {complete.map((r) => (
        <article className="research-report-site" key={missionKey(r.mission)}>
          <h3>{label(r.mission)}</h3>
          <p>{r.mission.interval_minutes}-minute samples · {r.mission.clearance_deg}° Earth clearance</p>
          {r !== evidence && (
            <div className="research-print-only">
              <ResearchElevationChart result={r} />
              <ResearchSolarEstimate result={r} equipment={equipment} />
            </div>
          )}
          <ResearchWindows result={r} />
          <p>{r.horizon.method ?? r.horizon.reason}</p>
          <ul>{Object.entries(r.geometry.sources ?? {}).map(([body, source]) => (
            <li key={body}>{body} · {source.ephemeris} · {source.orientation}</li>
          ))}{[r.terrain.source, r.horizon.source, r.temperature.source, r.hazards?.source, r.ice?.source].map((source, index) => source?.source_url && (
            <li key={index}><a href={source.source_url}>{source.name ?? "Dataset source"}</a>{source.resolution_m ? ` · ${format(source.resolution_m, " m")}` : ""}{source.observation_period ? ` · ${source.observation_period}` : ""}</li>
          ))}</ul>
          {r.warnings.length > 0 && <ul>{r.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        </article>
      ))}
      <p><a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html">JPL Horizons surface observer data</a></p>
      <ul>{[...new Set(complete.flatMap(({ limitations }) => limitations))].map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </details>
    </section>
  );
}
