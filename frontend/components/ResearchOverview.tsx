"use client";
import { ArrowUpRight, Clock3, Layers, Radio, Sun } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Research } from "./LandingResearch";
import type { Site } from "../app/types";
import { siteKey, terrainReference } from "./ComparisonPicker";

const utc = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const evidence = () =>
  document.getElementById("landing-assessment")?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
export default function ResearchOverview({
  result,
  onNavigate,
  onAddComparison,
  busy = false,
}: {
  result: Research | null;
  onNavigate: (view: number) => void;
  onAddComparison: (site: Site) => void;
  busy?: boolean;
}) {
  const rows = result?.geometry.available ? (result.geometry.series ?? []) : [];
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
        <article className="outlook-visual glass">
          <span className="eyebrow">SUNLIGHT & EARTH VISIBILITY</span>
          <h2>Your mission window.</h2>
          <p>
            Actual sampled elevations and the local skyline, where available.
          </p>
          {rows.length > 0 ? (
            <>
              <div
                className="outlook-chart"
                role="img"
                aria-label="Sun and Earth elevations and terrain horizons over the selected mission window in UTC"
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  initialDimension={{ width: 640, height: 250 }}
                >
                  <LineChart
                    data={rows}
                    margin={{ top: 14, right: 14, bottom: 0, left: -12 }}
                  >
                    <CartesianGrid stroke="#dce9ff16" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(v) =>
                        new Date(v).toLocaleString("en-GB", {
                          timeZone: "UTC",
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                      minTickGap={50}
                      tick={{ fill: "#a8bfdc", fontSize: 10 }}
                    />
                    <YAxis unit="°" tick={{ fill: "#a8bfdc", fontSize: 10 }} />
                    <Tooltip
                      labelFormatter={(v) => `${utc(String(v))} UTC`}
                      formatter={(v: number) => `${v.toFixed(2)}°`}
                      contentStyle={{
                        background: "#101e35",
                        border: "1px solid #c5d9f644",
                        borderRadius: 12,
                        color: "#edf2f8",
                      }}
                    />
                    <Line
                      type="linear"
                      dataKey="sun_elevation"
                      name="Sun elevation"
                      stroke="#eacb89"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="earth_elevation"
                      name="Earth elevation"
                      stroke="#9ecff2"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="sun_horizon_deg"
                      name="Sun skyline"
                      stroke="#eacb89"
                      strokeDasharray="4 5"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="earth_horizon_deg"
                      name="Earth skyline incl. clearance"
                      stroke="#9ecff2"
                      strokeDasharray="4 5"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="outlook-legend">
                <span>
                  <i />
                  Sun
                </span>
                <span>
                  <i />
                  Earth
                </span>
                <span>Dashed: terrain skyline</span>
              </div>
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
                : "Footprint terrain unavailable"}
            </strong>
            <p>
              {result && result.factors.T.score == null
                ? result.factors.T.explanation
                : result?.terrain.available
                ? `${result.terrain.resolution_m} m native pixels. Boulder/crater hazards remain incomplete.`
                : result?.terrain.reason || "Awaiting site assessment."}
            </p>
            {result && result.factors.T.score == null &&
              siteKey(result.mission) !== siteKey(terrainReference) && (
                <button className="text-button" onClick={() => onAddComparison(terrainReference)}>
                  Add Connecting Ridge to comparison <ArrowUpRight size={14} />
                </button>
              )}
          </article>
          {result && (
            <article className="outlook-data glass">
              <span className="eyebrow">WATER ICE POTENTIAL</span>
              <strong>{result.factors.I.score == null ? "Unavailable" : `${result.factors.I.score.toFixed(1)} / 100`}</strong>
              <p>{result.factors.I.explanation}</p>
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
        <button className="text-button" onClick={() => onNavigate(11)}>
          Explore alternative coordinates <ArrowUpRight size={16} />
        </button>
        <span>NASA JPL HORIZONS · LOLA · HISTORICAL DIVINER</span>
      </div>
    </section>
  );
}
