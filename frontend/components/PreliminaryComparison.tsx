"use client";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Mission, Site } from "../app/types";
import type { Research, ResearchComparison } from "./LandingResearch";
import type { ResearchPriority } from "./SearchConsole";
import type { SolarSettings } from "./mission-lab/scenario-science";
import { comparisonRadiusKm } from "./ComparisonPicker";
import {
  comparableScores,
  sameMission,
  type PlanBForecast,
} from "../lib/plan-b";
import PlanBComparison from "./PlanBComparison";
import WaterIceFactor from "./WaterIceFactor";
const criteria = [
  ["S", "Sunlight"],
  ["C", "Earth visibility"],
  ["T", "Terrain"],
  ["H", "Temperature"],
  ["I", "Water ice potential"],
] as const;
const key = (s: Site) => `${s.latitude},${s.longitude}`;
const utc = (time: string) =>
  Number.isFinite(Date.parse(time))
    ? new Date(time).toISOString().slice(0, 19).replace("T", " ") + " UTC"
    : "Unspecified";
const score = (r: Research | undefined, k: string) =>
  !r
    ? "—"
    : r.factors[k]?.score == null
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
  const planned = [
    mission,
    ...alternatives.map((site) => ({ ...mission, ...site })),
  ];
  const isCompared = (option: PlanBForecast) =>
    planned.some((site) => sameMission(site, option.result.mission)) ||
    scenarios.some((scenario) =>
      sameMission(scenario.result.mission, option.result.mission),
    );
  const cards = [
    ...planned.map((site) => ({ site, scenario: undefined })),
    ...scenarios
      .filter(
        (scenario) =>
          !planned.some((site) => sameMission(site, scenario.result.mission)),
      )
      .map((scenario) => ({ site: scenario.result.mission, scenario })),
  ];
  const selected = state?.results.find((r) => sameMission(r.mission, mission));
  const hasUnfinished = planned.some(
    (site) =>
      !state?.results.some((result) =>
        sameMission(result.mission, { ...mission, ...site }),
      ),
  );
  function renderCard(
    { site, scenario }: (typeof cards)[number],
    index: number,
  ) {
    const result =
      scenario?.result ??
      state?.results.find((value) => sameMission(value.mission, site));
    const failure = scenario ? undefined : state?.failures[key(site)];
    const isSelected = index === 0;
    const comparable =
      selected &&
      result &&
      (scenario
        ? comparableScores(selected, result)
        : selected.available_weight === result.available_weight &&
          selected.missing.join() === result.missing.join() &&
          selected.geometry.mode === result.geometry.mode);
    const delta =
      comparable && result?.score != null && selected?.score != null
        ? result.score - selected.score
        : null;
    const status = result
      ? result.provisional
        ? "Provisional"
        : "Research assessment"
      : failure
        ? "Assessment unavailable"
        : state?.busy
          ? "Awaiting assessment"
          : "Not assessed yet";
    const limits = result?.limits;
    const terrain = result?.terrain;
    const temperature = result?.temperature;
    const observer = result?.observer_height;
    const issues = [
      ...new Set([
        ...(failure ? [failure] : []),
        ...(scenario?.reasons ?? []),
        ...(result?.constraints_failed ?? []),
        ...(result?.warnings ?? []),
      ]),
    ];

    return (
      <article
        key={JSON.stringify([
          site.latitude,
          site.longitude,
          Date.parse(site.start),
          Date.parse(site.end),
          site.interval_minutes,
          site.clearance_deg,
        ])}
        className="pre-result-card glass"
        aria-label={`Pre-result ${index + 1}: ${site.name}`}
      >
        <header className="pre-result-heading">
          <h2>Pre-Result {index + 1}</h2>
          <p>{site.name}</p>
          {scenario && (
            <span className="eyebrow">
              {scenario.reasons.length
                ? "WHAT IF FORECAST"
                : "WHAT IF SCENARIO"}
            </span>
          )}
        </header>
        <div className="pre-score">
          <div>
            <strong>
              {result?.score == null ? "—" : result.score.toFixed(1)}
            </strong>
            <span> / 100</span>
            <p>Overall research score</p>
          </div>
          <span
            className={`pre-score-status${result?.provisional ? " provisional" : ""}`}
          >
            {status}
          </span>
        </div>
        <section className="pre-criteria" aria-label="Criteria at a glance">
          <h3>Criteria at a glance</h3>
          <dl>
            {criteria.map(([factor, label]) => {
              const reading = result?.factors[factor]?.score;
              return (
                <div key={factor}>
                  <dt>{label}</dt>
                  <dd>{score(result, factor)}</dd>
                  {reading != null && (
                    <meter
                      min={0}
                      max={100}
                      value={reading}
                      aria-label={label}
                    />
                  )}
                </div>
              );
            })}
          </dl>
          <p>
            Percentages show availability. Values out of 100 are factor scores.
          </p>
        </section>
        <details className="pre-extra pre-environment">
          <summary>Environment &amp; limits</summary>
          <dl>
            <div>
              <dt>Mission window</dt>
              <dd>
                {Math.abs(site.latitude).toFixed(4)}°{" "}
                {site.latitude < 0 ? "S" : "N"},{" "}
                {Math.abs(site.longitude).toFixed(4)}°{" "}
                {site.longitude < 0 ? "W" : "E"}
              </dd>
              <dd>Touchdown {utc(site.start)}</dd>
              <dd>Mission end {utc(site.end)}</dd>
            </div>
            {result && (
              <div>
                <dt>Scoring evidence</dt>
                <dd>
                  {result.provisional
                    ? "Provisional · incomplete evidence"
                    : status}
                </dd>
                <dd>
                  {(result.available_weight * 100).toFixed(0)}% nominal evidence
                  · Missing: {result.missing.join(", ") || "none"}
                </dd>
              </div>
            )}
            {scenario && (
              <div>
                <dt>Sunlight and Earth communication</dt>
                {result?.geometry.sunlight_hours != null && (
                  <dd>
                    {result.geometry.sunlight_hours.toFixed(1)} h of sunlight
                  </dd>
                )}
                {scenario.energy != null && (
                  <dd>
                    {scenario.energy.toFixed(2)} kWh estimated solar energy
                  </dd>
                )}
                {result?.geometry.metrics?.longest_blackout_hours != null && (
                  <dd>
                    {result.geometry.metrics.longest_blackout_hours.toFixed(1)}{" "}
                    h longest Earth outage
                  </dd>
                )}
              </div>
            )}
            {result && (
              <>
                <div>
                  <dt>Terrain evidence</dt>
                  {terrain?.slope_p95_deg != null && (
                    <dd>{terrain.slope_p95_deg.toFixed(1)}° p95 slope</dd>
                  )}
                  {terrain?.coverage_type === "regional" && (
                    <dd>{terrain.resolution_m} m regional screening</dd>
                  )}
                  {observer?.available &&
                    observer.coverage_type === "global" &&
                    observer.value != null && (
                      <dd>
                        Approximate elevation:{" "}
                        {observer.value.toLocaleString("en-GB")} m above the
                        lunar reference sphere · NASA LOLA global map
                      </dd>
                    )}
                  {result.factors.T?.score == null && (
                    <dd>
                      {observer?.coverage_type === "global"
                        ? "Local slope, roughness and relief require finer elevation coverage."
                        : result.factors.T?.explanation ||
                          "Terrain evidence unavailable."}
                    </dd>
                  )}
                  {result.factors.T?.score == null &&
                    result.horizon.available && (
                      <dd>
                        The available terrain supports skyline estimates. Check
                        the neighbourhood size and DEM resolution limit for
                        slope scoring.
                      </dd>
                    )}
                </div>
                {temperature?.available && (
                  <div>
                    <dt>Temperature evidence</dt>
                    <dd>
                      Observed seasonal range{" "}
                      {temperature.minimum_k?.toFixed(1)}–
                      {temperature.maximum_k?.toFixed(1)} K
                    </dd>
                  </div>
                )}
                <WaterIceFactor result={result} />
              </>
            )}
            <div>
              <dt>Landing checks</dt>
              <dd>
                {scenario?.reasons.length
                  ? "Landing checks unresolved or exceeded."
                  : failure
                    ? "Assessment unavailable."
                    : !result
                      ? "Evaluate this site to check the mission limits."
                      : result.constraints_failed.length
                        ? "Configured limits exceeded."
                        : "No limit failures in the available evidence."}
              </dd>
              {limits?.max_slope_deg != null && (
                <dd>Maximum slope {limits.max_slope_deg}°</dd>
              )}
              {limits?.max_roughness_m != null && (
                <dd>Maximum roughness {limits.max_roughness_m} m</dd>
              )}
              {limits?.max_relief_m != null && (
                <dd>Maximum relief {limits.max_relief_m} m</dd>
              )}
              {result?.factors.I?.explanation && (
                <dd>{result.factors.I.explanation}</dd>
              )}
            </div>
          </dl>
          {issues.length > 0 && (
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </details>
        {!isSelected && result && selected && (
          <p className="pre-comparison-note">
            {result.constraints_failed.length
              ? "Exceeds configured limits; not an eligible backup recommendation."
              : !comparable
                ? "Evidence coverage differs; scores cannot establish a better landing site."
                : delta == null
                  ? "Insufficient score data for comparison."
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} research points versus your selection. This does not establish safety or diversion reachability.`}
          </p>
        )}
        <div className="pre-result-detail-action">
          <button
            className="button primary"
            disabled={!result}
            onClick={() => result && onInspect(result)}
          >
            More details <ChevronRight size={16} aria-hidden="true" />
          </button>
          {result && (
            <small>
              Evidence, terrain measurements, temperature range &amp; warnings
            </small>
          )}
          {result && <p>Landing safety requires verification.</p>}
        </div>
        <div className="pre-result-actions">
          <button className="button subtle" onClick={onSearch}>
            Back to Search
          </button>
          {!isSelected && (
            <button
              type="button"
              className="button subtle"
              disabled={!scenario && state?.busy}
              onClick={() =>
                scenario
                  ? onScenariosChange(
                      scenarios.filter((entry) => entry !== scenario),
                    )
                  : onRemoveSite(site)
              }
            >
              Remove from Compare
            </button>
          )}
        </div>
      </article>
    );
  }

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
            Compare up to two sites within {comparisonRadiusKm} km using the
            original mission window, or use What IF to test a different site or
            touchdown.
          </p>
          <small>
            {mission.start.replace("T", " ")} → {mission.end.replace("T", " ")}{" "}
            · {mission.interval_minutes}-minute samples
          </small>
        </div>
        <div className="preliminary-controls">
          {!!state?.results.length && (
            <a
              className="button subtle"
              href="#research-report"
              onClick={(event) => {
                event.preventDefault();
                const report = document.getElementById("research-report");
                report?.focus({ preventScroll: true });
                report?.scrollIntoView({ block: "start" });
              }}
            >
              Mission report and exports
            </a>
          )}
          <button className="button subtle" onClick={onSearch}>
            Back to Search
          </button>
          {hasUnfinished && !state?.busy && (
            <button className="button primary" onClick={onEvaluate}>
              {state?.error || Object.keys(state?.failures ?? {}).length
                ? "Retry unfinished assessments"
                : alternatives.length
                  ? "Assess saved points"
                  : "Evaluate selected site"}
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
      {notice && (
        <p className="info" role="status">
          {notice}
        </p>
      )}
      <div className="pre-result-grid">
        {renderCard(cards[0], 0)}
        <PlanBComparison
          key={JSON.stringify([mission, priority, equipment])}
          original={selected}
          priority={priority}
          equipment={equipment}
          alternativePicker={alternativePicker}
          isCompared={isCompared}
          removeCompared={(option) => {
            const match = scenarios.find((entry) =>
              sameMission(entry.result.mission, option.result.mission),
            );
            return match
              ? () =>
                  onScenariosChange(
                    scenarios.filter((entry) => entry !== match),
                  )
              : undefined;
          }}
          onCompare={(option) => {
            if (!isCompared(option)) onScenariosChange([...scenarios, option]);
          }}
        />
        {cards.slice(1).map((card, index) => renderCard(card, index + 1))}
      </div>
      <p className="preliminary-disclosure">
        Provisional research scores. See More details for evidence and coverage.
      </p>
    </section>
  );
}
