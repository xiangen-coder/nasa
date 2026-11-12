"use client";

import { useState } from "react";
import type { Mission, Site } from "../app/types";
import type { Research, ResearchComparison, ResearchSpan } from "./LandingResearch";
import { missionKey, sameMission, type PlanBForecast } from "../lib/plan-b";
import ResearchElevationChart from "./ResearchElevationChart";
import ResearchSolarEstimate from "./ResearchSolarEstimate";
import type { SolarSettings } from "./mission-lab/scenario-science";

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
  { label: "DEM pixel spacing", value: (r) => format(r.terrain.resolution_m, " m") },
  { label: "Neighbourhood slope (p95 / maximum)", value: (r) => r.terrain.available
    ? `${format(r.terrain.slope_p95_deg, "°")} / ${format(r.terrain.slope_max_deg, "°")}` : "Unavailable" },
  { label: "Neighbourhood roughness (RMS)", value: (r) => format(r.terrain.roughness_m, " m") },
  { label: "Neighbourhood relief", value: (r) => format(r.terrain.relief_m, " m") },
  { label: "Mapped hazard fraction", value: (r) => r.hazards?.available && r.hazards.value != null
    ? format(r.hazards.value * 100, "%") : "Unavailable" },
  { label: "Observed seasonal temperature range", value: (r) => r.temperature.available
    ? `${format(r.temperature.minimum_k)}–${format(r.temperature.maximum_k)} K` : "Unavailable" },
  { label: "Water ice potential", value: (r) => format(r.factors.I?.score, " / 100") },
  { label: "Mapped permanent shadow", value: (r) => r.ice?.radius_m && r.ice.value != null
    ? `${format(100 * r.ice.value, "%")} within ${r.ice.radius_m.toLocaleString("en-GB")} m` : "Unavailable" },
  { label: "Terrain screening", value: (r) => r.geometry.mode === "terrain_screened"
    ? "Terrain-screened" : r.geometry.available ? "Reference geometry only" : "Unavailable" },
  { label: "Research suitability score", value: (r) => format(r.score, r.provisional ? " / 100 · provisional" : " / 100") },
  { label: "Missing factors", value: (r) => r.missing.map((key) => r.factors[key]?.name ?? key).join(", ") || "None" },
  { label: "Measured limits exceeded", value: (r) => r.constraints_failed.join(" ") || "None in available evidence" },
];

function recommendation(results: Research[], total: number) {
  if (results.length < total) return "Wait for the remaining assessments to compare all selected sites.";
  if (total < 2) return "Add a second point to compare mission trade-offs.";
  const first = results[0];
  const comparable = results.every((r) => r.score != null &&
    r.geometry.mode === "terrain_screened" &&
    r.factors.T.score != null &&
    r.terrain.resolution_m === first.terrain.resolution_m &&
    r.missing.join(",") === first.missing.join(",") &&
    r.available_weight === first.available_weight);
  if (!comparable) return "Use the visibility windows and terrain evidence to shortlist sites. Coverage or calculation methods differ, so a single suitability ranking would be misleading.";
  const ranked = results.filter((r) => !r.constraints_failed.length).sort((a, b) => b.score! - a.score!);
  if (!ranked.length) return "Every compared site exceeds at least one measured limit. Review the constraints before selecting a site.";
  const [best, runnerUp] = ranked;
  if (runnerUp && best.score!.toFixed(1) === runnerUp.score!.toFixed(1)) {
    return "The highest scores tie at the displayed precision. Compare the operational windows and resolve missing evidence before choosing.";
  }
  return `${best.mission.name} is the leading point for further investigation among sites that cleared the measured limits. Review its visibility windows and unresolved hazards before making a mission decision.`;
}

