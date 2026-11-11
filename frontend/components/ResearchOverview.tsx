"use client";
import { ArrowUpRight, Clock3, Layers, Radio, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Research } from "./LandingResearch";
import { ResearchWindows } from "./ResearchComparisonReport";
import ResearchElevationChart, { formatVisibilityTime as utc } from "./ResearchElevationChart";
import ResearchSolarEstimate from "./ResearchSolarEstimate";
import type { Site } from "../app/types";
import { inComparisonArea, siteKey, terrainReference } from "./ComparisonPicker";

const evidence = () =>
  document.getElementById("landing-assessment")?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
export default function ResearchOverview({
  result,
  comparisonOrigin,
  onNavigate,
  onAddComparison,
  busy = false,
}: {
  result: Research | null;
  comparisonOrigin: Site;
  onNavigate: (view: number) => void;
  onAddComparison: (site: Site) => void;
  busy?: boolean;
}) {
  const rows = result?.geometry.available ? (result.geometry.series ?? []) : [];
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(1);
  const sample = rows[Math.min(cursor, Math.max(rows.length - 1, 0))];
  const canPlay = rows.length > 1 && cursor < rows.length - 1;
  useEffect(() => {
    if (!playing || !canPlay) return;
    const timer = window.setInterval(() => {
      setCursor((index) => Math.min(index + step, rows.length - 1));
    }, 350);
    return () => window.clearInterval(timer);
  }, [playing, canPlay, rows.length, step]);
  const blocked = !!result?.constraints_failed.length;
  return (
    <section
      className="canva-assessment"
      aria-label="Landing assessment overview"
      aria-busy={busy}
    >
      <div className="outlook-site">
        <span className="eyebrow">01 / LANDING ASSESSMENT</span>
        <p>
          {result ? (
            <>
              <strong>{result.mission.name}</strong> ·{" "}
              {result.mission.latitude.toFixed(4)}° N /{" "}
              {result.mission.longitude.toFixed(4)}° E
            </>
          ) : busy ? (
            "Retrieving NASA observations and screening available terrain…"
          ) : (
            "Choose a location and mission window to see the evidence."
          )}
        </p>
        {result && (
          <button className="button subtle" onClick={() => onAddComparison(result.mission)}>
            Show this point in comparison
          </button>
        )}
      </div>
      <div className="outlook-dashboard">
        <article id="result-visibility" tabIndex={-1} className="outlook-visual glass">
          <span className="eyebrow">SUNLIGHT & EARTH VISIBILITY</span>
          <h2>Your mission window.</h2>
          <p>
            Actual sampled elevations and the local skyline, where available.
          </p>
          {rows.length > 0 ? (
            <>
              {result && <ResearchElevationChart result={result} selectedTime={sample?.time} />}
              {sample && (
                <div className="research-timeline">
                  <div className="account-actions">
                    <button type="button" className="button subtle" disabled={rows.length < 2} onClick={() => {
                      if (!canPlay) setCursor(0);
                      setPlaying(!(playing && canPlay));
                    }}>{playing && canPlay ? "Pause timeline" : "Play timeline"}</button>
                    <button type="button" className="button subtle" onClick={() => { setPlaying(false); setCursor(0); }}>Reset timeline</button>
                    <label>Playback step <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
                      <option value={1}>1 sample</option><option value={3}>3 samples</option><option value={6}>6 samples</option>
                    </select></label>
                  </div>
                  <label>Mission time · {utc(sample.time)} UTC
                    <input type="range" min={0} max={rows.length - 1} value={Math.min(cursor, rows.length - 1)}
                      aria-label="Mission time" aria-valuetext={`${utc(sample.time)} UTC`}
                      onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)); }} />
                  </label>
                  <p>Sun {sample.sun_azimuth.toFixed(2)}° az / {sample.sun_elevation.toFixed(2)}° el · {sample.sun_visible ? "visible" : "below threshold"}</p>
                  <p>Earth {sample.earth_azimuth.toFixed(2)}° az / {sample.earth_elevation.toFixed(2)}° el · {sample.earth_visible ? "visible" : "below threshold"}</p>
                  {sample.sun_horizon_deg != null && sample.earth_horizon_deg != null && (
                    <p>Terrain threshold at this sample: Sun {sample.sun_horizon_deg.toFixed(2)}° · Earth {sample.earth_horizon_deg.toFixed(2)}° including clearance</p>
                  )}
                </div>
              )}
              {!!result?.horizon.profile?.length && sample && (
                <details className="research-skyline">
                  <summary>Terrain skyline by azimuth</summary>
                  <div className="outlook-chart" role="img" aria-label="Terrain skyline elevation by azimuth with the current Sun and Earth directions">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 250 }}>
                      <LineChart data={[...result.horizon.profile, { azimuth: 360, elevation: result.horizon.profile[0].elevation }]}>
                        <XAxis dataKey="azimuth" type="number" domain={[0, 360]} ticks={[0, 90, 180, 270, 360]} unit="°" />
                        <YAxis unit="°" />
                        <Tooltip labelFormatter={(value) => `Azimuth ${value}°`} formatter={(value: number) => `${value.toFixed(2)}°`} />
                        <Line dataKey="elevation" name="Skyline elevation" stroke="#b5c7df" dot={false} isAnimationActive={false} />
                        <ReferenceLine x={sample.sun_azimuth} stroke="#eacb89" />
                        <ReferenceLine x={sample.earth_azimuth} stroke="#9ecff2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p>Gold: Sun azimuth. Blue: Earth azimuth. The 20 km skyline excludes terrain beyond the sampled rays.</p>
                </details>
              )}
              {result && <><ResearchSolarEstimate result={result} /><ResearchWindows result={result} /></>}
            </>
          ) : (
            <div className="outlook-chart-empty" role="status">
              <Sun size={30} strokeWidth={1} />
              <h3>
                {busy ? "Reading the sky…" : "A window into your mission."}
              </h3>
              <p>
                {result?.geometry.reason ||
                  "The chart appears after an assessment. No sample positions or default percentages are substituted."}
              </p>
            </div>
          )}
          <button className="text-button" onClick={() => onNavigate(5)}>
            Open 3D observatory <ArrowUpRight size={14} />
          </button>
        </article>
        <div className="outlook-data-stack">
          <article className="outlook-data glass">
            <span className="eyebrow">
              <Layers size={14} />
              SLOPE & TERRAIN EVIDENCE
            </span>
            <strong>
              {result?.terrain.available && result.terrain.slope_p95_deg != null
                ? `${result.terrain.slope_p95_deg.toFixed(1)}° p95 slope`
                : "Local terrain unavailable"}
            </strong>
            <p>
              {result && result.factors.T.score == null
                ? result.factors.T.explanation
                : result?.terrain.available
                ? `${result.terrain.resolution_m} m native pixels. ${result.terrain.coverage_type === "regional" ? "Regional screening; finer footprint slopes and hazards are unresolved." : "Boulder and crater hazards remain incomplete."}`
                : result?.terrain.reason || "Awaiting site assessment."}
            </p>
            {result?.factors.T.score == null && result?.horizon.available && (
              <p>The available terrain supports skyline estimates. Check the neighbourhood size and DEM resolution limit for slope scoring.</p>
            )}
            {result && result.factors.T.score == null &&
              inComparisonArea(comparisonOrigin, terrainReference) &&
              siteKey(result.mission) !== siteKey(terrainReference) && (
                <button className="text-button" onClick={() => onAddComparison(terrainReference)}>
                  Add Connecting Ridge to comparison <ArrowUpRight size={14} />
                </button>
              )}
          </article>
          {result && (
            <article className="outlook-data glass">
              <span className="eyebrow">{result.ice?.radius_m ? "WATER ICE POTENTIAL · PERMANENT SHADOW PROXY" : "WATER ICE POTENTIAL"}</span>
              <strong>{result.factors.I.score == null ? "Unavailable" : result.ice?.radius_m ? `${result.factors.I.score.toFixed(1)}% mapped shadow` : `${result.factors.I.score.toFixed(1)} / 100`}</strong>
              <p>{result.factors.I.explanation}</p>
              {result.factors.I.source?.source_url && <a href={result.factors.I.source.source_url}>Dataset source</a>}
            </article>
          )}
          {[
            { key: "S", label: "SOLAR ILLUMINATION WINDOW", Icon: Sun },
            { key: "C", label: "EARTH COMMUNICATION WINDOW", Icon: Radio },
          ].map(({ key, label, Icon }) => {
            const f = result?.factors[key];
            return (
              <article className="outlook-data glass" key={key}>
                <span className="eyebrow">
                  <Icon size={14} />
                  {label}
                </span>
                <div className="outlook-metric">
                  <strong>
                    {f?.score == null
                      ? "Unavailable"
                      : `${f.score.toFixed(1)}%`}
                  </strong>
                  <span>
                    {key === "S" ? "sunlight availability" : "Earth visibility"}
                  </span>
                </div>
                {f?.score != null && (
                  <div className="availability-bar">
                    <span style={{ width: `${f.score}%` }} />
                  </div>
                )}
                <p>
                  {key === "S"
                    ? "Sampled visibility; not a power forecast."
                    : "Geometric visibility; not a complete link budget."}
                </p>
              </article>
            );
          })}
          <article className="outlook-data glass">
            <span className="eyebrow">
              <Clock3 size={14} />
              SELECTED MISSION TIMELINE
            </span>
            <strong>
              {result
                ? `${utc(result.mission.start)} → ${utc(result.mission.end)} UTC`
                : "Your dates, your mission window."}
            </strong>
            <p>
              {result
                ? `${result.mission.interval_minutes}-minute samples · ${result.geometry.mode?.replaceAll("_", " ") || "Geometry unavailable"}`
                : "Set start and end dates on Search."}
            </p>
          </article>
        </div>
      </div>
      <div className="outlook-summary">
        <article className="outlook-score glass">
          <span className="eyebrow">FIVE-FACTOR RESEARCH SCORE</span>
          <div className="outlook-score-line">
            <strong>
              {result?.score == null ? "—" : result.score.toFixed(1)}
            </strong>
            <span>/ 100</span>
            <span className="tag">
              {result
                ? result.provisional
                  ? "PROVISIONAL"
                  : "RESEARCH ASSESSMENT"
                : busy
                  ? "CALCULATING"
                  : "AWAITING ASSESSMENT"}
            </span>
          </div>
          <p>
            {result
              ? `Available evidence: ${(result.available_weight * 100).toFixed(0)}% of nominal weight. Missing factors: ${result.missing.join(", ") || "none"}.`
              : "Scores appear only when supported by assessment data."}{" "}
            This is not a probability of landing success.
          </p>
          <button
            className="text-button"
            onClick={result ? evidence : () => onNavigate(7)}
          >
            {result ? "Inspect factor contributions" : "Choose a location"}
            <ArrowUpRight size={14} />
          </button>
        </article>
        <article className="outlook-recommendation glass">
          <span className="eyebrow">ASSESSMENT GUIDANCE</span>
          <h2>
            {!result
              ? busy
                ? "Assessment in progress"
                : "Awaiting your search"
              : blocked
                ? "Review the landing limits."
                : "Continue the investigation."}
          </h2>
          <p>
            {result
              ? blocked
                ? result.constraints_failed.join(" ")
                : "Landing safety is not established. Review missing evidence, Apollo LM assumptions and uncertainty before comparing candidates."
              : "Enter dates and lunar coordinates on Search. The assessment will show measured factors, coverage and constraints."}
          </p>
          <button
            className="text-button"
            onClick={result ? evidence : () => onNavigate(7)}
          >
            {result
              ? "Evidence, sources & spacecraft checks"
              : "Start exploring"}
            <ArrowUpRight size={14} />
          </button>
        </article>
      </div>
      <div className="outlook-footer">
        <span>NASA JPL HORIZONS · LOLA · HISTORICAL DIVINER</span>
      </div>
    </section>
  );
}
