import type { Analysis } from "../../app/types";
import type { Energy, SolarSettings } from "./scenario-science";
import type { LearningNotes } from "./learning-notes";
import type { ScenarioSnapshot, Weights } from "./useMissionSession";
export function scenarioReport(
  entry: { analysis: Analysis; solar: SolarSettings; energy: Energy },
  scenarios: ScenarioSnapshot,
  notes: LearningNotes,
  weights: Weights,
) {
  return {
    ...entry.analysis,
    equipment_model: {
      version: 1,
      method:
        "Idealised normal-irradiance cosine-incidence model; left-endpoint integration over actual timestamps. Battery capped at usable capacity; charge/discharge losses applied; unmet demand recorded. No temperature, dust, degradation or charge-rate model. Missing terrain means local shadows unmodelled.",
      settings: entry.solar,
      result: entry.energy,
    },
    comparison_plan: scenarios,
    weights,
    learning_notes: notes,
  };
}
export function scenarioCsv(entry: {
  analysis: Analysis;
  solar: SolarSettings;
  energy: Energy;
}) {
  const rows = entry.analysis.series.map((r, i) => ({
    ...r,
    site: entry.analysis.mission.name,
    latitude: entry.analysis.mission.latitude,
    longitude: entry.analysis.mission.longitude,
    mode: entry.analysis.mode,
    ephemeris: entry.analysis.provenance.ephemeris,
    frame: entry.analysis.provenance.orientation,
    clearance_deg: entry.analysis.mission.clearance_deg,
    interval_minutes: entry.analysis.mission.interval_minutes,
    ...entry.energy.samples[i],
    ...Object.fromEntries(
      Object.entries(entry.solar).map(([k, v]) => [`assumed_${k}`, v]),
    ),
    energy_model:
      "Idealised cosine incidence; left-endpoint time integration; thermal/dust unmodelled; absent terrain means local shadows unmodelled",
  }));
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]),
    quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [
    keys.map(quote).join(","),
    ...rows.map((r) =>
      keys.map((k) => quote((r as Record<string, unknown>)[k])).join(","),
    ),
  ].join("\r\n");
}
export function downloadScenario(
  entry: { analysis: Analysis; solar: SolarSettings; energy: Energy },
  scenarios: ScenarioSnapshot,
  notes: LearningNotes,
  weights: Weights,
  format: "csv" | "json",
) {
  const data =
    format === "json"
      ? JSON.stringify(
          scenarioReport(entry, scenarios, notes, weights),
          null,
          2,
        )
      : scenarioCsv(entry);
  const blob = new Blob([data], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `lunar-analysis.${format}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
