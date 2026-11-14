"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { comparisonDistanceKm, comparisonRadiusKm, inComparisonArea, siteKey } from "./ComparisonPicker";
import type { Research } from "./LandingResearch";
import type { Mission } from "../app/types";
import type { ResearchArea, ResearchAreaResult } from "../lib/research-area";
import type { ResearchPriority } from "./SearchConsole";
import type { SolarSettings } from "./mission-lab/scenario-science";
import {
  comparableScores,
  comparableTerrain,
  comparableVisibility,
  findPlanB,
  initialProgress,
  latestTouchdown,
  missionKey,
  sameMission,
  rankOptions,
  searchDates,
  solarEstimate,
  type PlanBMode,
  type PlanBForecast,
  type PlanBWindow,
} from "../lib/plan-b";

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const utc = (time: string) =>
  new Date(time).toISOString().slice(0, 19).replace("T", " ") + " UTC";
const searchModes = [
  { value: "delay", label: "Change date" },
  { value: "relocate", label: "Change location" },
  { value: "both", label: "Change both" },
] as const satisfies readonly { value: PlanBMode; label: string }[];

function metric(value: number | undefined, unit: string, baseline?: number) {
  if (value == null) return "Unavailable";
  const delta = baseline == null ? null : value - baseline;
  return `${number.format(value)} ${unit}${delta == null ? "" : ` (${delta > 0 ? "+" : ""}${number.format(delta)} ${unit})`}`;
}

const optionValue = (value: number | null | undefined, unit = "") =>
  value == null ? "—" : `${value.toFixed(1)}${unit}`;

