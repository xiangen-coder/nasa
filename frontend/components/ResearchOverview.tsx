"use client";
import { ArrowUpRight, Calculator, CalendarDays, ChevronRight, ClipboardList, Download, Eye, FlaskConical, Layers, Mountain, Orbit, Route, Save, Sun, Thermometer, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import ResearchComparisonReport, { ResearchWindows } from "./ResearchComparisonReport";
import ResearchElevationChart, {
  ResearchVisibilityStatus,
  formatVisibilityTime as utc,
} from "./ResearchElevationChart";
import EnergyOnlyCharts from "./mission-lab/EnergyOnlyCharts";
import EquipmentControls from "./mission-lab/EquipmentControls";
import { solarEnergy, type SolarSettings } from "./mission-lab/scenario-science";
import type { Site } from "../app/types";
import { quickMapSiteUrl } from "../lib/quickmap";
import {
  inComparisonArea,
  siteKey,
  terrainReference,
} from "./ComparisonPicker";

const focusLabels: Record<ResearchPriority, string> = {
  I: "Water-ice potential",
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
const sections = [
  ["Summary", "Mission summary", ClipboardList],
  ["Journey", "Journey", Route],
  ["Visibility", "Visibility", Eye],
  ["Energy", "Energy", Zap],
  ["Terrain", "Terrain", Mountain],
  ["Environment", "Environment", Thermometer],
  ["Sources & limitations", "Sources & limitations", Layers, "result-methods"],
  ["Score calculation", "Score calculation", Calculator, "result-score"],
  ["Save", "Save", Save],
] as const;

const limitationGroups = [
  { title: "Research use only", Icon: FlaskConical, matches: /research ranking|certification|safe-site/i },
  { title: "Visibility model", Icon: Eye, matches: /visibility|eclipses|airless/i },
  { title: "Sampling & time", Icon: CalendarDays, matches: /sampling|UT1|leap seconds/i },
  { title: "Terrain geometry", Icon: Layers, matches: /alignment|horizon rays|subpixel/i },
];

function SectionHeading({ index, subtitle }: { index: number; subtitle?: string }) {
  const [, title, Icon] = sections[index];
  return (
    <div className="result-panel-heading">
      <Icon size={23} aria-hidden="true" />
      <div>
        <h2>{index + 1}. {title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

function openResultSection(id: string) {
  const section = document.querySelector<HTMLElement>(`.research-results #${id}`);
  if (!section) return;
  section.focus({ preventScroll: true });
  const offset = Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
  window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - offset, behavior: "instant" });
}
export default function ResearchOverview({
  result,
  comparisonOrigin,
  comparisonRadiusKm,
  onNavigate,
  onSaveMission,
  onOpenMissionLab,
  missionSaveStatus,
  onRunAgain,
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
  comparisonRadiusKm?: number;
  onNavigate: (view: number) => void;
  onSaveMission: (assessment: Research) => void;
  onOpenMissionLab: (assessment: Research) => void;
  missionSaveStatus?: { status: "saving" | "saved" | "error"; message?: string };
  onRunAgain?: () => void;
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
  const [activeSection, setActiveSection] = useState("result-summary");
  const content = useRef<HTMLDivElement>(null);
  const printReport = useRef<HTMLDivElement>(null);
  const [preparingPdf, setPreparingPdf] = useState(false);

  async function printAssessment() {
    const report = printReport.current;
    if (!report || preparingPdf) return;
    setPreparingPdf(true);
    const disclosures = Array.from(report.querySelectorAll<HTMLDetailsElement>("details:not([open])"));
    disclosures.forEach((details) => { details.open = true; });
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
    } finally {
      disclosures.forEach((details) => { details.open = false; });
      setPreparingPdf(false);
    }
  }
  useEffect(() => {
    const container = content.current;
    if (!result || !container) return;
    const panels = [...container.querySelectorAll<HTMLElement>("section.result-section")].reverse();
    function updateSection() {
      const top = panels[panels.length - 1];
      if (!top) return;
      const offset = (Number.parseFloat(getComputedStyle(top).scrollMarginTop) || 0) + 8;
      const current = panels.find((panel) => panel.getBoundingClientRect().top <= offset);
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      setActiveSection((atEnd ? panels[0] : current ?? top).id);
    }
    updateSection();
    window.addEventListener("scroll", updateSection, { passive: true });
    window.addEventListener("resize", updateSection);
    return () => {
      window.removeEventListener("scroll", updateSection);
      window.removeEventListener("resize", updateSection);
    };
  }, [result]);
  const terrain = result?.terrain;
  const temperature = result?.temperature;
  const shadowScreening = result?.horizon.available
    ? result.horizon.method
    : result?.horizon.reason;
  const observerHeight = result?.observer_height;
  return (
    <section
      className={`research-results${result ? " has-assessment" : ""}`}
      aria-label="Landing assessment overview"
      aria-busy={busy}
    >
      {result && (
        <nav className="result-section-nav" aria-label="Results sections">
          <span className="result-nav-label">Assessment</span>
          {sections.map(([label, , Icon, sectionId]) => {
            const id = sectionId ?? `result-${label.toLowerCase()}`;
            return (
              <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  openResultSection(id);
                }}>
                <Icon size={19} aria-hidden="true" />
                {label}
              </a>
            );
          })}
        </nav>
      )}
      <div ref={content} className="result-content">
      <header className="research-results-heading">
        <div className="result-title-copy">
          <span className="eyebrow">LANDING ASSESSMENT</span>
          <h1>{result?.mission.name || "Mission results"}</h1>
          {result && (
            <p className="result-title-details">
              <span>
                {Math.abs(result.mission.latitude).toFixed(4)}° {result.mission.latitude < 0 ? "S" : "N"} ·{" "}
                {Math.abs(result.mission.longitude).toFixed(4)}° {result.mission.longitude < 0 ? "W" : "E"}
              </span>
              <span>{utc(result.mission.start)} → {utc(result.mission.end)}</span>
            </p>
          )}
        </div>
        <div className="result-title-actions">
          <button type="button" className="button primary new-search" onClick={onNewSearch}>
            New search
          </button>
          {onRunAgain && <button type="button" className="button subtle" onClick={onRunAgain} disabled={busy}>{busy ? "Running again…" : "Run again"}</button>}
          {result && (
            <a className="button subtle" href={quickMapSiteUrl(result.mission)} target="_blank" rel="noreferrer">
              View site in LROC QuickMap <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>
      {result && assessmentError && <p className="error" role="alert">{assessmentError}</p>}
      {result ? (
        <>
          <section id="result-summary" tabIndex={-1} className="result-section">
            <SectionHeading index={0} />
            <p>
              {result.mission.interval_minutes}-minute samples ·{" "}
              {result.geometry.mode === "terrain_screened"
                ? "Terrain screened"
                : result.geometry.mode === "broad_terrain_screened"
                  ? "Broad terrain screening"
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
                      result.horizon.quality === "global"
                        ? "Coarse global horizon"
                        : result.horizon.quality === "regional"
                          ? "Regional horizon"
                          : result.horizon.available ? "Local horizon available" : "Local horizon unavailable",
                      shadowScreening,
                    ]
                  : null,
                result.horizon.quality && result.horizon.sampled_relief_m != null
                  ? ["Surrounding terrain relief", value(result.horizon.sampled_relief_m, " m"),
                      "Elevation range along the sampled 20 km rays. Landing-footprint terrain is assessed separately."]
                  : null,
                temperature?.available
                  ? ["Historical temperature range", `${value(temperature.minimum_k, " K")} to ${value(temperature.maximum_k, " K")}`,
                      [temperature.source?.name, temperature.source?.observation_period, temperature.source?.quality].filter(Boolean).join(" · ")]
                  : null,
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
            <SectionHeading index={1} subtitle="Earth to Moon" />
            <PortableJourney target={result.mission} animate={animate} />
          </section>
          <section
            id="result-visibility"
            tabIndex={-1}
            className="result-section"
          >
            <SectionHeading index={2} subtitle="Sun, Earth & mission time" />
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
            <SectionHeading index={3} subtitle="Estimated solar energy" />
            <div className="result-energy-grid">
              <EquipmentControls value={equipment} onChange={onEquipmentChange} />
              <div className="result-energy-chart">
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
                    : result.geometry.mode === "broad_terrain_screened"
                      ? "Output uses broad terrain screening. Smaller shadows are unresolved."
                      : "The estimate uses reference geometry. Local terrain shadows could reduce output."}
                </p>
              </aside>
            </div>
          </section>
          <section id="result-terrain" tabIndex={-1} className="result-section">
            <SectionHeading index={4} />
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
                {terrain?.regional_score != null && (
                  <p>
                    <strong>{terrain.regional_score.toFixed(1)} / 100 regional slope score</strong>
                    {" · "}{value(terrain.resolution_m, " m")} pixels · {value(terrain.radius_m, " m")} radius.
                    The score uses the 95th-percentile slope and sits outside the overall landing score.
                  </p>
                )}
                {terrain?.regional_score != null && terrain.slope_p95_deg != null &&
                  result.limits?.max_slope_deg != null && terrain.slope_p95_deg > result.limits.max_slope_deg && (
                    <p>
                      The regional 95th-percentile slope ({terrain.slope_p95_deg.toFixed(1)}°)
                      exceeds the {result.limits.max_slope_deg}° scoring cutoff, so the regional score is 0 / 100.
                    </p>
                  )}
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
                  <a href={terrain.source.source_url}>{terrain.source.name || "Elevation dataset"}</a>
                )}
                {result.factors.T?.quality === "preliminary Kaguya screening" && <p>{terrain?.source?.quality}</p>}
                {result.factors.T?.score == null &&
                  inComparisonArea(comparisonOrigin, terrainReference, comparisonRadiusKm) &&
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
            <div className="result-terrain-evidence"><ResearchTerrainDetails result={result} /></div>
          </section>
          <section
            id="result-environment"
            tabIndex={-1}
            className="result-section"
          >
            <SectionHeading index={5} />
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
                    {result.factors.I?.quality === "psr_pixel"
                      ? result.ice?.value === 1 ? "Mapped shadow at selected pixel" : "Outside mapped shadow at selected pixel"
                      : value(
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
          <section id="result-methods" tabIndex={-1} className="result-section">
            <SectionHeading index={6} subtitle="Data used in this assessment and the limits of interpretation." />
            <h3>Data sources</h3>
            <div className="result-source-grid">
              <article>
                <h4><Orbit aria-hidden="true" /> JPL Horizons</h4>
                <p>Sun &amp; Earth positions.</p>
                {Object.entries(result.geometry.sources ?? {}).map(([body, source]) => (
                  <p className="result-source-meta" key={body}>
                    {body === "sun" ? "Sun" : "Earth"} · {source.ephemeris} · {source.orientation}
                  </p>
                ))}
              </article>
              <article>
                <h4><Mountain aria-hidden="true" /> LOLA</h4>
                <p>Elevation &amp; terrain screening where map coverage is complete.</p>
              </article>
              <article>
                <h4><Thermometer aria-hidden="true" /> Diviner</h4>
                <p>Historical surface temperatures.</p>
              </article>
            </div>
            <h3>Limitations</h3>
            <div className="result-limitation-grid">
              {limitationGroups.map(({ title, Icon, matches }) => {
                const items = result.limitations.filter((item) => limitationGroups.find((group) => group.matches.test(item))?.matches === matches);
                return (
                  <article key={title}>
                    <h4><Icon aria-hidden="true" /> {title}</h4>
                    {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>Unavailable for this assessment.</p>}
                  </article>
                );
              })}
            </div>
            {result.limitations.filter((item) => !limitationGroups.some(({ matches }) => matches.test(item))).map((item) => <p key={item}>{item}</p>)}
          </section>
          <section id="result-score" tabIndex={-1} className="result-section">
            <SectionHeading index={7} />
            <p>
              The score adds each available factor score multiplied by its used weight.
              The model scales the available weights to total 100% and requires both
              sunlight and Earth visibility to calculate an overall score.
              Compare sites with similar evidence coverage.
            </p>
            <div className="table-scroll result-score-table" role="region" aria-label="Research score table" tabIndex={0}>
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
                        <details className="result-factor-details">
                          <summary>View details <ChevronRight size={13} aria-hidden="true" /></summary>
                          <p>{factor.explanation}</p>
                          {factor.source?.source_url && (
                            <a href={factor.source.source_url}>{factor.source.name || "Dataset source"}</a>
                          )}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section id="result-save" tabIndex={-1} className="result-section">
            <SectionHeading index={8} />
            <div className="account-actions">
              <button className="button subtle" onClick={() => onNavigate(11)}>
                Back to comparison
              </button>
              <button
                className="button primary"
                disabled={missionSaveStatus?.status === "saving" || missionSaveStatus?.status === "saved"}
                onClick={() => onSaveMission(result)}
              >
                {missionSaveStatus?.status === "saving" ? "Saving result…" : missionSaveStatus?.status === "saved" ? "Result saved" : "Save result"}
              </button>
              <button className="button subtle" onClick={() => onOpenMissionLab(result)}>Open in Mission Planner</button>
              <button className="button subtle" disabled={preparingPdf} onClick={() => void printAssessment()}>
                {preparingPdf ? "Preparing PDF…" : "Save as PDF"} <Download size={15} aria-hidden="true" />
              </button>
              {missionSaveStatus?.status === "saved" && (
                <button className="button subtle" onClick={() => onNavigate(13)}>
                  Go to saved searches
                </button>
              )}
            </div>
            {missionSaveStatus?.status === "saved" && <p role="status">Result saved to your account.</p>}
            {missionSaveStatus?.status === "error" && <p className="error" role="alert">{missionSaveStatus.message}</p>}
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
      </div>
      {result && (
        <div className="assessment-print-report" ref={printReport} aria-hidden="true" inert>
          <ResearchComparisonReport
            singleMission
            mission={result.mission}
            alternatives={[]}
            comparison={{ results: [result], candidates: [], busy: false, progress: "", error: "", failures: {} }}
            scenarios={[]}
            evidenceSite=""
            onEvidenceSiteChange={() => {}}
            onInspect={() => {}}
            equipment={equipment}
          />
        </div>
      )}
    </section>
  );
}
