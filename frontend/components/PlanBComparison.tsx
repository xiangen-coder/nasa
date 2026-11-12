"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Research } from "./LandingResearch";
import WaterIceFactor from "./WaterIceFactor";
import type { ResearchPriority } from "./SearchConsole";
import type { SolarSettings } from "./mission-lab/scenario-science";
import {
  comparableScores, comparableTerrain, findPlanB, initialProgress, latestTouchdown,
  rankOptions, searchDates, solarEstimate, type PlanBMode, type PlanBForecast, type PlanBWindow,
} from "../lib/plan-b";

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const utc = (time: string) => new Date(time).toISOString().slice(0, 19).replace("T", " ") + " UTC";

function metric(value: number | undefined, unit: string, baseline?: number) {
  if (value == null) return "Unavailable";
  const delta = baseline == null ? null : value - baseline;
  return `${number.format(value)} ${unit}${delta == null ? "" : ` (${delta > 0 ? "+" : ""}${number.format(delta)} ${unit})`}`;
}

function OptionDetails({ option, original, equipment, onCompare, onRemove, added }: {
  option: PlanBForecast;
  original: Research;
  equipment: SolarSettings;
  onCompare: (option: PlanBForecast) => void;
  onRemove?: () => void;
  added: boolean;
}) {
  const { result, bounds } = option;
  const mission = result.mission;
  const hours = (Date.parse(mission.start) - Date.parse(original.mission.start)) / 3_600_000;
  const compareGeometry = result.geometry.mode === original.geometry.mode &&
    result.horizon.source?.resolution_m === original.horizon.source?.resolution_m &&
    result.horizon.source?.name === original.horizon.source?.name;
  const terrain = comparableTerrain(original, result) ? original.terrain : undefined;
  const scoreComparable = comparableScores(original, result);
  let originalEnergy: number | undefined;
  if (compareGeometry) {
    try { originalEnergy = solarEstimate(original, equipment)?.total_kwh; } catch {}
  }
  return (
    <>
    <dl className="plan-b-metrics">
      <div><dt>Landing location</dt><dd>{mission.name} · {mission.latitude.toFixed(5)}°, {mission.longitude.toFixed(5)}°</dd></div>
      {result.observer_height?.available && result.observer_height.coverage_type === "global" && (
        <div><dt>Approximate elevation</dt><dd>{metric(result.observer_height.value, "m")} above the lunar reference sphere · NASA LOLA global map</dd></div>
      )}
      <div><dt>Touchdown</dt><dd>{utc(mission.start)}</dd></div>
      <div><dt>Mission end</dt><dd>{utc(mission.end)}</dd></div>
      <div><dt>Delay</dt><dd>{metric(hours, "h")}{hours >= 24 && ` · ${metric(hours / 24, "days")}`}</dd></div>
      <div><dt>Sunlight</dt><dd>{metric(result.geometry.sunlight_hours, "h", compareGeometry ? original.geometry.sunlight_hours : undefined)}</dd></div>
      <div><dt>Longest Earth outage</dt><dd>{metric(result.geometry.metrics?.longest_blackout_hours, "h", compareGeometry ? original.geometry.metrics?.longest_blackout_hours : undefined)}</dd></div>
      <div><dt>Estimated solar energy</dt><dd>{metric(option.energy, "kWh", originalEnergy)}</dd></div>
      {!compareGeometry && <div><dd>Sun, Earth, and energy differences are unavailable because the skyline evidence differs.</dd></div>}
      <div>
        <dt>Terrain measurements and limits</dt>
        <dd>Maximum slope {metric(result.terrain.slope_max_deg, "°", terrain?.slope_max_deg)} / {metric(original.limits?.max_slope_deg, "°")} limit</dd>
        <dd>Roughness {metric(result.terrain.roughness_m, "m", terrain?.roughness_m)} / {metric(original.limits?.max_roughness_m, "m")} limit</dd>
        <dd>Relief {metric(result.terrain.relief_m, "m", terrain?.relief_m)} / {metric(original.limits?.max_relief_m, "m")} limit</dd>
        <dd>DEM pixels {metric(result.terrain.resolution_m, "m")} / {metric(original.limits?.max_resolution_m, "m")} limit</dd>
        {bounds && <dd>Apollo terrain screen ({metric(option.screening_radius_m, "m")} radius) · mean slope {metric(bounds.slope_mean_deg, "°")} / 6° limit · maximum slope {metric(bounds.slope_max_deg, "°")} / {metric(Math.min(12, original.limits?.max_slope_deg ?? 12), "°")} limit</dd>}
      </div>
      <WaterIceFactor result={result} />
      <div>
        <dt>Research score</dt>
        <dd>{metric(result.score ?? undefined, "/ 100", scoreComparable ? original.score ?? undefined : undefined)}</dd>
        {!scoreComparable && <dd>Scores are incomparable because evidence coverage differs.</dd>}
      </div>
    </dl>
    {onRemove ? (
      <button type="button" className="button subtle" onClick={onRemove}>Remove from Compare</button>
    ) : (
      <button type="button" className="button subtle" disabled={added} onClick={() => onCompare(option)}>
        {added ? "Added to comparison" : "Add to Compare"}
      </button>
    )}
    </>
  );
}

