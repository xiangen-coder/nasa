"use client";
import { ArrowUpRight, Sun } from "lucide-react";
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
import type { ResearchPriority } from "./SearchConsole";
import ResearchTerrainDetails from "./ResearchTerrainDetails";
import WaterEvidence from "./WaterEvidence";
import { PortableJourney } from "./PortableLunar";
import { ResearchWindows } from "./ResearchComparisonReport";
import ResearchElevationChart, {
  ResearchVisibilityStatus,
  formatVisibilityTime as utc,
} from "./ResearchElevationChart";
import EnergyOnlyCharts from "./mission-lab/EnergyOnlyCharts";
import EquipmentControls from "./mission-lab/EquipmentControls";
import { solarEnergy, type SolarSettings } from "./mission-lab/scenario-science";
import type { Site } from "../app/types";
import {
  inComparisonArea,
  siteKey,
  terrainReference,
} from "./ComparisonPicker";

const focusLabels: Record<ResearchPriority, string> = {
  overall: "Overall consideration",
  T: "Terrain safety",
  S: "Sunlight availability",
  C: "Earth communication",
};
const factorLabels: Record<string, string> = {
  T: "Terrain",
  S: "Sunlight",
  C: "Earth communication",
  H: "Temperature",
  I: "Water ice evidence",
};
function openResultSection(id: string) {
  const section = document.querySelector<HTMLElement>(`.research-results #${id}`);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({ block: "start" });
}
export default function ResearchOverview({
  result,
  comparisonOrigin,
  onNavigate,
  onAddComparison,
  onNewSearch,
  equipment,
  onEquipmentChange,
  priority,
  animate,
  assessmentError,
  busy = false,
}: {
  result: Research | null;
  comparisonOrigin: Site;
  onNavigate: (view: number) => void;
  onAddComparison: (site: Site) => void;
  onNewSearch: () => void;
  equipment: SolarSettings;
  onEquipmentChange: (equipment: SolarSettings) => void;
  priority: ResearchPriority;
  animate: boolean;
  assessmentError?: string;
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
  const metrics = result?.geometry.metrics;
  const energy =
    result && rows.length > 1
      ? solarEnergy({ mission: result.mission, series: rows }, equipment)
      : null;
  const value = (number: number | null | undefined, unit: string) =>
    number == null ? "Unavailable" : `${number.toFixed(1)}${unit}`;
  const sections = [
    "Summary",
    "Journey",
    "Visibility",
    "Energy",
    "Terrain",
    "Environment",
    "Comparison",
    "Methods",
  ];
  const terrain = result?.terrain;
  const temperature = result?.temperature;
  const shadowScreening = result?.horizon.available
    ? result.horizon.method
    : result?.horizon.reason;
  const observerHeight = result?.observer_height;
  return (
    <section
      className="research-results"
      aria-label="Landing assessment overview"
      aria-busy={busy}
    >
      <header className="research-results-heading">
        <div>
          <span className="eyebrow">LANDING ASSESSMENT</span>
          <h1>{result?.mission.name || "Mission results"}</h1>
          {result && (
            <p>
              {Math.abs(result.mission.latitude).toFixed(4)}°{" "}
              {result.mission.latitude < 0 ? "S" : "N"} ·{" "}
              {Math.abs(result.mission.longitude).toFixed(4)}°{" "}
              {result.mission.longitude < 0 ? "W" : "E"}
            </p>
          )}
        </div>
        <button
          type="button"
          className="button primary new-search"
          onClick={onNewSearch}
        >
          New search
        </button>
      </header>
      {result ? (
        <>
          <nav className="result-section-nav" aria-label="Results sections">
            {sections.map((label) => {
              const id = `result-${label.toLowerCase()}`;
              return (
                <a
                  key={id}
                  className="button subtle"
                  href={`#${id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    openResultSection(id);
                  }}
                >
                  {label}
                </a>
              );
            })}
          </nav>
          <section id="result-summary" tabIndex={-1} className="result-section">
            <h2>Mission summary</h2>
            <p>
              {utc(result.mission.start)} → {utc(result.mission.end)} UTC ·{" "}
              {result.mission.interval_minutes}-minute samples ·{" "}
              {result.geometry.mode === "terrain_screened"
                ? "Terrain screened"
                : result.geometry.available
                  ? "Reference geometry"
                  : "Geometry unavailable"}
            </p>
            <div className="result-metric-grid">
              {[
                ["Assessment focus", focusLabels[priority]],
                [
                  "Research suitability score",
                  result.score == null ? "Unavailable" : `${result.score.toFixed(2)} / 100`,
                  result.score != null && result.provisional ? "Provisional" : undefined,
                ],
                [
                  "Scoring evidence",
                  `${(result.available_weight * 100).toFixed(0)}% of nominal weight`,
                  result.missing.length > 0
                    ? `Missing ${result.missing.map((key) => factorLabels[key] ?? key).join(", ")}`
                    : undefined,
                ],
                [
                  "Landing safety",
                  result.constraints_failed.length ? "Configured limits exceeded" : "Not established",
                ],
                terrain?.radius_m != null
                  ? ["Terrain sampling radius", value(terrain.radius_m, " m")]
                  : null,
                observerHeight?.available &&
                observerHeight.value != null &&
                terrain?.elevation_m !== observerHeight.value
                  ? [
                      observerHeight.coverage_type === "global"
                        ? "Approximate site elevation"
                        : "Observer elevation used for visibility",
                      value(observerHeight.value, " m"),
                      observerHeight.source?.name,
                    ]
                  : null,
                shadowScreening
                  ? [
                      "Terrain shadow screening",
                      result.horizon.available ? "Local horizon available" : "Local horizon unavailable",
                      shadowScreening,
                    ]
                  : null,
                temperature?.source?.observation_period
                  ? ["Temperature observation period", temperature.source.observation_period]
                  : null,
                [
                  "Sunlight availability",
                  value(result.factors.S?.score, "%"),
                  result.geometry.sunlight_hours != null
                    ? `${value(result.geometry.sunlight_hours, " h")} of sunlight during the mission window.`
                    : "Share of the mission window with the Sun above the applicable horizon.",
                ],
                [
                  "Earth visibility",
                  value(result.factors.C?.score, "%"),
                  "Share with direct Earth geometry above the configured clearance.",
                ],
                [
                  "Simultaneous visibility",
                  value(metrics?.simultaneous_pct, "%"),
                  "Share with both sunlight and Earth visibility.",
                ],
                [
                  "Longest darkness",
                  value(metrics?.longest_darkness_hours, " h"),
                  "Longest continuous interval without direct sunlight.",
                ],
                [
                  "Longest Earth outage",
                  value(metrics?.longest_blackout_hours, " h"),
                  "Longest continuous interval below the Earth visibility threshold.",
                ],
                [
                  "Estimated solar energy",
                  value(energy?.total_kwh, " kWh"),
                  "Panel output over the mission window using the assumptions in Energy.",
                ],
              ].map((metric) => {
                if (!metric) return null;
                const [label, reading, explanation] = metric;
                return (
                  <article key={label}>
                    <h3>{label}</h3>
                    <strong>{reading}</strong>
                    {explanation && <p>{explanation}</p>}
                  </article>
                );
              })}
            </div>
            {[...new Set([...result.constraints_failed, ...result.warnings])].map((message) => (
              <p key={message}>{message}</p>
            ))}
          </section>
          <section id="result-journey" tabIndex={-1} className="result-section">
            <PortableJourney target={result.mission} animate={animate} />
          </section>
          <section
            id="result-visibility"
            tabIndex={-1}
            className="result-section"
          >
            <h2>Sun, Earth &amp; mission time</h2>
            <div className="research-result-columns">
              <div>
                {rows.length > 0 ? (
                  <>
                    {result && (
                      <ResearchElevationChart
                        result={result}
                        selectedTime={sample?.time}
                      />
                    )}
                    {sample && (
                      <div className="research-timeline">
                        <div className="account-actions">
                          <button
                            type="button"
                            className="button subtle"
                            disabled={rows.length < 2}
                            onClick={() => {
                              if (!canPlay) setCursor(0);
                              setPlaying(!(playing && canPlay));
                            }}
                          >
                            {playing && canPlay
                              ? "Pause timeline"
                              : "Play timeline"}
                          </button>
                          <button
                            type="button"
                            className="button subtle"
                            onClick={() => {
                              setPlaying(false);
                              setCursor(0);
                            }}
                          >
                            Reset timeline
                          </button>
                          <label>
                            Playback step{" "}
                            <select
                              value={step}
                              onChange={(e) => setStep(Number(e.target.value))}
                            >
                              <option value={1}>1 sample</option>
                              <option value={3}>3 samples</option>
                              <option value={6}>6 samples</option>
                            </select>
                          </label>
                        </div>
                        <label>
                          Mission time · {utc(sample.time)} UTC
                          <input
                            type="range"
                            min={0}
                            max={rows.length - 1}
                            value={Math.min(cursor, rows.length - 1)}
                            aria-label="Mission time"
                            aria-valuetext={`${utc(sample.time)} UTC`}
                            onChange={(event) => {
                              setPlaying(false);
                              setCursor(Number(event.target.value));
                            }}
                          />
                        </label>
                        <p>
                          Sun {sample.sun_azimuth.toFixed(2)}° az /{" "}
                          {sample.sun_elevation.toFixed(2)}° el ·{" "}
                          {sample.sun_visible ? "visible" : "below threshold"}
                        </p>
                        <p>
                          Earth {sample.earth_azimuth.toFixed(2)}° az /{" "}
                          {sample.earth_elevation.toFixed(2)}° el ·{" "}
                          {sample.earth_visible ? "visible" : "below threshold"}
                        </p>
                        <p>
                          Earth range {value(sample.earth_distance_km, " km")} ·{" "}
                          One-way light time {sample.earth_light_time_seconds == null
                            ? "Unavailable"
                            : `${sample.earth_light_time_seconds.toFixed(3)} s`}
                        </p>
                        {sample.sun_horizon_deg != null &&
                          sample.earth_horizon_deg != null && (
                            <p>
                              Terrain threshold at this sample: Sun{" "}
                              {sample.sun_horizon_deg.toFixed(2)}° · Earth{" "}
                              {sample.earth_horizon_deg.toFixed(2)}° including
                              clearance
                            </p>
                          )}
                      </div>
                    )}
                    {!!result?.horizon.profile?.length && sample && (
                      <details className="research-skyline">
                        <summary>Terrain skyline by azimuth</summary>
                        <div
                          className="outlook-chart"
                          role="img"
                          aria-label="Terrain skyline elevation by azimuth with the current Sun and Earth directions"
                        >
                          <ResponsiveContainer
                            width="100%"
                            height="100%"
                            initialDimension={{ width: 640, height: 250 }}
                          >
                            <LineChart
                              data={[
                                ...result.horizon.profile,
                                {
                                  azimuth: 360,
                                  elevation:
                                    result.horizon.profile[0].elevation,
                                },
                              ]}
                            >
                              <XAxis
                                dataKey="azimuth"
                                type="number"
                                domain={[0, 360]}
                                ticks={[0, 90, 180, 270, 360]}
                                unit="°"
                              />
                              <YAxis unit="°" />
                              <Tooltip
                                labelFormatter={(value) => `Azimuth ${value}°`}
                                formatter={(value: number) =>
                                  `${value.toFixed(2)}°`
                                }
                              />
                              <Line
                                dataKey="elevation"
                                name="Skyline elevation"
                                stroke="#b5c7df"
                                dot={false}
                                isAnimationActive={false}
                              />
                              <ReferenceLine
                                x={sample.sun_azimuth}
                                stroke="#eacb89"
                              />
                              <ReferenceLine
                                x={sample.earth_azimuth}
                                stroke="#9ecff2"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <p>
                          The horizontal axis is compass direction, measured
                          clockwise from north. The curve shows the highest
                          terrain angle in each direction within 20 km. The gold
                          and blue markers show where the Sun and Earth are
                          along that skyline at the selected time. Compare each
                          body’s elevation above with the skyline at its marker.
                        </p>
                      </details>
                    )}
                    {result && (
                      <ResearchVisibilityStatus
                        rows={rows}
                        interval={result.mission.interval_minutes}
                      />
                    )}
                  </>
                ) : (
                  <div className="outlook-chart-empty" role="status">
                    <Sun size={30} strokeWidth={1} />
                    <h3>
                      {busy
                        ? "Reading the sky…"
                        : "A window into your mission."}
                    </h3>
                    <p>
                      {result?.geometry.reason ||
                        "The chart appears after an assessment. No sample positions or default percentages are substituted."}
                    </p>
                  </div>
                )}
                <button className="text-button" onClick={() => openResultSection("result-journey")}>
                  View this site in Lunar Journey <ArrowUpRight size={14} />
                </button>
              </div>
              <aside aria-label="Interpreting visibility">
                <h3>Visibility windows</h3>
                <p>
                  The times below group consecutive samples with the same
                  visibility. Transitions can occur between samples.
                </p>
                <ResearchWindows result={result} />
                <p>
                  Earth visibility describes a direct line of sight. Radio
                  contact also depends on the antenna, receiver and ground
                  station.
                </p>
              </aside>
            </div>
          </section>
          <section id="result-energy" tabIndex={-1} className="result-section">
            <h2>Estimated solar energy</h2>
            <div className="research-result-columns">
              <div>
                <EquipmentControls value={equipment} onChange={onEquipmentChange} />
                {energy ? (
                  <EnergyOnlyCharts analysis={result} energy={energy} />
                ) : (
                  <p>
                    Sunlight samples are unavailable for an energy estimate.
                  </p>
                )}
              </div>
              <aside role="region" aria-label="Estimated solar generation">
                <h3>Energy for this window</h3>
                <strong>{value(energy?.total_kwh, " kWh")}</strong>
                <p>
                  Estimated electrical energy at the panels. Changing the
                  equipment settings recalculates this estimate.
                </p>
                {energy && (
                  <p>
                    Average output {value((energy.daily_kwh * 1000) / 24, " W")}{" "}
                    · Peak sampled output{" "}
                    {value(
                      Math.max(
                        ...energy.samples.map((sample) => sample.power_w),
                      ),
                      " W",
                    )}
                  </p>
                )}
                {equipment.demand_enabled && (
                  <>
                    <strong>{value(energy?.unmet_kwh, " kWh")}</strong>
                    <p>Equipment demand the model could not serve.</p>
                  </>
                )}
                <p>
                  {result.geometry.mode === "terrain_screened"
                    ? "Output uses terrain-screened sunlight."
                    : "The estimate uses reference geometry. Local terrain shadows could reduce output."}
                </p>
              </aside>
            </div>
          </section>
          <section id="result-terrain" tabIndex={-1} className="result-section">
            <h2>Terrain</h2>
            <div className="research-result-columns">
              <dl className="research-report-settings">
                <div>
                  <dt>Elevation</dt>
                  <dd>{value(terrain?.elevation_m, " m")}</dd>
                </div>
                <div>
                  <dt>95th-percentile slope</dt>
                  <dd>{value(terrain?.slope_p95_deg, "°")}</dd>
                </div>
                <div>
                  <dt>Maximum slope</dt>
                  <dd>{value(terrain?.slope_max_deg, "°")}</dd>
                </div>
                <div>
                  <dt>Roughness</dt>
                  <dd>{value(terrain?.roughness_m, " m")}</dd>
                </div>
                <div>
                  <dt>Relief</dt>
                  <dd>{value(terrain?.relief_m, " m")}</dd>
                </div>
                <div>
                  <dt>Elevation map pixel spacing</dt>
                  <dd>{value(terrain?.resolution_m, " m")}</dd>
                </div>
              </dl>
              <aside aria-label="Interpreting terrain measurements">
                <h3>What the measurements show</h3>
                <p>
                  Most sampled slopes are at or below the 95th-percentile slope.
                  Maximum slope highlights the steepest sampled ground.
                  Roughness describes height variation after removing the local
                  slope, and relief is the highest-to-lowest elevation
                  difference.
                </p>
                <p>
                  {terrain?.available
                    ? "Boulders and crater hazards finer than the elevation data remain unresolved."
                    : result.factors.T?.explanation || terrain?.reason}
                </p>
                {terrain?.source?.source_url && (
                  <a href={terrain.source.source_url}>Elevation dataset</a>
                )}
                {result.factors.T?.score == null &&
                  inComparisonArea(comparisonOrigin, terrainReference) &&
                  siteKey(result.mission) !== siteKey(terrainReference) && (
                    <button
                      className="text-button"
                      onClick={() => onAddComparison(terrainReference)}
                    >
                      Add Connecting Ridge to comparison
                    </button>
                  )}
              </aside>
            </div>
            <ResearchTerrainDetails result={result} />
          </section>
          <section
            id="result-environment"
            tabIndex={-1}
            className="result-section"
          >
            <h2>Environment</h2>
            <div className="research-result-columns">
              <dl className="research-report-settings">
                <div>
                  <dt>Historical minimum surface temperature</dt>
                  <dd>{value(temperature?.minimum_k, " K")}</dd>
                </div>
                <div>
                  <dt>Historical maximum surface temperature</dt>
                  <dd>{value(temperature?.maximum_k, " K")}</dd>
                </div>
                <div>
                  <dt>Mapped permanent shadow{result.ice?.radius_m ? ` within ${result.ice.radius_m.toLocaleString("en-GB")} m` : ""}</dt>
                  <dd>
                    {value(
                      result.ice?.radius_m && result.ice.value != null
                        ? result.ice.value * 100
                        : null,
                      "%",
                    )}
                  </dd>
                </div>
              </dl>
              <aside aria-label="Interpreting environmental measurements">
                <h3>What the measurements show</h3>
                <p>
                  Diviner temperatures describe the observed lunar surface.
                  Predicting temperatures during this mission or inside the
                  lander requires a thermal model.
                </p>
                <p>{result.factors.I?.explanation}</p>
                {result.factors.I?.source?.source_url && (
                  <a href={result.factors.I.source.source_url}>
                    Permanent-shadow or ice dataset
                  </a>
                )}
              </aside>
            </div>
            <WaterEvidence location={result.mission} />
          </section>
          <section
            id="result-comparison"
            tabIndex={-1}
            className="result-section"
          >
            <h2>Comparison</h2>
            <div className="account-actions">
              <button
                className="button subtle"
                onClick={() => onAddComparison(result.mission)}
              >
                Show this point in comparison
              </button>
              <button className="button primary" onClick={() => onNavigate(15)}>
                Open mission report
              </button>
            </div>
          </section>
          <section id="result-methods" tabIndex={-1} className="result-section">
            <h2>Methods, sources &amp; limitations</h2>
            <div className="research-result-columns">
              <div>
                <p>
                  JPL Horizons provides the sampled Sun and Earth positions.
                  LOLA elevation maps support terrain screening where coverage
                  is complete. Diviner provides historical surface temperatures.
                </p>
                {Object.entries(result.geometry.sources ?? {}).map(
                  ([body, source]) => (
                    <p key={body}>
                      {body === "sun" ? "Sun" : "Earth"} · {source.ephemeris} ·{" "}
                      {source.orientation}
                    </p>
                  ),
                )}
                <button className="text-button" onClick={() => onNavigate(0)}>
                  Open map for research thresholds and saved points <ArrowUpRight size={14} />
                </button>
              </div>
              <aside aria-label="Assessment limitations">
                <h3>Limitations</h3>
                <ul>
                  {result.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </aside>
            </div>
            <h3>Five-factor score calculation</h3>
            <p>
              The score adds each available factor score multiplied by its used weight.
              The model scales the available weights to total 100% and requires both
              sunlight and Earth visibility to calculate an overall score.
              Compare sites with similar evidence coverage.
            </p>
            <div className="table-scroll">
              <table aria-label="Research score factors">
                <thead>
                  <tr>
                    <th scope="col">Factor</th>
                    <th scope="col">Factor score / 100</th>
                    <th scope="col">Nominal weight</th>
                    <th scope="col">Used weight</th>
                    <th scope="col">Contribution</th>
                    <th scope="col">Evidence quality</th>
                    <th scope="col">Method and source</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.factors).map(([key, factor]) => (
                    <tr key={key}>
                      <th scope="row">{factorLabels[key] ?? factor.name}</th>
                      <td>{value(factor.score, "")}</td>
                      <td>{value(factor.weight == null ? null : factor.weight * 100, "%")}</td>
                      <td>{value(factor.effective_weight == null ? null : factor.effective_weight * 100, "%")}</td>
                      <td>{value(factor.contribution, " points")}</td>
                      <td>{factor.quality}</td>
                      <td>
                        {factor.explanation}
                        {factor.source?.source_url && (
                          <> <a href={factor.source.source_url}>{factor.source.name || "Dataset source"}</a></>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="result-section" role="status">
          <h2>
            {busy
              ? "Assessment in progress"
              : "Choose a landing point and mission window"}
          </h2>
          <p>
            {busy
              ? "Reading ephemerides and available terrain data."
              : "Run a search to see your mission summary, graphs and terrain evidence here."}
          </p>
          {assessmentError && <p className="error" role="alert">{assessmentError}</p>}
        </div>
      )}
    </section>
  );
}