function download(content: string, format: "json" | "csv") {
  const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `lunar-research-report.${format}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (value: string) => {
  const safe = /^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export default function ResearchComparisonReport({ mission, alternatives, comparison, scenarios, evidenceSite, onEvidenceSiteChange, equipment }: {
  mission: Mission;
  alternatives: Site[];
  comparison: ResearchComparison | null;
  scenarios: PlanBForecast[];
  evidenceSite: string;
  onEvidenceSiteChange: (site: string) => void;
  equipment?: SolarSettings;
}) {
  const [preferred, setPreferred] = useState("");
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
  if (!complete.length) return null;
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
  const advice = incomplete && !comparison?.busy
    ? "Some selected points have no assessment. Retry unfinished assessments to compare all points."
    : entries.some((entry) => entry.scenario?.reasons.length)
      ? "Use the What IF forecasts to compare mission windows. Their landing checks are unresolved or exceeded."
      : recommendation(complete, entries.length);
  const settings = [
    ["Start (UTC)", utc(mission.start)],
    ["End (UTC)", utc(mission.end)],
    ["Duration", format((Date.parse(mission.end) - Date.parse(mission.start)) / 3600000, " h")],
    ["Sampling", `${mission.interval_minutes} min`],
    ["Earth clearance", `${mission.clearance_deg}°`],
  ];
  const grid = [
    ["Coordinates (planetocentric, east-positive)", ...entries.map(({ mission }) => `${mission.latitude}°, ${mission.longitude}°`)],
    ["Touchdown (UTC)", ...entries.map(({ mission }) => utc(mission.start))],
    ["Mission end (UTC)", ...entries.map(({ mission }) => utc(mission.end))],
    ["Assessment status", ...entries.map(assessmentStatus)],
    ...measurements.map(({ label, value }) => [
      label, ...entries.map((entry) => entry.assessment ? value(entry.assessment) : assessmentStatus(entry)),
    ]),
    ["Assessment notes", ...entries.map(({ assessment, scenario, failure }) =>
      [...new Set([...(failure ? [failure] : []), ...(scenario?.reasons ?? []), ...(assessment?.warnings ?? [])])].join(" ") || "—",
    )],
  ];
  const headers = ["Evidence", ...entries.map(({ mission }) => label(mission))];
  function comparisonTable(indices: number[], title: string) {
    return (
      <table aria-label={title}>
        <thead><tr>{indices.map((i) => <th scope="col" key={i}>{headers[i]}</th>)}</tr></thead>
        <tbody>{grid.map(([row, ...cells]) => (
          <tr key={row}><th scope="row">{row}</th>{indices.slice(1).map((i) => <td key={i}>{cells[i - 1]}</td>)}</tr>
        ))}</tbody>
      </table>
    );
  }
  const columnIndices = headers.map((_, i) => i);
  const printGroups = Array.from({ length: Math.ceil((entries.length - 1) / 2) }, (_, i) =>
    [0, 1, ...columnIndices.slice(2 + i * 2, 4 + i * 2)],
  );
  return (
    <section id="research-report" className="panel research-report" aria-labelledby="research-report-title" tabIndex={-1}>
      <h2 id="research-report-title">Site comparison and mission report</h2>
      <p role="status">{complete.length} of {entries.length} mission assessments included.</p>
      <dl className="research-report-settings">{settings.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}</dl>
      <figure className="research-visibility-bars">
        <figcaption>Share of the mission window above the visibility threshold</figcaption>
        {complete.map((r) => <div key={missionKey(r.mission)}>
          <strong>{label(r.mission)}</strong>
          {(["sun_visible_pct", "earth_visible_pct"] as const).map((metric) => {
            const value = r.geometry.metrics?.[metric];
            const label = metric === "sun_visible_pct" ? "Sun" : "Earth";
            return <div key={metric} className="research-visibility-bar">
              <span>{label}</span>
              {value != null ? <meter min={0} max={100} value={value} aria-label={`${r.mission.name} ${label} visibility`} /> : <span />}
              <span>{format(value, "%")}</span>
            </div>;
          })}
        </div>)}
      </figure>
      <div className={`table-scroll${printGroups.length > 1 ? " research-screen-table" : ""}`}>
        {comparisonTable(columnIndices, "Side-by-side research comparison")}
      </div>
      {printGroups.length > 1 && (
        <div className="research-print-only">
          {printGroups.map((indices, index) => (
            <div key={index}>{comparisonTable(indices, `Research comparison ${index + 1}`)}</div>
          ))}
        </div>
      )}
      <h3>Trade-offs and recommendation</h3>
      <p>{advice}</p>
      <p>Research weights are 35% terrain, 25% sunlight, 20% Earth visibility, 15% temperature and 5% ice. Both visibility factors are required for a mission score. Missing factors redistribute their weight across the available evidence. Scores remain provisional where coverage or hazards are incomplete.</p>
      <label className="research-preferred">Preferred point for further study
        <select value={choice ? preferred : ""} onChange={(event) => setPreferred(event.target.value)}>
          <option value="">Select an assessed point</option>
          {complete.map((r) => <option key={missionKey(r.mission)} value={missionKey(r.mission)}>{label(r.mission)}</option>)}
        </select>
      </label>
      {choice && <p><strong>{label(choice.mission)}</strong> selected for further study. {choice.constraints_failed.join(" ") || "Review the unresolved terrain and mission constraints before proceeding."}</p>}
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
        <details>
          <summary>Scoring and evidence</summary>
          {evidence.formula && <p>{evidence.formula}</p>}
          <ul>{Object.entries(evidence.factors).map(([key, factor]) => (
            <li key={key}><strong>{factor.name} · {format(factor.score, key === "S" || key === "C" ? "%" : " / 100")}</strong><p>{factor.explanation}</p></li>
          ))}</ul>
        </details>
      </section>
      {complete.map((r) => (
        <article className="research-report-site" key={missionKey(r.mission)}>
          <h3>{label(r.mission)}</h3>
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
      <div className="account-actions research-export-controls">
        <button className="button primary" onClick={() => {
          const closed = Array.from(document.querySelectorAll<HTMLDetailsElement>("#research-report details:not([open])"));
          closed.forEach((details) => { details.open = true; });
          try { window.print(); }
          finally { closed.forEach((details) => { details.open = false; }); }
        }}>Print or save PDF</button>
        <button className="button subtle" onClick={() => download(JSON.stringify({
          schema_version: 1, mission, preferred_site: choice?.mission ?? null, recommendation: advice,
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
        <button className="button subtle" onClick={() => download([
          headers, ...grid, [],
          ...settings, ["Preferred point", choice ? label(choice.mission) : ""], ["Recommendation", advice],
        ].map((row) => row.map(csvCell).join(",")).join("\r\n"), "csv")}>Export comparison CSV</button>
      </div>
    </section>
  );
}