export default function PlanBComparison({ original, priority, equipment, alternativePicker, onCompare, isCompared, removeCompared }: {
  original?: Research;
  priority: ResearchPriority;
  equipment: SolarSettings;
  alternativePicker: ReactNode;
  onCompare: (option: PlanBForecast) => void;
  isCompared: (option: PlanBForecast) => boolean;
  removeCompared: (option: PlanBForecast) => (() => void) | undefined;
}) {
  const [mode, setMode] = useState<PlanBMode>("delay");
  const [range, setRange] = useState<PlanBWindow>("month");
  const [custom, setCustom] = useState("");
  const [time, setTime] = useState("");
  const [progress, setProgress] = useState(initialProgress);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "cancelled" | "error">("idle");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  async function run() {
    if (!original || controller.current) return;
    setMessage("");
    setProgress(initialProgress);
    setStatus("idle");
    let dates;
    try {
      dates = mode === "relocate"
        ? { first: Date.parse(original.mission.start), count: 1, clipped: false }
        : searchDates(original.mission, range, custom, time);
    } catch (error) {
      setMessage((error as Error).message);
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setStatus("running");
    try {
      await findPlanB({ original, mode, dates, equipment, priority, signal: active.signal,
        update: (next) => { if (controller.current === active) setProgress(next); } });
      if (controller.current === active) setStatus(active.signal.aborted ? "cancelled" : "done");
    } catch (error) {
      if (controller.current !== active) return;
      setStatus(active.signal.aborted ? "cancelled" : "error");
      if (!active.signal.aborted) setMessage((error as Error).message);
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }

  const ranked: PlanBForecast[] = status !== "running"
    ? rankOptions(progress.options, priority, mode).slice(0, 3).map((option) => ({ ...option, reasons: [] }))
    : [];
  const incomplete = status === "cancelled" || status === "error" || progress.clipped || progress.unavailable > 0 || progress.forecastsUnavailable > 0;
  const done = status !== "idle" && status !== "running";
  const resetResult = () => { setStatus("idle"); setMessage(""); setProgress(initialProgress); };
  return (
    <article className="pre-result-card glass plan-b-card" aria-label="What IF">
      <h2>What IF</h2>
      <details className="pre-extra">
        <summary>How the search works</summary>
        <p>What IF keeps the mission duration, equipment settings, and limits from Pre-Result 1. It tests the site or dates you choose. Longer windows are sampled, with extra checks around promising dates.</p>
        <p>NASA JPL predicts Sun and Earth positions for the selected UTC dates. Measured terrain and historical temperature data inform the landing checks. When a site fails those checks or lacks evidence, What IF can still show a limited outlook for its sunlight, Earth visibility, and solar energy.</p>
      </details>
      <label className="what-if-mode">Search mode
        <select disabled={status === "running"} value={mode} onChange={(event) => { setMode(event.target.value as PlanBMode); resetResult(); }}>
          <option value="delay">Same location, later touchdown</option>
          <option value="relocate">Nearby location, same touchdown</option>
          <option value="both">Nearby location, later touchdown</option>
        </select>
      </label>
      {mode === "relocate" && alternativePicker}
      {!original ? <p>Evaluate Pre-Result 1 to use its mission settings for a backup search.</p> : (
        <>
          <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
            <fieldset disabled={status === "running"}>
              {mode !== "relocate" && (
                <>
                  <label>Search window
                    <select value={range} onChange={(event) => { setRange(event.target.value as PlanBWindow); resetResult(); }}>
                      <option value="month">1 calendar month</option>
                      <option value="year">1 calendar year</option>
                      <option value="custom">Custom end date</option>
                    </select>
                  </label>
                  {range === "custom" && (
                    <label>Search end date (UTC)
                      <input type="date" required value={custom}
                        min={new Date(original.mission.start).toISOString().slice(0, 10)}
                        max={new Date(latestTouchdown(original.mission)).toISOString().slice(0, 10)}
                        onChange={(event) => { setCustom(event.target.value); resetResult(); }} />
                    </label>
                  )}
                  <label>Alternate UTC touchdown time
                    <input type="time" step="1" value={time} onChange={(event) => { setTime(event.target.value); resetResult(); }} />
                    <small>Blank uses the original time of {utc(original.mission.start).slice(11)}.</small>
                  </label>
                </>
              )}
              {mode !== "delay" && <p>Nearby points are screened within 20 km of Pre-Result 1.</p>}
              <button type="submit" className="button primary">Run What IF</button>
            </fieldset>
            {status === "running" && <button type="button" className="button subtle" onClick={() => controller.current?.abort()}>Cancel search</button>}
          </form>
          {message && <p className="error" role="alert">{message}</p>}
          {status !== "idle" && (
            <div role="status" className="plan-b-progress">
              {status === "running" && <p>{progress.stage || "Preparing backup search…"}</p>}
              {status === "running" && progress.scheduled > 0 && (
                <progress aria-label="Options checked" max={progress.scheduled} value={progress.evaluated + progress.unavailable + progress.skipped + progress.forecasts.length + progress.forecastsUnavailable} />
              )}
              <p>{progress.evaluated} {progress.evaluated === 1 ? "option" : "options"} evaluated
                {progress.unavailable > 0 && ` · ${progress.unavailable} could not be evaluated`}
                {progress.skipped > 0 && ` · ${progress.skipped} skipped after site screening`}.</p>
              {incomplete && <p>Search incomplete{status === "cancelled" ? " · cancelled" : ""}{progress.clipped ? " · ephemeris coverage shortened the window" : ""}.</p>}
            </div>
          )}
          {done && (
            <>
              {ranked.length === 0 ? <h3>No viable backup found in this search</h3> : (
                <>
                  <h3>Best of the options evaluated</h3>
                  <OptionDetails option={ranked[0]} original={original} equipment={equipment} onCompare={onCompare} added={isCompared(ranked[0])} onRemove={removeCompared(ranked[0])} />
                  {ranked.slice(1).map((option, index) => (
                    <details key={JSON.stringify(option.result.mission)} className="pre-extra">
                      <summary>Backup {index + 1} · {option.result.mission.name} · {utc(option.result.mission.start)}</summary>
                      <OptionDetails option={option} original={original} equipment={equipment} onCompare={onCompare} added={isCompared(option)} onRemove={removeCompared(option)} />
                    </details>
                  ))}
                  <p>Differences are relative to Pre-Result 1. Screening uses historical thermal observations and sampled visibility. Flight reachability and landing safety still require verification.</p>
                </>
              )}
              {progress.sampled && <p>The search checks selected touchdown times within your date window.</p>}
              {progress.skipped > 0 && <p>The skipped dates share a site with a failed check or missing evidence. Changing the touchdown date cannot resolve that site check. Forecasts sample the first and last touchdown times for that site.</p>}
              {(progress.limits > 0 || progress.missing > 0) && <p>{progress.limits} exceeded limits · {progress.missing} lacked required evidence.</p>}
              {progress.shortlist && <p>Terrain screening covered {progress.shortlist.searched} points: {progress.shortlist.outside_or_missing} lacked evidence, {progress.shortlist.failed_limits} exceeded limits, {progress.shortlist.overlap_excluded} overlapped, and {progress.shortlist.passing_terrain_candidates} passed.</p>}
              {progress.forecastsUnavailable > 0 && <p>{progress.forecastsUnavailable} outlooks could not be calculated.</p>}
              {progress.forecasts.length > 0 && (
                <section aria-label="Forecasts for comparison">
                  <h3>Forecasts for comparison</h3>
                  {progress.forecasts.map((option, index) => (
                    <details key={JSON.stringify(option.result.mission)} className="pre-extra" open={index === 0}>
                      <summary>{option.result.mission.name} · {utc(option.result.mission.start)}</summary>
                      <p>Landing checks unresolved or exceeded. {option.reasons.join(" ")}</p>
                      <p>{option.result.geometry.mode === "terrain_screened" ? "Visibility accounts for the mapped terrain skyline." : "Visibility uses a smooth reference horizon. Local shadows and obstructions are unknown."}</p>
                      <OptionDetails option={option} original={original} equipment={equipment} onCompare={onCompare} added={isCompared(option)} onRemove={removeCompared(option)} />
                    </details>
                  ))}
                </section>
              )}
              {progress.reasons.length > 0 && (
                <details className="pre-extra" open={ranked.length === 0}><summary>Assessment notes</summary>
                  <ul>{progress.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </details>
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}
