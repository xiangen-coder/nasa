"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Mission, Site } from "../app/types";
import type { Research, ResearchComparison } from "./LandingResearch";
import type { ResearchPriority } from "./SearchConsole";
import type { SolarSettings } from "./mission-lab/scenario-science";
import { comparisonDistanceKm, comparisonRadiusKm } from "./ComparisonPicker";
import {
  comparableScores,
  comparableTerrain,
  comparableVisibility,
  missionKey,
  sameMission,
  solarEstimate,
  type PlanBForecast,
} from "../lib/plan-b";
import PlanBComparison from "./PlanBComparison";
import type { ResearchArea, ResearchAreaResult } from "../lib/research-area";
const criteria = [
  ["S", "Sunlight"],
  ["C", "Earth visibility"],
  ["T", "Terrain"],
  ["H", "Temperature"],
] as const;
const key = (s: Site) => `${s.latitude},${s.longitude}`;
const withUnit = (value: number | undefined, unit: string) =>
  value == null ? "Unavailable" : `${value.toFixed(1)} ${unit}`;
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
  area,
  areaResult,
  radiusKm = comparisonRadiusKm,
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
  area?: ResearchArea;
  areaResult?: ResearchAreaResult;
  radiusKm?: number;
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
  const [comparing, setComparing] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const focusWorkspace = useRef(false);
  useEffect(() => {
    if (!focusWorkspace.current) return;
    focusWorkspace.current = false;
    workspace.current?.focus({ preventScroll: true });
    workspace.current?.scrollIntoView({ block: "start" });
  }, [comparing]);
  function openWorkspace(compare: boolean) {
    focusWorkspace.current = true;
    setComparing(compare);
  }
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
  const hasResults = !area || !!areaResult?.results.length;
  const searchingArea = !!area && !areaResult && !!state?.busy;
  const hasRecommendation = hasResults && areaResult?.recommended !== false;
  const assessments = cards.map(
    ({ site, scenario }) =>
      scenario?.result ??
      state?.results.find((value) => sameMission(value.mission, site)),
  );
  function comparableFactor(candidate: Research, factor: string) {
    if (!selected) return false;
    if (factor === "S" || factor === "C")
      return comparableVisibility(selected, candidate);
    if (factor === "T") return comparableTerrain(selected, candidate);
    const originalFactor = selected.factors[factor];
    const candidateFactor = candidate.factors[factor];
    return (
      originalFactor &&
      candidateFactor &&
      originalFactor.quality === candidateFactor.quality &&
      originalFactor.source?.resolution_m ===
        candidateFactor.source?.resolution_m
    );
  }
  const shownCriteria =
    comparing && differencesOnly && cards.length > 1
      ? criteria.filter(([factor]) => {
          const baseline = selected?.factors[factor]?.score;
          return (
            baseline == null ||
            !assessments
              .slice(1)
              .every(
                (candidate) =>
                  candidate &&
                  comparableFactor(candidate, factor) &&
                  candidate.factors[factor]?.score?.toFixed(1) ===
                    baseline.toFixed(1),
              )
          );
        })
      : criteria;
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
    const result = assessments[index];
    const failure = scenario ? undefined : state?.failures[key(site)];
    const isSelected = index === 0;
    const title = area && hasRecommendation ? (isSelected ? "Recommended landing point" : `Alternative ${index}`) : `Pre-Result ${index + 1}`;
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
        aria-label={`${title}: ${site.name}`}
      >
        <header className="pre-result-heading">
          <h2>{title}</h2>
          {area && isSelected && !searchingArea && <p>{hasRecommendation
            ? "Best of the points evaluated within your research area."
            : "Preliminary comparison · landing checks unresolved or exceeded."}</p>}
          {searchingArea ? (
            <p role="status"><span className="pre-result-spinner" aria-hidden="true" />Searching the research area…</p>
          ) : <p>{site.name}</p>}
          {area && !searchingArea && <p>
            {site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}° ·{" "}
            {comparisonDistanceKm(area.centre, site).toFixed(2)} km from research centre
          </p>}
          {comparing && (
            <dl className="what-if-card-window">
              <div>
                <dt>Touchdown</dt>
                <dd>{utc(site.start)}</dd>
              </div>
              <div>
                <dt>Mission end</dt>
                <dd>{utc(site.end)}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>
                  {area ? `${comparisonDistanceKm(area.centre, site).toFixed(2)} km from research centre` : isSelected
                    ? "Original site"
                    : `${comparisonDistanceKm(mission, site).toFixed(2)} km from original`}
                </dd>
              </div>
            </dl>
          )}
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
            {!searchingArea && <span> / 100</span>}
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
            {shownCriteria.map(([factor, label]) => {
              const reading = result?.factors[factor]?.score;
              const baseline = selected?.factors[factor]?.score;
              const change =
                comparing &&
                !isSelected &&
                reading != null &&
                baseline != null &&
                result &&
                comparableFactor(result, factor)
                  ? Number((reading - baseline).toFixed(1))
                  : null;
              return (
                <div key={factor}>
                  <dt>{label}</dt>
                  <dd>
                    {searchingArea ? "—" : score(result, factor)}
                    {change != null && (
                      <small>
                        {" "}
                        ·{" "}
                        {change === 0
                          ? "Unchanged"
                          : `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}${factor === "S" || factor === "C" ? " pp" : ""}`}
                      </small>
                    )}
                  </dd>
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
          {shownCriteria.length === 0 && (
            <p>All displayed criteria match the original.</p>
          )}
          <p>
            Percentages show availability. Values out of 100 are factor scores.
          </p>
        </section>
        <details className="pre-extra pre-environment">
          <summary>Environment &amp; limits</summary>
          <dl>
            <div>
              <dt>Mission window</dt>
              <dd hidden={searchingArea}>
                {Math.abs(site.latitude).toFixed(4)}°{" "}
                {site.latitude < 0 ? "S" : "N"},{" "}
                {Math.abs(site.longitude).toFixed(4)}°{" "}
                {site.longitude < 0 ? "W" : "E"}
              </dd>
              <dd>Touchdown {searchingArea ? "—" : utc(site.start)}</dd>
              <dd>Mission end {searchingArea ? "—" : utc(site.end)}</dd>
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
            Compare up to two sites within {radiusKm} km of the research centre using the
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
          {hasUnfinished && !state?.busy && (!area || hasRecommendation || state?.error) && (
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
      {area && (
        <div className="research-centre-summary glass">
          <strong>Research area centre</strong>
          <span>[{area.centre.name}]</span>
          <span>({area.centre.latitude.toFixed(4)}°, {area.centre.longitude.toFixed(4)}°)</span>
          <span>{area.radiusKm} km search radius</span>
        </div>
      )}
      {areaResult && (
        <p className="info" role="status">
          {areaResult.sampled - areaResult.counts.unavailable} evaluated · {areaResult.sampled} sampled ·{" "}
          {areaResult.counts.limits} exceeded limits · {areaResult.counts.missing} lacked required evidence ·{" "}
          {areaResult.counts.unavailable} could not be evaluated
          {areaResult.counts.focus_missing > 0 && ` · ${areaResult.counts.focus_missing} lacked a mapped shadow target`}
        </p>
      )}
      {areaResult && !hasRecommendation && <p>No qualifying landing point found in this research area.</p>}
      {areaResult?.reasons?.length ? (
        <details className="panel">
          <summary>Why candidates were excluded</summary>
          <ul>{areaResult.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </details>
      ) : null}
      {state?.busy && (
        <p role="status" className="info">
          {state.progress || "Preparing the comparison…"}{" "}
          Cards update as assessments finish.
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
      <div hidden={!hasResults && !searchingArea} className="what-if-workspace" ref={workspace} tabIndex={-1}>
        {comparing ? (
          <div className="what-if-compare-heading">
            <div>
              <button
                className="button subtle"
                onClick={() => openWorkspace(false)}
              >
                Back to options
              </button>
              <h2>Compare selected plans</h2>
              <p>
                Original plan and {cards.length - 1} alternatives · all times
                UTC
              </p>
            </div>
            <div className="account-actions">
              <label>
                <input
                  type="checkbox"
                  checked={differencesOnly}
                  onChange={(event) => setDifferencesOnly(event.target.checked)}
                />{" "}
                Show differences only
              </label>
              <button
                className="button subtle"
                onClick={() => openWorkspace(false)}
              >
                Add option
              </button>
            </div>
          </div>
        ) : (
          cards.length > 1 && (
            <button
              className="button subtle what-if-compare-link"
              onClick={() => openWorkspace(true)}
            >
              Compare added plans ({cards.length})
            </button>
          )
        )}
        <div
          className={`pre-result-grid${comparing ? "" : " what-if-browsing"}`}
          role="region"
          aria-label="Comparison cards"
          tabIndex={0}
        >
          {renderCard(cards[0], 0)}
          {cards.slice(1).map((card, index) => renderCard(card, index + 1))}
          <PlanBComparison
            key={JSON.stringify([area?.centre ?? mission, priority, equipment])}
            original={selected}
            pendingMission={searchingArea ? mission : undefined}
            area={area}
            priority={priority}
            equipment={equipment}
            alternativePicker={alternativePicker}
            isCompared={isCompared}
            hidden={comparing}
            comparedCount={cards.length}
            onCompare={(options) => {
              onScenariosChange([
                ...scenarios,
                ...options.filter((option) => !isCompared(option)),
              ]);
              openWorkspace(true);
            }}
          />
        </div>
        {comparing && (
          <>
            <details className="panel what-if-comparison-details">
              <summary>
                Mission metrics: sunlight hours, outages &amp; energy
              </summary>
              <div className="table-scroll">
                <table
                  className="what-if-options"
                  aria-label="Mission metrics for selected plans"
                >
                  <thead>
                    <tr>
                      <th scope="col">Plan</th>
                      <th scope="col">Sunlight</th>
                      <th scope="col">Longest Earth outage</th>
                      <th scope="col">Estimated solar energy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map(({ site, scenario }, index) => {
                      const result = assessments[index];
                      let energy = scenario?.energy;
                      if (energy == null && result) {
                        try {
                          energy = solarEstimate(result, equipment)?.total_kwh;
                        } catch {
                          // A missing estimate should not hide the other mission metrics.
                        }
                      }
                      return (
                        <tr key={missionKey(site)}>
                          <th scope="row">
                            {site.name}
                            <small>{utc(site.start)}</small>
                          </th>
                          <td>
                            {withUnit(result?.geometry.sunlight_hours, "h")}
                          </td>
                          <td>
                            {withUnit(
                              result?.geometry.metrics?.longest_blackout_hours,
                              "h",
                            )}
                          </td>
                          <td>{withUnit(energy, "kWh")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
            <details className="panel what-if-comparison-details">
              <summary>Terrain measurements, evidence &amp; warnings</summary>
              {cards.map(({ site, scenario }, index) => {
                const result = assessments[index];
                const warnings = [
                  ...new Set([
                    ...(scenario?.reasons ?? []),
                    ...(result?.constraints_failed ?? []),
                    ...(result?.warnings ?? []),
                  ]),
                ];
                return (
                  <section key={missionKey(site)}>
                    <h3>
                      {site.name} · {utc(site.start)}
                    </h3>
                    <p>
                      Maximum slope{" "}
                      {withUnit(result?.terrain.slope_max_deg, "°")} · Roughness{" "}
                      {withUnit(result?.terrain.roughness_m, "m")} · Relief{" "}
                      {withUnit(result?.terrain.relief_m, "m")}
                    </p>
                    <p>
                      {result
                        ? `${(result.available_weight * 100).toFixed(0)}% nominal evidence · Missing: ${result.missing.join(", ") || "none"}`
                        : "Assessment unavailable."}
                    </p>
                    {!!warnings.length && (
                      <ul>
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </details>
          </>
        )}
      </div>
      {hasResults && (
        <p className="preliminary-disclosure">
          Provisional research scores. See More details for evidence and coverage.
        </p>
      )}
    </section>
  );
}
