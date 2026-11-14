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
  value == null || !Number.isFinite(value) ? "Unavailable" : `${value.toFixed(1)}${unit}`;
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

export function ResearchWindows({ result, showTotals = true }: { result: Research; showTotals?: boolean }) {
  if (!result.geometry.available) return <p>{result.geometry.reason ?? "Visibility windows unavailable."}</p>;
  return <div className="research-windows">{visibilityWindows(result).map(([label, windows]) => (
    <details key={label}>
      <summary>{label}{showTotals && ` · ${format(totalHours(windows), " h")}`}</summary>
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
  { label: "Longest Earth visibility gap", value: (r) => format(r.geometry.metrics?.longest_blackout_hours, " h") },
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
  { label: "Missing factors", value: (r) => Array.isArray(r.missing) ? r.missing.map((key) => r.factors[key]?.name ?? key).join(", ") || "None" : "Unavailable" },
  { label: "Measured limits exceeded", value: (r) => r.constraints_failed.join(" ") || "None in available evidence" },
];

const csvCell = (value: string) => {
  const safe = /^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export default function ResearchComparisonReport({ mission, alternatives, comparison, scenarios, evidenceSite, onEvidenceSiteChange, onInspect, equipment = defaultSolar, singleMission = false }: {
  mission: Mission;
  alternatives: Site[];
  comparison: ResearchComparison | null;
  scenarios: PlanBForecast[];
  evidenceSite: string;
  onEvidenceSiteChange: (site: string) => void;
  onInspect: (result: Research) => void;
  equipment?: SolarSettings;
  singleMission?: boolean;
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
  if (!complete.length || (!singleMission && entries.length < 2)) return null;
  const choice = complete.find((r) => missionKey(r.mission) === preferred);
  const evidence = complete.find((r) => missionKey(r.mission) === evidenceSite) ?? complete[0];
  const label = (point: Mission) => entries.some((entry) => entry.mission.name === point.name && !sameMission(entry.mission, point))
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
  const advice = singleMission ? "Review mission visibility, terrain measurements and evidence coverage for this site." : incomplete
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
  const identityRows = [
    ["Coordinates (planetocentric, east-positive)", ...entries.map(({ mission }) => `${mission.latitude}°, ${mission.longitude}°`)],
    ["Touchdown (UTC)", ...entries.map(({ mission }) => utc(mission.start))],
    ["Mission end (UTC)", ...entries.map(({ mission }) => utc(mission.end))],
    ["Sampling interval", ...entries.map(({ mission }) => `${mission.interval_minutes} min`)],
    ["Earth clearance", ...entries.map(({ mission }) => `${mission.clearance_deg}°`)],
    ["Assessment status", ...entries.map(assessmentStatus)],
  ];
  const sunlightRow = ["Sunlight (mission total)", ...entries.map(({ assessment }) => format(sunlight(assessment), " h"))];
  const energyRow = ["Estimated solar energy", ...entries.map(({ mission: point }) => format(energy.get(missionKey(point)), " kWh"))];
  const scenarioEnergyRow = ["What IF solar energy estimate at evaluation", ...entries.map(({ mission: point, scenario }) => {
    const current = energy.get(missionKey(point));
    return scenario?.energy != null && format(scenario.energy) !== format(current)
      ? format(scenario.energy, " kWh") : "—";
  })];
  const hasScenarioEnergyDifference = scenarioEnergyRow.slice(1).some((cell) => cell !== "—");
  const evidenceRow = ["Nominal evidence coverage", ...entries.map(({ assessment }) => format(assessment?.available_weight == null ? undefined : assessment.available_weight * 100, "%"))];
  const measurementRows = measurements.map(({ label, value }) => [
    label, ...entries.map((entry) => entry.assessment ? value(entry.assessment) : "Unavailable"),
  ]);
  const warnings = entries.map(({ assessment, scenario, failure }) =>
    [...new Set([...(failure ? [failure] : []), ...(scenario?.reasons ?? []),
      ...(assessment?.warnings ?? [])])],
  );
  const sharedWarnings = warnings[0].filter((warning) => warnings.every((notes) => notes.includes(warning)));
  const limitations = new Map<string, string[]>();
  for (const [index, entry] of entries.entries()) {
    for (const note of new Set(entry.assessment?.limitations ?? [])) {
      if (!warnings[index].includes(note)) {
        limitations.set(note, [...(limitations.get(note) ?? []), label(entry.mission)]);
      }
    }
  }
  const grid = [
    ...identityRows, sunlightRow, energyRow, ...(hasScenarioEnergyDifference ? [scenarioEnergyRow] : []), evidenceRow, ...measurementRows,
    ["Assessment notes", ...warnings.map((notes) => notes.join(" ") || "—")],
    ["Model limitations", ...entries.map(({assessment}) => [...new Set(assessment?.limitations ?? [])].join(" ") || "—")],
  ];
  const headers = ["Evidence", ...entries.map(({ mission }) => label(mission))];
  function comparisonTable(rows: string[][], title: string, showSunlight = false) {
    return <div className="table-scroll" tabIndex={0} role="region" aria-label={title}>
      <table aria-label={title}>
        <thead><tr><th scope="col">Metric</th>{entries.map(({ mission: point }, index) =>
          <th scope="col" className={`report-option-${index}`} key={missionKey(point)}>{label(point)}</th>)}</tr></thead>
        <tbody>{rows.map(([row, ...cells]) => (
          <tr key={row}><th scope="row">{row}</th>{cells.map((cell, index) => <td key={index} className={showSunlight ? "report-metric-value" : undefined}>
            {cell}
            {showSunlight && row === sunlightRow[0] && cell !== "Unavailable" && maxHours > 0 && (
              <meter className="report-sunlight-meter" min={0} max={maxHours}
                value={sunlight(entries[index].assessment) ?? 0} aria-label={`${label(entries[index].mission)} sunlight hours`} />
            )}
          </td>)}</tr>
        ))}</tbody>
      </table>
    </div>;
  }
  const operationalRows = [sunlightRow, ...measurementRows.slice(1, 5), energyRow, ...(hasScenarioEnergyDifference ? [scenarioEnergyRow] : [])];
  const terrainRows = [...measurementRows.slice(5, 14), evidenceRow, measurementRows[15], measurementRows[16]];
  const scoreRows = [measurementRows[14]];
  return (
    <section id="research-report" className="panel research-report comparison-report" aria-labelledby="research-report-title" tabIndex={-1}>
      <header className="comparison-report-header">
        <div>
          <span className="eyebrow">{singleMission ? "Lunar Landing Site Navigator" : "Selected options · Research analysis"}</span>
          <h2 id="research-report-title">{singleMission ? "Landing site assessment report" : sharedLocation ? "Mission date comparison report" : sharedWindow ? "Location comparison report" : "Location and mission window comparison report"}</h2>
          <p>{singleMission ? "Mission availability, terrain evidence and assessment methods." : "Compare mission availability, terrain evidence and operational trade-offs."}</p>
          {!singleMission && <p role="status">{complete.length} of {entries.length} selected assessments ready</p>}
        </div>
        {!singleMission && <div className="account-actions research-export-controls">
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
          ["Preferred point", choice ? label(choice.mission) : ""], ["Recommendation", advice],
        ].map((row) => row.map(csvCell).join(",")).join("\r\n"), "csv")}>Export comparison CSV</button>
          </details>
        </div>}
      </header>
      <p className="report-panel">{sharedWindow ? <>{singleMission ? "Mission window" : "Shared mission window"} · {utc(base.mission.start)} → {utc(base.mission.end)}</>
        : "Mission windows differ. Dates and durations are shown for each option."}</p>
      <div className="report-option-grid">
        {entries.map(({ mission: point, assessment }, index) => (
          <article className={`report-option report-option-${index}`} key={missionKey(point)}>
            <h3>{point.name}{!singleMission && index === baseIndex && " · Baseline"}</h3>
            <p>{formatCoordinates(point.latitude, point.longitude)} · {format(duration(point), " h")}</p>
            {!sharedWindow && <p>{utc(point.start)} → {utc(point.end)}</p>}
            <p>{assessmentStatus(entries[index])}</p>
            {!singleMission && assessment && <button className="text-button" onClick={() => onInspect(assessment)}>View full result ↗</button>}
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
        {comparisonTable(operationalRows, "Side-by-side research comparison", true)}
        {hasScenarioEnergyDifference && <p>The What IF estimate records the value at evaluation. The main energy row uses the report’s current equipment settings.</p>}
        {maxHours > 0 && entries.some(({ assessment }) => sunlight(assessment) != null) && (
          <p>Sunlight bars use a common 0–{format(maxHours, " h")} scale.</p>
        )}
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
        {solar.some(([, value]) => value != null) && <details><summary>Energy estimate assumptions</summary><p>{equipment.area_m2} m² array · {equipment.efficiency_pct}% efficiency · {equipment.irradiance_wm2} W/m² · {equipment.loss_pct}% losses · {equipment.tracking ? "Sun tracking" : `Fixed panel, tilt ${equipment.tilt_deg}°, azimuth ${equipment.azimuth_deg}°`}</p></details>}
        <p>Dark intervals increase storage needs. Earth visibility measures line of sight. Radio contact also depends on equipment and ground stations.</p>
      </section>
      <section className="report-panel">
        <h3>Terrain &amp; environmental evidence</h3>
        <div className="report-option-grid">
          {entries.map(({ mission: point }, index) => (
            <article className={`report-option report-option-${index}`} key={missionKey(point)}>
              <h4>{label(point)}</h4>
              <dl className="report-terrain-values">
                {terrainRows.map(([metric, ...values]) => (
                  <div key={metric}><dt>{metric}</dt><dd>{values[index]}</dd></div>
                ))}
              </dl>
              {warnings[index].some((warning) => !sharedWarnings.includes(warning)) && (
                <ul className="report-evidence-warning">
                  {warnings[index].filter((warning) => !sharedWarnings.includes(warning))
                    .map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </article>
          ))}
        </div>
        {!!sharedWarnings.length && (
          <aside className="report-shared-warning report-evidence-warning">
            <strong>Warnings for all selected options</strong>
            <ul>{sharedWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </aside>
        )}
        <p>Nominal evidence coverage describes the inputs available for scoring. Landing safety requires separate verification.</p>
        <p>Historical temperatures describe previous observations. Permanent shadow can preserve ice, whose presence remains unconfirmed.</p>
      <label className="research-preferred">Preferred point for further study
        <select value={choice ? preferred : ""} onChange={(event) => setPreferred(event.target.value)}>
          <option value="">Select an assessed point</option>
          {complete.map((r) => <option key={missionKey(r.mission)} value={missionKey(r.mission)}>{label(r.mission)}</option>)}
        </select>
      </label>
      {choice && <p><strong>{label(choice.mission)}</strong> selected for further study.</p>}
      </section>
      <section className="report-panel">
        <h3>Questions for further study</h3>
        <ul>{complete.flatMap((r) => [
          ...(!r.terrain.available ? ["Can local terrain measurements be obtained?"] : []),
          ...(!r.temperature.available ? ["Can historical temperature coverage be verified?"] : []),
          ...(!r.hazards?.available ? ["Can boulder and crater hazards be assessed?"] : []),
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
        <ResearchSolarEstimate result={evidence} equipment={equipment} reportDetail />
      </section>
      </details>
      <details className="report-panel">
          <summary>Score breakdown</summary>
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
      {complete.map((r) => (
        <article className="research-report-site" key={missionKey(r.mission)}>
          <h3>{label(r.mission)}</h3>
          <p>{r.mission.interval_minutes}-minute samples · {r.mission.clearance_deg}° Earth clearance</p>
          {r !== evidence && (
            <div className="research-print-only">
              <ResearchElevationChart result={r} />
              <ResearchSolarEstimate result={r} equipment={equipment} reportDetail />
            </div>
          )}
          <ResearchWindows result={r} showTotals={false} />
          <p>{r.horizon.method ?? r.horizon.reason}</p>
          <ul>{Object.entries(r.geometry.sources ?? {}).map(([body, source]) => (
            <li key={body}>{body} · {source.ephemeris} · {source.orientation}</li>
          ))}{[r.terrain.source, r.horizon.source, r.temperature.source, r.hazards?.source, r.ice?.source].map((source, index) => source?.source_url && (
            <li key={index}><a href={source.source_url}>{source.name ?? "Dataset source"}</a>{source.resolution_m ? ` · ${format(source.resolution_m, " m")}` : ""}{source.observation_period ? ` · ${source.observation_period}` : ""}</li>
          ))}</ul>
        </article>
      ))}
      <p><a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html">JPL Horizons surface observer data</a></p>
      <ul>{[...limitations].map(([limit, sites]) => (
        <li key={limit}>{sites.length < entries.length && <strong>{sites.join(", ")} · </strong>}{limit}</li>
      ))}</ul>
      </details>
    </section>
  );
}
