"use client";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Mission, Site } from "../app/types";
import type { Research, ResearchComparison } from "./LandingResearch";
import type { ResearchPriority } from "./SearchConsole";
import type { SolarSettings } from "./mission-lab/scenario-science";
import { comparisonRadiusKm } from "./ComparisonPicker";
import { comparableScores, sameMission, type PlanBForecast } from "../lib/plan-b";
import PlanBComparison from "./PlanBComparison";
const key = (s: Site) => `${s.latitude},${s.longitude}`;
const utc = (time: string) => Number.isFinite(Date.parse(time))
  ? new Date(time).toISOString().slice(0, 19).replace("T", " ") + " UTC"
  : "Unspecified";
const score = (r: Research | undefined, k: string) =>
  !r ? "—" : r.factors[k]?.score == null
    ? "Unavailable"
    : `${r.factors[k].score!.toFixed(1)}${k === "S" || k === "C" ? "%" : " / 100"}`;
export default function PreliminaryComparison({
  mission,
  state,
  alternatives,
  scenarios,
  onScenariosChange,
  onRemoveSite,
  priority,
  equipment,
  notice,
  alternativePicker,
  onEvaluate,
  onInspect,
  onSearch,
  onCancel,
}: {
  mission: Mission;
  state: ResearchComparison | null;
  alternatives: Site[];
  scenarios: PlanBForecast[];
  onScenariosChange: (scenarios: PlanBForecast[]) => void;
  onRemoveSite: (site: Site) => void;
  priority: ResearchPriority;
  equipment: SolarSettings;
  notice: string;
  alternativePicker: ReactNode;
  onEvaluate: () => void;
  onInspect: (r: Research) => void;
  onSearch: () => void;
  onCancel: () => void;
}) {
  const planned = [mission, ...alternatives.map((site) => ({ ...mission, ...site }))];
  const isCompared = (option: PlanBForecast) =>
    planned.some((site) => sameMission(site, option.result.mission)) ||
    scenarios.some((scenario) => sameMission(scenario.result.mission, option.result.mission));
  const cards = [
    ...planned.map((site) => ({ site, scenario: undefined })),
    ...scenarios.filter((scenario) => !planned.some((site) => sameMission(site, scenario.result.mission)))
      .map((scenario) => ({ site: scenario.result.mission, scenario })),
  ];
  const selected = state?.results.find((r) => sameMission(r.mission, mission));
  const hasUnfinished = planned.some((site) =>
    !state?.results.some((result) => sameMission(result.mission, { ...mission, ...site })),
  );
  return (
    <section
      className="preliminary-comparison"
      aria-label="Preliminary site comparison"
      id="comparison-cards"
      tabIndex={-1}
    >
      <div className="preliminary-intro">
        <div>
          <span className="eyebrow">PRELIMINARY ASSESSMENT</span>
          <p>
            Compare up to two sites within {comparisonRadiusKm} km using the original mission window, or use What IF to test a different site or touchdown.
          </p>
          <small>
            {mission.start.replace("T", " ")} → {mission.end.replace("T", " ")}{" "}
            · {mission.interval_minutes}-minute samples
          </small>
        </div>
        <div className="preliminary-controls">
          {!!state?.results.length && <a className="button subtle" href="#research-report" onClick={(event) => {
            event.preventDefault();
            const report = document.getElementById("research-report");
            report?.focus({ preventScroll: true });
            report?.scrollIntoView({ block: "start" });
          }}>Mission report and exports</a>}
          <button className="button subtle" onClick={onSearch}>
            Back to Search
          </button>
          {hasUnfinished && !state?.busy && (
            <button className="button primary" onClick={onEvaluate}>
              {state?.error || Object.keys(state?.failures ?? {}).length
                ? "Retry unfinished assessments"
                : alternatives.length ? "Assess saved points" : "Evaluate selected site"}
            </button>
          )}
          {state?.busy && (
            <button className="button subtle" onClick={onCancel}>
              Stop comparison
            </button>
          )}
        </div>
      </div>
      {state?.busy && (
        <p role="status" className="info">
          {state.progress || "Preparing the comparison…"} Cards update as each
          real assessment finishes.
        </p>
      )}
      {state?.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {notice && <p className="info" role="status">{notice}</p>}
      <div className="pre-result-grid">
        {cards.map(({ site, scenario }, i) => {
          const r = scenario?.result ?? state?.results.find((value) => sameMission(value.mission, site)),
            failure = scenario ? undefined : state?.failures[key(site)],
            isSelected = i === 0;
          const comparable = selected && r && (scenario
            ? comparableScores(selected, r)
            : selected.available_weight === r.available_weight &&
              selected.missing.join() === r.missing.join() &&
              selected.geometry.mode === r.geometry.mode);
          const delta =
            comparable && r?.score != null && selected?.score != null
              ? r.score - selected.score
              : null;
          return (
            <article
              key={JSON.stringify([site.latitude, site.longitude, Date.parse(site.start), Date.parse(site.end), site.interval_minutes, site.clearance_deg])}
              className="pre-result-card glass"
              aria-label={`Pre-result ${i + 1}: ${site.name}`}
            >
              <h2>Pre-Result {i + 1}</h2>
              <div className="pre-point">
                <span className="eyebrow">
                  {scenario ? scenario.reasons.length ? "WHAT IF FORECAST" : "WHAT IF SCENARIO" : isSelected
                    ? "SELECTED LANDING LOCATION"
                    : "COMPARISON LOCATION"}
                </span>
                <strong>{site.name}</strong>
                <span>
                  {Math.abs(site.latitude).toFixed(4)}° {site.latitude < 0 ? "S" : "N"},{" "}
                  {Math.abs(site.longitude).toFixed(4)}° {site.longitude < 0 ? "W" : "E"}
                </span>
                <span>Touchdown {utc(site.start)}</span>
                <span>Mission end {utc(site.end)}</span>
              </div>
              <div className="pre-score">
                <strong>{r?.score == null ? "—" : r.score.toFixed(1)}</strong>
                <span>/ 100</span>
              </div>
              <dl>
                <div>
                  <dt>RESEARCH SCORE STATUS</dt>
                  <dd>
                    {r
                      ? r.provisional
                        ? "Provisional · incomplete evidence"
                        : "Research assessment"
                      : failure
                        ? "Assessment unavailable"
                        : state?.busy
                          ? "Awaiting assessment"
                          : "Not assessed yet"}
                  </dd>
                  {r && (
                    <dd>
                      {(r.available_weight * 100).toFixed(0)}% nominal evidence
                      · Missing: {r.missing.join(", ") || "none"}
                    </dd>
                  )}
                </div>
                <div>
                  <dt>SUNLIGHT AVAILABILITY</dt>
                  <dd>{score(r, "S")}</dd>
                  {scenario && r?.geometry.sunlight_hours != null && <dd>{r.geometry.sunlight_hours.toFixed(1)} h of sunlight</dd>}
                  {scenario?.energy != null && <dd>{scenario.energy.toFixed(2)} kWh estimated solar energy</dd>}
                </div>
                <div>
                  <dt>EARTH COMMUNICATION</dt>
                  <dd>
                    {score(r, "C")}{" "}
                    {r?.factors.C.score != null ? "geometric visibility" : ""}
                  </dd>
                  {scenario && r?.geometry.metrics?.longest_blackout_hours != null && <dd>{r.geometry.metrics.longest_blackout_hours.toFixed(1)} h longest Earth outage</dd>}
                </div>
                  <div>
                    <dt>TERRAIN SAFETY</dt>
                    <dd>
                      {r ? score(r, "T") : failure ? "Assessment unavailable" : "Awaiting assessment"}
                      {r?.terrain.slope_p95_deg != null
                        ? ` · ${r.terrain.slope_p95_deg.toFixed(1)}° p95 slope`
                        : ""}
                      {r?.terrain.coverage_type === "regional" ? ` · ${r.terrain.resolution_m} m regional screening` : ""}
                    </dd>
                    {r?.observer_height?.available && r.observer_height.coverage_type === "global" && (
                      <dd>Approximate elevation: {r.observer_height.value?.toLocaleString("en-GB")} m above the lunar reference sphere · NASA LOLA global map</dd>
                    )}
                    {r && r.factors.T.score == null && (
                      <dd>{r.observer_height?.coverage_type === "global"
                        ? "Local slope, roughness and relief require finer elevation coverage."
                        : r.factors.T.explanation}</dd>
                    )}
                    {r?.factors.T.score == null && r?.horizon.available && (
                      <dd>The available terrain supports skyline estimates. Check the neighbourhood size and DEM resolution limit for slope scoring.</dd>
                    )}
                  </div>
                  <div>
                    <dt>TEMPERATURE SUITABILITY</dt>
                    <dd>{score(r, "H")}</dd>
                    {r?.temperature.available && <dd>
                      Observed seasonal range {r.temperature.minimum_k?.toFixed(1)}–{r.temperature.maximum_k?.toFixed(1)} K
                    </dd>}
                  </div>
                  <div>
                    <dt>WATER ICE POTENTIAL</dt>
                    <dd>{r?.ice?.radius_m && r.factors.I.score != null ? `${r.factors.I.score.toFixed(1)}% mapped permanent shadow` : score(r, "I")}</dd>
                  </div>
                  <div>
                    <dt>ENVIRONMENT & LIMITS</dt>
                    <dd>{scenario?.reasons.length ? "Landing checks unresolved or exceeded. " + scenario.reasons.join(" ") : failure || (!r
                      ? "Evaluate this site to check the mission limits."
                      : r.constraints_failed.join(" ") || "No limit failures in the available evidence. Landing safety still requires verification.")}</dd>
                    {r?.limits?.max_slope_deg != null && <dd>Maximum slope {r.limits.max_slope_deg}°</dd>}
                    {r?.limits?.max_roughness_m != null && r.limits.max_relief_m != null && <dd>
                      Maximum roughness {r.limits.max_roughness_m} m · maximum relief {r.limits.max_relief_m} m
                    </dd>}
                  </div>
              </dl>
              {r && <details className="pre-extra">
                <summary>Evidence and warnings</summary>
                <p>{r.factors.I.explanation}</p>
                <p>{r.warnings.join(" ") || "Review sources and limitations in More Info."}</p>
              </details>}
              {!isSelected && r && selected && (
                <p className="pre-comparison-note">
                  {r.constraints_failed.length
                    ? "Exceeds configured limits; not an eligible backup recommendation."
                    : !comparable
                      ? "Evidence coverage differs; scores cannot establish a better landing site."
                      : delta == null
                        ? "Insufficient score data for comparison."
                        : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} research points versus your selection. This does not establish safety or diversion reachability.`}
                </p>
              )}
              <div className="pre-result-actions">
                <button
                  className="button subtle"
                  disabled={!r}
                  onClick={() => r && onInspect(r)}
                >
                  More Info <ArrowUpRight size={13} />
                </button>
                <button className="button subtle" onClick={onSearch}>
                  Back to Search
                </button>
                {!isSelected && <button type="button" className="button subtle" disabled={!scenario && state?.busy}
                  onClick={() => scenario ? onScenariosChange(scenarios.filter((entry) => entry !== scenario)) : onRemoveSite(site)}>
                  Remove from Compare
                </button>}
              </div>
            </article>
          );
        })}
        <PlanBComparison
          key={JSON.stringify([mission, priority, equipment])}
          original={selected} priority={priority} equipment={equipment}
          alternativePicker={alternativePicker}
          isCompared={isCompared}
          removeCompared={(option) => {
            const match = scenarios.find((entry) => sameMission(entry.result.mission, option.result.mission));
            return match ? () => onScenariosChange(scenarios.filter((entry) => entry !== match)) : undefined;
          }}
          onCompare={(option) => { if (!isCompared(option)) onScenariosChange([...scenarios, option]); }}
        />
      </div>
      <p className="preliminary-disclosure">
        Provisional research scores. See More Info for evidence and coverage.
      </p>
    </section>
  );
}