function difference(
  value: number | null | undefined,
  baseline: number | null | undefined,
  unit = "",
) {
  if (value == null || baseline == null) return null;
  const delta = Number((value - baseline).toFixed(1));
  return (
    <small>
      {delta === 0
        ? "Unchanged"
        : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}${unit}`}
    </small>
  );
}

function OptionDetails({
  option,
  original,
  equipment,
}: {
  option: PlanBForecast;
  original: Research;
  equipment: SolarSettings;
}) {
  const { result, bounds } = option;
  const mission = result.mission;
  const hours =
    (Date.parse(mission.start) - Date.parse(original.mission.start)) /
    3_600_000;
  const compareGeometry = comparableVisibility(original, result);
  const terrain = comparableTerrain(original, result)
    ? original.terrain
    : undefined;
  const scoreComparable = comparableScores(original, result);
  let originalEnergy: number | undefined;
  if (compareGeometry) {
    try {
      originalEnergy = solarEstimate(original, equipment)?.total_kwh;
    } catch {}
  }
  const readings = [
    ["Landing location", mission.name],
    ["Touchdown", utc(mission.start)],
    [
      "Delay",
      metric(hours, "h") +
        (hours >= 24 ? ` · ${metric(hours / 24, "days")}` : ""),
    ],
    [
      "Sunlight",
      metric(
        result.geometry.sunlight_hours,
        "h",
        compareGeometry ? original.geometry.sunlight_hours : undefined,
      ),
    ],
    [
      "Longest Earth outage",
      metric(
        result.geometry.metrics?.longest_blackout_hours,
        "h",
        compareGeometry
          ? original.geometry.metrics?.longest_blackout_hours
          : undefined,
      ),
    ],
    ["Estimated solar energy", metric(option.energy, "kWh", originalEnergy)],
    [
      "Research score",
      metric(
        result.score ?? undefined,
        "/ 100",
        scoreComparable ? (original.score ?? undefined) : undefined,
      ),
    ],
  ];
  return (
    <>
      <table
        className="what-if-table"
        aria-label={`Comparison for ${mission.name} at ${utc(mission.start)}`}
      >
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Result (change from Pre-Result 1)</th>
          </tr>
        </thead>
        <tbody>
          {readings.map(([label, reading]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{reading}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!compareGeometry && (
        <p>
          Sun, Earth, and energy differences are unavailable because the skyline
          evidence differs.
        </p>
      )}
      {!scoreComparable && (
        <p>Scores are incomparable because evidence coverage differs.</p>
      )}
      <details className="pre-extra">
        <summary>Mission, terrain and ice details</summary>
        <dl>
          <div>
            <dt>Coordinates</dt>
            <dd>
              {mission.latitude.toFixed(5)}°, {mission.longitude.toFixed(5)}°
            </dd>
          </div>
          {result.observer_height?.available &&
            result.observer_height.coverage_type === "global" && (
              <div>
                <dt>Approximate elevation</dt>
                <dd>
                  {metric(result.observer_height.value, "m")} above the lunar
                  reference sphere · NASA LOLA global map
                </dd>
              </div>
            )}
          <div>
            <dt>Mission end</dt>
            <dd>{utc(mission.end)}</dd>
          </div>
          <div>
            <dt>Terrain measurements and limits</dt>
            <dd>
              Maximum slope{" "}
              {metric(
                result.terrain.slope_max_deg,
                "°",
                terrain?.slope_max_deg,
              )}{" "}
              / {metric(original.limits?.max_slope_deg, "°")} limit
            </dd>
            <dd>
              Roughness{" "}
              {metric(result.terrain.roughness_m, "m", terrain?.roughness_m)} /{" "}
              {metric(original.limits?.max_roughness_m, "m")} limit
            </dd>
            <dd>
              Relief {metric(result.terrain.relief_m, "m", terrain?.relief_m)} /{" "}
              {metric(original.limits?.max_relief_m, "m")} limit
            </dd>
            <dd>
              DEM pixels {metric(result.terrain.resolution_m, "m")} /{" "}
              {metric(original.limits?.max_resolution_m, "m")} limit
            </dd>
            {bounds && (
              <dd>
                Apollo terrain screen ({metric(option.screening_radius_m, "m")}{" "}
                radius) · mean slope {metric(bounds.slope_mean_deg, "°")} / 6°
                limit · maximum slope {metric(bounds.slope_max_deg, "°")} /{" "}
                {metric(
                  Math.min(12, original.limits?.max_slope_deg ?? 12),
                  "°",
                )}{" "}
                limit
              </dd>
            )}
          </div>
        </dl>
      </details>
    </>
  );
}

export default function PlanBComparison({
  original,
  pendingMission,
  area,
  areaResult,
  priority,
  equipment,
  alternativePicker,
  onCompare,
  isCompared,
  comparedCount,
  hidden,
}: {
  original?: Research;
  pendingMission?: Mission;
  area?: ResearchArea;
  areaResult?: ResearchAreaResult;
  priority: ResearchPriority;
  equipment: SolarSettings;
  alternativePicker: ReactNode;
  onCompare: (options: PlanBForecast[]) => void;
  isCompared: (option: PlanBForecast) => boolean;
  comparedCount: number;
  hidden: boolean;
}) {
  const [mode, setMode] = useState<PlanBMode>("delay");
  const [range, setRange] = useState<PlanBWindow>("month");
  const [custom, setCustom] = useState("");
  const [time, setTime] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [progress, setProgress] = useState(initialProgress);
  const [status, setStatus] = useState<
    "idle" | "running" | "done" | "cancelled" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  const reused: PlanBForecast[] = [];
  if (mode === "relocate" && area && areaResult && original) {
    for (const result of areaResult.results) {
      const location = result.mission;
      const originalWindow = {
        ...original.mission,
        latitude: location.latitude,
        longitude: location.longitude,
      };
      if (siteKey(location) === siteKey(original.mission) ||
          !inComparisonArea(area.centre, location, area.radiusKm) ||
          !sameMission(location, originalWindow)) continue;

      const energy = solarEstimate(result, equipment);
      const reasons = [...result.constraints_failed];
      if (areaResult.recommended !== true && !reasons.length)
        reasons.push("Required landing evidence was unresolved in the initial search.");
      if (result.geometry.mode !== "terrain_screened" || !energy ||
          !Number.isFinite(result.geometry.sunlight_hours) ||
          !Number.isFinite(result.geometry.metrics?.longest_blackout_hours))
        reasons.push("Complete terrain-screened Sun and Earth observations are unavailable.");
      if (energy && (energy.unmet_kwh ?? 0) > 1e-8)
        reasons.push("The modeled solar array and battery leave some configured equipment demand unmet.");
      reused.push({ location, result, energy: energy?.total_kwh, reasons });
    }
  }

  async function run() {
    if (!original || controller.current) return;
    setMessage("");
    setProgress(initialProgress);
    if (mode !== "relocate") {
      setSelectedKeys([]);
      setExpanded(null);
    }
    setStatus("idle");
    let dates;
    try {
      dates =
        mode === "relocate"
          ? {
              first: Date.parse(original.mission.start),
              count: 1,
              clipped: false,
            }
          : searchDates(original.mission, range, custom, time);
    } catch (error) {
      setMessage((error as Error).message);
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setStatus("running");
    setEditing(mode === "relocate");
    try {
      await findPlanB({
        original,
        area,
        mode,
        dates,
        equipment,
        priority,
        signal: active.signal,
        excludedSites: new Set(reused.map(({ location }) => siteKey(location))),
        update: (next) => {
          if (controller.current === active) setProgress(next);
        },
      });
      if (controller.current === active)
        setStatus(active.signal.aborted ? "cancelled" : "done");
    } catch (error) {
      if (controller.current !== active) return;
      setStatus(active.signal.aborted ? "cancelled" : "error");
      if (!active.signal.aborted) setMessage((error as Error).message);
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }

  const ranked: PlanBForecast[] =
    status !== "running"
      ? rankOptions(progress.options, priority, mode).map((option) => ({
          ...option,
          reasons: [],
        }))
      : [];
  const incomplete =
    status === "cancelled" ||
    status === "error" ||
    progress.clipped ||
    progress.unavailable > 0 ||
    progress.forecastsUnavailable > 0;
  const done = status !== "idle" && status !== "running";
  const options = new Map<string, PlanBForecast>();
  for (const option of reused) options.set(missionKey(option.result.mission), option);
  if (done) {
    for (const option of [...ranked, ...progress.forecasts]) {
      const key = missionKey(option.result.mission);
      if (!options.has(key)) options.set(key, option);
    }
  }
  const selectedOptions = [...options].filter(
    ([key, option]) => selectedKeys.includes(key) && !isCompared(option),
  );
  const remainingSlots = Math.max(0, 3 - comparedCount);
  function toggleOption(key: string) {
    setSelectedKeys((keys) =>
      keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key],
    );
  }
  const resetResult = () => {
    setStatus("idle");
    setMessage("");
    setProgress(initialProgress);
    setSelectedKeys([]);
    setExpanded(null);
    setEditing(true);
  };
  const mission = original?.mission ?? pendingMission;
  return (
    <article
      className="pre-result-card glass plan-b-card"
      aria-label="What IF"
      hidden={hidden}
    >
      <h2>What IF</h2>
      <details className="pre-extra">
        <summary>How the search works</summary>
        <p>
          What IF keeps the mission duration, equipment settings, and limits
          from Pre-Result 1. It tests the site or dates you choose. Longer
          windows are sampled, with extra checks around promising dates.
        </p>
        <p>
          NASA JPL predicts Sun and Earth positions for the selected UTC dates.
          Measured terrain and historical temperature data inform the landing
          checks. When a site fails those checks or lacks evidence, What IF can
          still show a limited outlook for its sunlight, Earth visibility, and
          solar energy.
        </p>
      </details>
      <fieldset className="what-if-mode" disabled={status === "running"}>
        <legend>Search mode</legend>
        <div className="what-if-segments">
          {searchModes.map(({ value, label }) => (
            <label key={value}>
              <input
                type="radio"
                name="what-if-mode"
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  resetResult();
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="pre-extra" hidden={mode !== "relocate"}>
        <summary>Custom coordinates and terrain suggestions</summary>
        {!pendingMission && alternativePicker}
      </details>
      {!mission ? (
        <p>
          Evaluate a landing point to use its mission settings for a backup search.
        </p>
      ) : (
        <>
          <div className="what-if-search-centre">
            <div>
              <strong>
                {mode === "delay"
                  ? "Same location"
                  : `Within ${area?.radiusKm ?? comparisonRadiusKm} km`}
              </strong>
              {" · "}
              {mode === "relocate"
                ? `Same touchdown: ${(original ? utc(mission.start) : "—")}`
                : `${range === "custom" ? custom || "Custom window" : range === "month" ? "Next month" : "Next year"} · ${time ? `${time} UTC` : (original ? utc(mission.start).slice(11) : "—")}`}
              <small>{mode === "delay" ? "Landing point" : "Research centre"}: {mode === "delay" ? original?.mission.name ?? "—" : area?.centre.name ?? mission.name}</small>
            </div>
            {!editing && status !== "running" && (
              <button
                type="button"
                className="button subtle"
                onClick={() => setEditing(true)}
              >
                Edit search
              </button>
            )}
          </div>
          <form
            hidden={!editing && status !== "running"}
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <fieldset disabled={status === "running"} hidden={!editing}>
              {mode !== "relocate" && (
                <>
                  <label>
                    Search window
                    <select
                      value={range}
                      onChange={(event) => {
                        setRange(event.target.value as PlanBWindow);
                        resetResult();
                      }}
                    >
                      <option value="month">1 calendar month</option>
                      <option value="year">1 calendar year</option>
                      <option value="custom">Custom end date</option>
                    </select>
                  </label>
                  {range === "custom" && (
                    <label>
                      Search end date (UTC)
                      <input
                        type="date"
                        required
                        value={custom}
                        min={new Date(mission.start)
                          .toISOString()
                          .slice(0, 10)}
                        max={new Date(latestTouchdown(mission))
                          .toISOString()
                          .slice(0, 10)}
                        onChange={(event) => {
                          setCustom(event.target.value);
                          resetResult();
                        }}
                      />
                    </label>
                  )}
                  <label>
                    Alternate UTC touchdown time
                    <input
                      type="time"
                      step="1"
                      value={time}
                      onChange={(event) => {
                        setTime(event.target.value);
                        resetResult();
                      }}
                    />
                    <small>
                      Blank uses the original time of{" "}
                      {(original ? utc(mission.start).slice(11) : "—")}.
                    </small>
                  </label>
                </>
              )}
              <button type="submit" className="button primary" disabled={!original}>
                {mode === "relocate" ? (reused.length ? "Search more locations" : "Suggest nearby points") : "Run What IF"}
              </button>
            </fieldset>
            {status === "running" && (
              <button
                type="button"
                className="button subtle"
                onClick={() => controller.current?.abort()}
              >
                Cancel search
              </button>
            )}
          </form>
          {pendingMission && <p>Waiting for the initial assessment…</p>}
          {message && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
          {status !== "idle" && (
            <div role="status" className="plan-b-progress">
              {status === "running" && (
                <p>{progress.stage || "Preparing backup search…"}</p>
              )}
              {status === "running" && progress.scheduled > 0 && (
                <progress
                  aria-label="Options checked"
                  max={progress.scheduled}
                  value={
                    progress.evaluated +
                    progress.unavailable +
                    progress.skipped +
                    progress.forecasts.length +
                    progress.forecastsUnavailable
                  }
                />
              )}
              <p>
                {progress.evaluated}{" "}
                {progress.evaluated === 1 ? "option" : "options"} evaluated
                {progress.unavailable > 0 &&
                  ` · ${progress.unavailable} could not be evaluated`}
                {progress.skipped > 0 &&
                  ` · ${progress.skipped} skipped after site screening`}
                .
              </p>
              {incomplete && (
                <p>
                  Search incomplete
                  {status === "cancelled" ? " · cancelled" : ""}
                  {progress.clipped
                    ? " · ephemeris coverage shortened the window"
                    : ""}
                  .
                </p>
              )}
            </div>
          )}
          {original && (done || reused.length > 0) && (
            <>
              <section aria-label="Suggested comparison options">
                <h3>
                  {mode === "delay"
                    ? "Choose dates to compare"
                    : mode === "relocate"
                      ? "Choose locations to compare"
                      : "Choose options to compare"}
                </h3>
                {reused.length > 0 && <p>Showing {reused.length} locations already assessed for this research area and mission window.</p>}
                {done && ranked.length === 0 && !reused.some((option) => !option.reasons.length) && (
                  <p className="info">
                    No backup passed the checks in this search. Any available
                    forecasts are marked Unverified.
                  </p>
                )}
                {options.size > 0 && (
                  <>
                    <div
                      className="what-if-options-scroll table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Suggested options table"
                    >
                      <table
                        className="what-if-options"
                        aria-label="Suggested plans"
                      >
                        <thead>
                          <tr>
                            <th scope="col">Select</th>
                            <th scope="col">Option &amp; touchdown</th>
                            <th scope="col">Score</th>
                            <th scope="col">Sunlight</th>
                            <th scope="col">
                              {mode === "relocate"
                                ? "Terrain"
                                : "Earth visibility"}
                            </th>
                            <th scope="col">Status</th>
                            <th scope="col">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <input
                                type="checkbox"
                                checked
                                disabled
                                aria-label="Original plan included"
                              />
                            </td>
                            <th scope="row">
                              {original.mission.name}
                              <small>{utc(original.mission.start)}</small>
                            </th>
                            <td>{optionValue(original.score)}</td>
                            <td>
                              {optionValue(original.factors.S?.score, "%")}
                            </td>
                            <td>
                              {optionValue(
                                mode === "relocate"
                                  ? original.factors.T?.score
                                  : original.factors.C?.score,
                                mode === "relocate" ? "" : "%",
                              )}
                            </td>
                            <td>Baseline</td>
                            <td>—</td>
                          </tr>
                          {[...options].map(([key, option]) => {
                            const result = option.result;
                            const candidate = result.mission;
                            const added = isCompared(option);
                            const checked = added || selectedKeys.includes(key);
                            const visibility = comparableVisibility(
                              original,
                              result,
                            );
                            const isLocationMode = mode === "relocate";
                            const secondary = isLocationMode ? "T" : "C";
                            const hours =
                              (Date.parse(candidate.start) -
                                Date.parse(original.mission.start)) /
                              3_600_000;
                            const distance = comparisonDistanceKm(
                              area?.centre ?? original.mission,
                              candidate,
                            );
                            return (
                              <Fragment key={key}>
                                <tr
                                  className={
                                    checked ? "is-selected" : undefined
                                  }
                                >
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={added || (!checked && selectedOptions.length >= remainingSlots)}
                                      aria-label={`Select ${candidate.name} · ${utc(candidate.start)}`}
                                      onChange={() => toggleOption(key)}
                                    />
                                  </td>
                                  <th scope="row">
                                    {candidate.name}
                                    <small>{utc(candidate.start)}</small>
                                    <small>
                                      {mode !== "delay" &&
                                        `${number.format(distance)} km from research centre`}
                                      {mode === "both" && " · "}
                                      {mode !== "relocate" &&
                                        `+${number.format(hours)} h`}
                                    </small>
                                  </th>
                                  <td>
                                    {optionValue(result.score)}
                                    {comparableScores(original, result) &&
                                      difference(result.score, original.score)}
                                  </td>
                                  <td>
                                    {optionValue(result.factors.S?.score, "%")}
                                    {visibility &&
                                      difference(
                                        result.factors.S?.score,
                                        original.factors.S?.score,
                                        " pp",
                                      )}
                                  </td>
                                  <td>
                                    {optionValue(
                                      result.factors[secondary]?.score,
                                      isLocationMode ? "" : "%",
                                    )}
                                    {(isLocationMode
                                      ? comparableTerrain(original, result)
                                      : visibility) &&
                                      difference(
                                        result.factors[secondary]?.score,
                                        original.factors[secondary]?.score,
                                        isLocationMode ? "" : " pp",
                                      )}
                                  </td>
                                  <td>
                                    {option.reasons.length
                                      ? "Unverified"
                                      : "Screened"}
                                    {added && <small>In comparison</small>}
                                  </td>
                                  <td>
                                    <button
                                      className="button subtle"
                                      type="button"
                                      aria-expanded={expanded === key}
                                      aria-label={`Details for ${candidate.name} · ${utc(candidate.start)}`}
                                      onClick={() =>
                                        setExpanded(
                                          expanded === key ? null : key,
                                        )
                                      }
                                    >
                                      {expanded === key ? "Hide" : "Details"}
                                    </button>
                                  </td>
                                </tr>
                                {expanded === key && (
                                  <tr>
                                    <td colSpan={7}>
                                      {option.reasons.length > 0 && (
                                        <p>{option.reasons.join(" ")}</p>
                                      )}
                                      <OptionDetails
                                        option={option}
                                        original={original}
                                        equipment={equipment}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p>
                      Changes are relative to Pre-Result 1. pp = percentage
                      points.
                    </p>
                    <div className="what-if-selection">
                      <div>
                        <strong>
                          {selectedOptions.length} alternatives selected
                        </strong>
                        <small>Original included automatically.</small>
                      </div>
                      {selectedOptions.map(([key, option]) => (
                        <button
                          className="button subtle"
                          type="button"
                          key={key}
                          onClick={() => toggleOption(key)}
                          aria-label={`Deselect ${option.result.mission.name} · ${utc(option.result.mission.start)}`}
                        >
                          {option.result.mission.name} ·{" "}
                          {option.result.mission.start.slice(0, 10)} ×
                        </button>
                      ))}
                      <button
                        className="button subtle"
                        type="button"
                        disabled={!selectedOptions.length}
                        onClick={() => setSelectedKeys([])}
                      >
                        Clear
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        disabled={!selectedOptions.length || selectedOptions.length > remainingSlots}
                        onClick={() => {
                          onCompare(
                            selectedOptions.map(([, option]) => option),
                          );
                          setSelectedKeys([]);
                        }}
                      >
                        Compare selected (
                        {comparedCount + selectedOptions.length})
                      </button>
                    </div>
                  </>
                )}
              </section>
              <details className="pre-extra">
                <summary>Skipped options &amp; screening reasons</summary>
                {progress.sampled && (
                  <p>
                    The search checks selected touchdown times within your date
                    window.
                  </p>
                )}
                {progress.skipped > 0 && (
                  <p>
                    The skipped dates share a site with a failed check or
                    missing evidence. Changing the touchdown date cannot resolve
                    that site check. Forecasts sample the first and last
                    touchdown times for that site.
                  </p>
                )}
                {(progress.limits > 0 || progress.missing > 0) && (
                  <p>
                    {progress.limits} exceeded limits · {progress.missing}{" "}
                    lacked required evidence.
                  </p>
                )}
                {progress.shortlist && (
                  <p>
                    Terrain screening covered {progress.shortlist.searched}{" "}
                    points: {progress.shortlist.outside_or_missing} lacked
                    evidence, {progress.shortlist.failed_limits} exceeded
                    limits, {progress.shortlist.overlap_excluded} overlapped,
                    and {progress.shortlist.passing_terrain_candidates} passed.
                  </p>
                )}
                {progress.forecastsUnavailable > 0 && (
                  <p>
                    {progress.forecastsUnavailable} outlooks could not be
                    calculated.
                  </p>
                )}
              </details>
              {progress.reasons.length > 0 && (
                <details className="pre-extra" open={ranked.length === 0}>
                  <summary>Assessment notes</summary>
                  <ul>
                    {progress.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}
