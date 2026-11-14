"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { CalculationDetails, Uncertainty } from "../components/ResultExplanation";
import NewsSidebar from "../components/NewsSidebar";
import LandingResearch, { type Research, type ResearchActions, type ResearchComparison } from "../components/LandingResearch";
import { missionKey, sameMission, type PlanBForecast } from "../lib/plan-b";
import type { ResearchPriority } from "../components/SearchConsole";
import AboutLunar from "../components/AboutLunar";
import LandingSearch from "../components/LandingSearch";
import Navigation, {viewPaths} from "../components/Navigation";
import PreferencesControls, {type Preferences} from "../components/Preferences";
import PowerMissionLab from "../components/PowerMissionLab";
import { adaptAssessment, type LabSource } from "../lib/mission-power";
import ResearchOverview from "../components/ResearchOverview";
import { PortableEducation, PortableJourney } from "../components/PortableLunar";
import PreliminaryComparison from "../components/PreliminaryComparison";
import ComparisonPicker, { inComparisonArea, siteKey } from "../components/ComparisonPicker";
import type { ResearchArea, ResearchAreaResult } from "../lib/research-area";
import { accountApi, AccountApiError } from "../lib/account-api";
import type { MissionSnapshot } from "../lib/saved-mission";
import type { SearchRecord } from "../lib/search-record";
import { referenceSites } from "../lib/reference-sites";
const Account = dynamic(() => import("../components/Account"));
const MissionLab = dynamic(() => import("../components/mission-lab/MissionLab"));

import TerrainAssessment from "../components/TerrainAssessment";
import ResearchComparisonReport from "../components/ResearchComparisonReport";
import { defaultSolar } from "../components/mission-lab/scenario-science";
import {AlternativeCards} from "../components/AssessmentOverview";
const CinematicHero = dynamic(() => import("../components/CinematicHero"), { ssr: false });
const AstronomySimulation = dynamic(() => import("../components/AstronomySimulation"), { ssr: false, loading: () => <div className="panel empty">Loading astronomical simulation…</div> });
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Earth,
  ExternalLink,
  Layers,
  MapPin,
  Maximize2,
  Moon,
  Pause,
  Play,
  Radio,
  Satellite,
  SlidersHorizontal,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { Site, Mission, MissionCatalogEntry, Analysis, Comparison } from "./types";
const views = [
  "Map explorer",
  "Horizon simulator",
  "Terrain analysis",
  "Site comparison",
  "Lunar mission archive",
  "3D observatory",
];

const fmt = (x: number | null | undefined, suffix = "", digits = 1) =>
  x == null ? "Unavailable" : `${x.toFixed(digits)}${suffix}`;
const utc = (time: string) =>
  new Date(time).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail
                .map(
                  (issue: { msg: string; loc: (string | number)[] }) =>
                    `${issue.loc.filter((x) => x !== "body").join(".") || "Mission"}: ${issue.msg.replace(/^Value error, /, "")}`,
                )
                .join("; ")
            : "Scientific service unavailable.";
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

function PolarMap({
  sites,
  selected,
  onSelect,
}: {
  sites: Site[];
  selected: Site;
  onSelect: (s: Site) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  // Stabilize SVG-only pixels across server/browser math libraries; scientific coordinates stay unchanged.
  const pixel = (n: number) => Number(n.toFixed(6));
  const project = (lat: number, lon: number) => {
    const r =
      (250 * Math.tan(((90 + lat) * Math.PI) / 360)) /
      Math.tan((5 * Math.PI) / 180);
    return {
      x: pixel(320 + r * Math.sin((lon * Math.PI) / 180)),
      y: pixel(300 - r * Math.cos((lon * Math.PI) / 180)),
    };
  };
  const point = project(selected.latitude, selected.longitude);
  const [inspected, setInspected] = useState<Site | null>(null);
  const detail = inspected || selected;
  const theta = ((detail.longitude % 360) + 360) % 360;
  const rho = 2 * 1737.4 * Math.tan((90 + detail.latitude) * Math.PI / 360);
  return (
    <div className="map-shell">
      <div className="polar-definition">
        <strong>South-pole polar map</strong>
        <p>Centre: 90° S. Radius r is stereographic distance from the pole (km); rings show angular distance 2°, 4°, 6°, 8°, 10°. θ is east longitude: 0° at top, increasing clockwise to 360° = 0°.</p><p>Ring radii: 2° ≈ 61 km; 4° ≈ 121 km; 6° ≈ 182 km; 8° ≈ 243 km; 10° ≈ 304 km.</p>
      </div>
      <div className="map-overlay">
        <span className="tag">
          <span className="live-dot" /> SOUTH POLAR REGION
        </span>
        <span className="map-subtitle">
          Lunar stereographic coordinate explorer
        </span>
      </div>
      <svg
        role="application"
        aria-label="Interactive lunar south pole coordinate map. Click to select a location. Use coordinate inputs for keyboard selection."
        className="polar-map"
        viewBox="0 0 640 600"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            panX: pan.x,
            panY: pan.y,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const d = drag.current;
          const scale = 640 / e.currentTarget.getBoundingClientRect().width;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
          if (d.moved)
            setPan({
              x: d.panX + (e.clientX - d.x) * scale,
              y: d.panY + (e.clientY - d.y) * scale,
            });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const matrix = e.currentTarget.getScreenCTM();
          if (!matrix) return;
          const svgPoint = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            matrix.inverse(),
          );
          const x = (svgPoint.x - 320 - pan.x) / zoom;
          const y = (svgPoint.y - 300 - pan.y) / zoom;
          const r = Math.hypot(x, y);
          if (r > 250) return;
          onSelect({
            name: "Custom polar site",
            latitude:
              -90 +
              (360 / Math.PI) *
                Math.atan((r / 250) * Math.tan((5 * Math.PI) / 180)),
            longitude: (Math.atan2(x, -y) * 180) / Math.PI,
          });
        }}
      >
        <defs>
          <radialGradient id="moon">
            <stop offset="0" stopColor="#34403d" />
            <stop offset=".65" stopColor="#222d2d" />
            <stop offset="1" stopColor="#141e21" />
          </radialGradient>
          <radialGradient id="glow">
            <stop stopColor="#d5ef9f" stopOpacity=".16" />
            <stop offset="1" stopColor="#d5ef9f" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          transform={`translate(${320 + pan.x} ${300 + pan.y}) scale(${zoom}) translate(-320 -300)`}
        >
          <circle
            cx="320"
            cy="300"
            r="252"
            fill="url(#moon)"
            stroke="#52615b"
            strokeWidth=".6"
          />
          {[-80, -82, -84, -86, -88].map((lat) => {
            const r =
              (250 * Math.tan(((90 + lat) * Math.PI) / 360)) /
              Math.tan((5 * Math.PI) / 180);
            return (
              <g key={lat}>
                <circle
                  cx="320"
                  cy="300"
                  r={pixel(r)}
                  fill="none"
                  stroke="#9aa99b"
                  strokeOpacity=".22"
                  strokeDasharray="2 5"
                />
                <text x={pixel(320+r*0.15)} y={pixel(300+r*0.85)} fill="#829185" fontSize="16">
                  {90+lat}°
                </text>
              </g>
            );
          })}
          {Array.from({ length: 12 }, (_, i) => i * 30).map((lon) => {
            const p = project(-80, lon);
            return (
              <g key={lon}>
                <line
                  x1="320"
                  y1="300"
                  x2={p.x}
                  y2={p.y}
                  stroke="#9aa99b"
                  strokeOpacity=".15"
                />
                <text
                  x={pixel(320 + (p.x - 320) * 1.065)}
                  y={pixel(303 + (p.y - 300) * 1.065)}
                  textAnchor="middle"
                  fill="#8f9d91"
                  fontSize="16"
                >
                  {lon}°
                </text>
              </g>
            );
          })}
          <path d="M310 300h20M320 290v20" stroke="#a0af9c" strokeWidth=".6" />
          <text x="130" y="320" fill="#b5c1ac" fontSize="16">
            SOUTH POLE
          </text>
          {sites.map((s, i) => {
            const p = project(s.latitude, s.longitude);
            return (
              <g
                key={s.id}
                onFocus={() => setInspected(s)}
                onMouseEnter={() => setInspected(s)}
                onMouseLeave={() => setInspected(null)}
                onBlur={() => setInspected(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(s);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Select ${s.name}; polar radius ${(2*1737.4*Math.tan((90+s.latitude)*Math.PI/360)).toFixed(2)} km; east longitude ${((s.longitude+360)%360).toFixed(2)} degrees; uncertainty not supplied`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s);
                  }
                }}
                className="map-pin"
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="7"
                  fill="#182627"
                  stroke="#bcc5b4"
                />
                <text
                  x={p.x}
                  y={p.y + 3}
                  fill="#d7dfcc"
                  fontSize="16"
                  textAnchor="middle"
                >
                  {i + 1}
                </text>
                <text
                  x={390}
                  y={380 + i * 28}
                  fill="#d0dac5"
                  fontSize="16"
                >
                  {i+1}. {s.name.replace(" vicinity", "").replace(" reference", "")}
                </text>
              </g>
            );
          })}
          {selected.latitude <= -80 && (
            <g pointerEvents="none">
              <circle cx={point.x} cy={point.y} r="45" fill="url(#glow)" />
              <circle
                cx={point.x}
                cy={point.y}
                r="15"
                fill="none"
                stroke="#c9ea99"
                strokeDasharray="3 3"
              />
              <circle cx={point.x} cy={point.y} r="4" fill="#d5f4a7" />
            </g>
          )}
        </g>
      </svg>
      <div className="polar-detail" aria-live="polite">
        <strong>{detail.name}</strong>
        <p>{detail.latitude <= -80 ? `r = ${rho.toFixed(2)} km; θ = ${theta.toFixed(2)}° E` : "Outside the displayed 80°–90° S region"} · latitude {detail.latitude.toFixed(4)}°, longitude {detail.longitude.toFixed(4)}° E.</p>
        <p>Coordinate uncertainty not supplied. Overlapping sites remain individually selectable in the location list.</p>
        <details><summary>Polar scale and coordinate method</summary><p>r = 2R tan((90° + latitude)/2), R = 1737.4 km. Domain: 0–{(2*1737.4*Math.tan(5*Math.PI/180)).toFixed(2)} km. Screen radius = 250 × r / outer radius. This projection distance is not surface travel distance. θ is undefined exactly at the pole; the entered longitude is retained. Signed east longitude −180°…180° is normalized to 0°…360°. No Cartesian source conversion is needed.</p></details>
      </div>
      <div className="map-tools">
        <button
          aria-label="Zoom in"
          onClick={() => setZoom(Math.min(8, zoom * 1.4))}
        >
          <ZoomIn size={17} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => setZoom(Math.max(0.6, zoom / 1.4))}
        >
          <ZoomOut size={17} />
        </button>
        <button
          aria-label="Reset map"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="map-caption">
        <span>
          <span className="tiny-cross">+</span> {selected.latitude.toFixed(4)}°
          N &nbsp; {selected.longitude.toFixed(4)}° E
        </span>
        <span>Graticule only · no imagery or elevation layer</span>
      </div>
      <div className="map-scale">
        <span>90° S</span>
        <div />
        <span>80° S</span>
      </div>
    </div>
  );
}

function VisibilityChart({ analysis }: { analysis: Analysis }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={analysis.series}>
          <CartesianGrid stroke="#263335" strokeDasharray="3 4" />
          <XAxis
            dataKey="time"
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString("en-GB", {
                timeZone: "UTC",
                day: "2-digit",
                month: "short",
              })
            }
            tick={{ fill: "#84918e", fontSize: 16 }}
            minTickGap={60}
          />
          <YAxis unit="°" tick={{ fill: "#84918e", fontSize: 16 }} width={55} />
          <Tooltip
            contentStyle={{
              background: "#172326",
              border: "1px solid #3b4c48",
              borderRadius: 8,
            }}
            labelFormatter={(v) => utc(String(v)) + " UTC"}
            formatter={(v) => (typeof v === "number" ? `${v.toFixed(2)}°` : v)}
          />
          <Area
            dataKey="sun_elevation"
            name="Sun elevation"
            type="linear"
            stroke="#d6e99c"
            fill="#d6e99c"
            fillOpacity={0.07}
            isAnimationActive={false}
          />
          <Line
            dataKey="earth_elevation"
            name="Earth elevation"
            type="linear"
            stroke="#89bbdc"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
function Timeline({ analysis }: { analysis: Analysis }) {
  return (
    <div className="timeline">
      {(["sun_visible", "earth_visible", "simultaneous"] as const).map(
        (key, i) => (
          <div className="timeline-row" key={key}>
            <span>{["Sunlight", "Earth link", "Both visible"][i]}</span>
            <div
              className={`timeline-track track-${i}`}
              role="img"
              aria-label={`${["Sunlight", "Earth visibility", "Simultaneous visibility"][i]}: ${fmt(analysis.metrics[(["sun_visible_pct", "earth_visible_pct", "simultaneous_pct"] as const)[i]], "%")}`}
            >
              {analysis.series.slice(0, -1).map((row, j) => (
                <i
                  key={row.time}
                  title={`${utc(row.time)} UTC: ${row[key] ? "Visible" : "Below threshold"}`}
                  style={{
                    opacity: row[key] ? 1 : 0.09,
                    flex:
                      new Date(analysis.series[j + 1].time).getTime() -
                      new Date(row.time).getTime(),
                  }}
                />
              ))}
            </div>
          </div>
        ),
      )}
      <div className="timeline-labels">
        <span>{utc(analysis.mission.start)}</span>
        <span>UTC · sampled intervals</span>
        <span>{utc(analysis.mission.end)}</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [view, setViewState] = useState(7);
  const [accountName, setAccountName] = useState<string | null>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const { user } = await response.json();
        setAccountName((current) => current === undefined ? user?.username ?? null : current);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [preferences,setPreferences] = useState<Preferences>({animate:true,scale:1,detailed:true});
  const [radiusKm, setRadiusKm] = useState(20);
  const [areaSearch, setAreaSearch] = useState<{
    area: ResearchArea;
    result?: ResearchAreaResult;
    busy: boolean;
    error: string;
  }>();
  const [areaAssessments, setAreaAssessments] = useState<Research[]>([]);
  const [areaFailures, setAreaFailures] = useState<Record<string, string>>({});
  const [areaAssessing, setAreaAssessing] = useState(false);
  const areaRequest = useRef<AbortController | null>(null);
  const [researchPriority,setResearchPriority] = useState<ResearchPriority>("overall");
  const [researchBusy,setResearchBusy] = useState(false);
  const [researchResult,setResearchResult] = useState<Research|null>(null);
  const [researchEquipment, setResearchEquipment] = useState(defaultSolar);
  const [reportSite, setReportSite] = useState("");
  const [researchComparison,setResearchComparison]=useState<ResearchComparison|null>(null);
  const [whatIfComparison, setWhatIfComparison] = useState<{ context: string; scenarios: PlanBForecast[] } | null>(null);
  const [chosenAlternatives, setChosenAlternatives] = useState<Site[]>([]);
  const [comparisonNotice, setComparisonNotice] = useState("");
  const education = view === 14;
  const [labVisited, setLabVisited] = useState(false);
  const labOpen = view === 16;
  const [labSource, setLabSource] = useState<LabSource | null>(null);
  const [labReportVersion, setLabReportVersion] = useState(0);
  const [openSavedLabReport, setOpenSavedLabReport] = useState(false);
  const [labError, setLabError] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("lunar-power-lab:last-source") ?? "null");
      if (saved?.version === 1 && saved.assessment?.geometry && saved.assessment?.terrain &&
          saved.assessment?.horizon && saved.assessment?.temperature) {
        const validated = adaptAssessment(saved.assessment, saved.researchArea, saved.resultId);
        setLabSource({ ...validated, importedAt: typeof saved.importedAt === "string" ? saved.importedAt : validated.importedAt });
      }
    } catch {
      setLabError("The last saved Mission Lab source could not be restored.");
    }
  }, []);

  useEffect(() => {
    if (labOpen) setLabVisited(true);
  }, [labOpen]);
  const researchActions=useRef<ResearchActions|null>(null);
  const savingMission = useRef(false);
  const [missionSaveStatus, setMissionSaveStatus] = useState<{ assessment: Research; status: "saving" | "saved" | "error"; message?: string } | null>(null);
  const [missionToSave, setMissionToSave] = useState<{ record: SearchRecord; snapshot: MissionSnapshot } | null>(null);
  const [reopenedMission, setReopenedMission] = useState<{ record: SearchRecord; snapshot: MissionSnapshot } | null>(null);
  const rerunRequest = useRef<AbortController | null>(null);
  const [rerunningMission, setRerunningMission] = useState(false);
  const [rerunError, setRerunError] = useState("");
  const setView=(next:number)=>{if(!viewPaths[next]||next===0||next===6)return;if(next!==13)setMissionToSave(null);if(next!==8){rerunRequest.current?.abort();setRerunningMission(false);setRerunError("");}if(next!==8&&next!==12&&next!==13)setReopenedMission(null);setViewState(next);if(location.hash!==`#${viewPaths[next]}`)location.hash=viewPaths[next];window.scrollTo({top:0,behavior:"instant"});};
  const pendingSearchFocus = useRef(false);
  function openSearchForm() {
    pendingSearchFocus.current = true;
    setView(7);
  }
  useEffect(() => {
    if (view !== 7 || !pendingSearchFocus.current) return;
    pendingSearchFocus.current = false;
    const form = document.getElementById("landing-search-form");
    form?.focus({ preventScroll: true });
    form?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [view]);
  useEffect(()=>{const sync=()=>{
    const n=viewPaths.indexOf(location.hash.slice(1));
    if(n===0) {
      history.replaceState(history.state, "", "#search");
      setViewState(7);
    } else if(n===15) {
      history.replaceState(history.state, "", `#${viewPaths[11]}`);
      setViewState(11);
    } else if(n>=0&&n!==6)setViewState(n);
  };sync();window.addEventListener("hashchange",sync);try{const p=JSON.parse(localStorage.getItem("lunar-preferences-v1")||"null");if(p&&typeof p.animate==="boolean"&&typeof p.scale==="number")setPreferences({animate:p.animate,scale:Math.max(.95,Math.min(1.08,p.scale)),detailed:p.detailed!==false});}catch{}return()=>window.removeEventListener("hashchange",sync);},[]);
  const updatePreferences=(p:Preferences)=>{setPreferences(p);try{localStorage.setItem("lunar-preferences-v1",JSON.stringify(p));}catch{}};
  const full=preferences.detailed??true;
  const [astronomyVisited, setAstronomyVisited] = useState(false);
  const [observatoryMode, setObservatoryMode] = useState<"system" | "journey">("journey");
  useEffect(() => { if (view === 5 && observatoryMode === "system") setAstronomyVisited(true); }, [view, observatoryMode]);
  const [sites, setSites] = useState<Site[]>([]);
  const [missionSites, setMissionSites] = useState<MissionCatalogEntry[]>([]);
  const [selected, setSelected] = useState<Site>({
    name: "Shackleton vicinity",
    latitude: -89.54,
    longitude: 0,
  });
  const [start, setStart] = useState("2026-10-01");
  const [end, setEnd] = useState("2026-10-08");
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("00:00");
  const [interval, setIntervalMinutes] = useState(60);
  const [clearance, setClearance] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [weights, setWeights] = useState({
    sunlight: 1,
    earth: 1,
    simultaneous: 2,
  });
  const [checked, setChecked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const comparisonGeneration = useRef(0);
  const pendingExample = useRef<Analysis | null>(null);
  useEffect(() => {
    request<(Site | MissionCatalogEntry)[]>("sites?include_missions=true")
      .then((catalog) => {
        const references: Site[] = [];
        const missions: MissionCatalogEntry[] = [];
        for (const site of catalog) {
          if ("classification" in site) missions.push(site);
          else references.push(site);
        }
        setSites(references);
        setMissionSites(missions);
        setChecked(references.map((site) => site.id!));
      })
      .catch(async (e) => {
        setError(e.message);
        try {
          const response = await fetch("/sites.json");
          if (!response.ok) return;
          const references: Site[] = await response.json();
          setSites(references);
          setChecked(references.map((s) => s.id!));
        } catch {
          /* Reference metadata unavailable; coordinate entry still works. */
        }
      });
  }, []);
  useEffect(() => {
    generation.current++;
    setResearchResult(null);
    setAnalysis(pendingExample.current);
    pendingExample.current = null;
    setComparison(null);
    setPlaying(false);
    setIndex(0);
  }, [selected, start, end, startTime, endTime, interval, clearance]);
  useEffect(() => {
    areaRequest.current?.abort();
    setAreaSearch(undefined);
    setAreaAssessments([]);
    setAreaFailures({});
    setAreaAssessing(false);
    setResearchResult(null);
  }, [selected, start, end, startTime, endTime, interval, clearance, radiusKm, researchPriority]);
  useEffect(() => () => areaRequest.current?.abort(), []);
  useEffect(() => {
    comparisonGeneration.current++;
    setComparison(null);
  }, [weights, checked]);
  useEffect(() => {
    if (!playing || !analysis) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % analysis.series.length),
      200,
    );
    return () => window.clearInterval(timer);
  }, [playing, analysis]);
  const mission = (): Mission => ({
    ...selected,
    start: `${start}T${startTime}:00Z`,
    end: `${end}T${endTime}:00Z`,
    interval_minutes: interval,
    clearance_deg: clearance,
  });
  const restoreMission = (m: Mission) => {
    const begin = new Date(m.start).toISOString();
    const finish = new Date(m.end).toISOString();
    setSelected({name:m.name, latitude:m.latitude, longitude:m.longitude});
    setStart(begin.slice(0,10)); setStartTime(begin.slice(11,16));
    setEnd(finish.slice(0,10)); setEndTime(finish.slice(11,16));
    setIntervalMinutes(m.interval_minutes); setClearance(m.clearance_deg);
  };
  const activeArea = areaSearch && areaSearch.area.centre.name === selected.name && sameMission(areaSearch.area.centre, mission()) &&
    areaSearch.area.radiusKm === radiusKm && areaSearch.area.focus === researchPriority
    ? areaSearch : undefined;
  const recommendation = activeArea?.result?.results[0];
  const comparisonOrigin = activeArea?.area.centre ?? selected;
  const comparisonBaseline = recommendation?.mission ?? mission();
  const comparisonRadius = activeArea?.area.radiusKm ?? radiusKm;
  const searchRecord: SearchRecord = {
    version: 1, mission: mission(), priority: researchPriority, radiusKm,
    alternatives: chosenAlternatives.filter(s =>
      siteKey(s) !== siteKey(comparisonBaseline) && inComparisonArea(comparisonOrigin, s, comparisonRadius)).slice(0, 2),
  };

  async function searchResearchArea() {
    areaRequest.current?.abort();
    researchActions.current?.cancel();
    const controller = new AbortController();
    areaRequest.current = controller;
    const area: ResearchArea = {
      centre: mission(), radiusKm, focus: researchPriority, limits: researchActions.current?.getLimits(),
    };
    setAreaSearch({ area, busy: true, error: "" });
    setAreaAssessments([]);
    setAreaFailures({});
    setAreaAssessing(false);
    setChosenAlternatives([]);
    setWhatIfComparison(null);
    setComparisonNotice("");
    setResearchResult(null);
    setView(11);
    try {
      const response = await fetch("/api/research/research-area", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ mission: area.centre, limits: area.limits, radius_m: Math.round(area.radiusKm * 1000), focus: area.focus }),
      });
      if (!response.ok) throw Error("Could not search this research area. Please try again.");
      const result: ResearchAreaResult = await response.json();
      if (controller.signal.aborted) return;
      setAreaSearch({ area, result, busy: false, error: "" });
      setResearchResult(result.results[0] ?? null);
    } catch (error) {
      if (!controller.signal.aborted) setAreaSearch({ area, busy: false, error: (error as Error).message });
    }
  }

  const assessComparison = async (alternatives: Site[]) => {
    if (!activeArea) {
      await researchActions.current?.compare(alternatives);
      return;
    }
    if (!recommendation || areaAssessing) return;
    const controller = new AbortController();
    areaRequest.current = controller;
    setAreaAssessing(true);
    setAreaFailures({});
    try {
      for (const point of alternatives) {
        if ([...activeArea.result!.results, ...areaAssessments].some(result => siteKey(result.mission) === siteKey(point))) continue;
        try {
          const response = await fetch("/api/research/evaluate", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({
              mission: { ...activeArea.area.centre, name: point.name, latitude: point.latitude, longitude: point.longitude },
              limits: activeArea.area.limits,
            }),
          });
          if (!response.ok) throw Error("Assessment unavailable");
          const assessment: Research = await response.json();
          if (!controller.signal.aborted) setAreaAssessments(previous => [...previous, assessment]);
        } catch (error) {
          if (!controller.signal.aborted) setAreaFailures(previous => ({ ...previous, [`${point.latitude},${point.longitude}`]: (error as Error).message }));
        }
      }
    } finally {
      if (areaRequest.current === controller) setAreaAssessing(false);
    }
  };

  function cancelComparison() {
    areaRequest.current?.abort();
    setAreaAssessing(false);
    setAreaSearch(previous => previous?.busy ? { ...previous, busy: false, error: "Research area search cancelled." } : previous);
    researchActions.current?.cancel();
  }
  const addComparisonSite = ({ name, latitude, longitude }: Site) => {
    const point = { name, latitude, longitude };
    const key = siteKey(point);
    const alternatives = searchRecord.alternatives;
    if ([comparisonBaseline, ...alternatives].some(site => siteKey(site) === key)) {
      setComparisonNotice(`${point.name} is already in the comparison cards.`);
    } else if (!inComparisonArea(comparisonOrigin, point, comparisonRadius)) {
      setComparisonNotice(`Choose a point within ${comparisonRadius} km of the research centre.`);
    } else if (alternatives.length + comparisonScenarios.length >= 2) {
      setComparisonNotice("Remove a comparison point below before adding another.");
    } else {
      const next = [...alternatives, point];
      setChosenAlternatives(next);
      setComparisonNotice("");
      assessComparison(next);
    }
    setView(11);
    requestAnimationFrame(() => {
      const cards = document.getElementById("comparison-cards");
      cards?.focus({ preventScroll: true });
      cards?.scrollIntoView({ block: "start" });
    });
  };
  const run = async () => {
    const gen = generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request<Analysis>("analyze", mission());
      if (gen === generation.current) {
        setAnalysis(r);
        setIndex(0);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const compare = async () => {
    const gen = generation.current;
    const comparisonGen = comparisonGeneration.current;
    setBusy(true);
    setError("");
    try {
      const result = await request<Comparison>("compare", {
        mission: mission(),
        locations: sites.filter((s) => checked.includes(s.id!)),
        weights,
      });
      if (
        gen === generation.current &&
        comparisonGen === comparisonGeneration.current
      )
        setComparison(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const example = async () => {
    setBusy(true);
    setError("");
    try {
      const reference = sites.find(
        (s) =>
          s.latitude === selected.latitude &&
          s.longitude === selected.longitude,
      );
      const id =
        reference?.id ||
        (selected.latitude === -89.54 && selected.longitude === 0
          ? "shackleton"
          : null);
      if (!id)
        throw Error(
          "Select a predefined site to load its verified example. Custom coordinates need a live calculation.",
        );
      const r = await fetch(`/examples/${id}.json`);
      if (!r.ok) throw Error("Verified example unavailable");
      const data: Analysis = await r.json();
      pendingExample.current = data;
      setSelected({
        name: data.mission.name,
        latitude: data.mission.latitude,
        longitude: data.mission.longitude,
      });
      setStart("2026-10-01");
      setEnd("2026-10-08");
      setStartTime("00:00"); setEndTime("00:00");
      setIntervalMinutes(60);
      setClearance(0);
      setNotice(
        `Precomputed NASA/JPL DE421 example · ${data.mission.name} · 1–8 October 2026 · reference sphere`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (format: "csv" | "json") => {
    if (!analysis) return;
    setBusy(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: analysis.mission, format }),
      });
      if (!response.ok) throw Error("Export failed; please check the backend.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `lunar-analysis.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const current = analysis?.series[index];
  const empty = (
    <div className="empty">
      <Satellite size={34} />
      <h3>Your mission, in perspective.</h3>
      <p>
        Select a site and mission window, then run the analysis to see
        calculated Sun and Earth geometry.
      </p>
      <button className="button primary" disabled={busy} onClick={run}>
        Analyze selected site <ArrowRight size={16} />
      </button>
      <button className="text-button" disabled={busy} onClick={example}>
        Load a verified precomputed example
      </button>
    </div>
  );
  const mode =
    analysis?.mode === "terrain_screened"
      ? "Terrain-screened geometry"
      : "Reference-sphere geometry";
  const comparisonMission = comparisonBaseline;
  const comparisonState: ResearchComparison | null = activeArea ? {
    results: [...(activeArea.result?.results ?? []), ...areaAssessments],
    candidates: searchRecord.alternatives,
    busy: activeArea.busy || areaAssessing,
    progress: activeArea.busy ? "Searching the research area…" : "Evaluating comparison points…",
    error: activeArea.error,
    failures: areaFailures,
  } : researchComparison;
  const comparisonLimits = comparisonState?.results.find((result) => sameMission(result.mission, comparisonMission))?.limits;
  const whatIfContext = JSON.stringify([comparisonMission, comparisonLimits, activeArea?.area, researchEquipment]);
  const comparisonScenarios = whatIfComparison?.context === whatIfContext ? whatIfComparison.scenarios : [];
  async function saveMission({ record, snapshot }: { record: SearchRecord; snapshot: MissionSnapshot }) {
    await accountApi("/history", "POST", {
      name: record.mission.name.trim().slice(0, 80) || "Lunar mission",
      payload: record,
      snapshot,
    });
  }

  async function saveDisplayedMission(assessment: Research) {
    if (savingMission.current || (missionSaveStatus?.assessment === assessment && missionSaveStatus.status === "saved")) return;
    const pending = {
      record: { ...(reopenedMission?.record ?? searchRecord), mission: assessment.mission, alternatives: [] },
      snapshot: { version: 1 as const, assessment, equipment: researchEquipment },
    };
    savingMission.current = true;
    setMissionSaveStatus({ assessment, status: "saving" });
    try {
      await saveMission(pending);
      setMissionSaveStatus({ assessment, status: "saved" });
    } catch (error) {
      setMissionSaveStatus({ assessment, status: "error", message: error instanceof Error ? error.message : "Unable to save this mission." });
      if (error instanceof AccountApiError && error.status === 401) {
        setAccountName(null);
        setMissionToSave(pending);
        setView(13);
      }
    } finally {
      savingMission.current = false;
    }
  }

  const displayedResult = reopenedMission?.snapshot.assessment ?? researchResult;
  return (
    <div className={`app-shell lunar-app ${full?"full-view":"simple-view"}`} style={{"--ui-scale":preferences.scale} as CSSProperties}>
      <div className="stars" aria-hidden="true"/>
      <Navigation view={view} education={education} accountName={accountName} onLogout={()=>{setAccountName(null);if(view===13)setView(7);}} onNavigate={setView} preferences={preferences} onPreferences={updatePreferences}/>
      {!education&&<NewsSidebar/>}
      <div className="main-shell">
        <div className="workspace-with-news"><main id="main-content">
          {view!==7&&view!==8&&view!==9&&view!==11&&view!==12&&view!==13&&!education&&<><div className="workspace-breadcrumb"><button onClick={()=>setView(7)}>Search</button><ChevronRight size={12}/><span>{view===11?"Preliminary assessment":views[view]||["","","","","","","","","Result","About Us","Settings","Preliminary assessment","Mission lab","Account","Education","Mission report","Mission planner"][view]}</span></div><div className="page-heading"><div><div className="eyebrow">LUNAR SOUTH POLE / MISSION RESEARCH</div><h1>{["","See beyond the horizon.","Read the lunar landscape.","Compare the possibilities.","Explore the missions before us.","A new perspective on space.","","","The outlook.","Look further.","Make it your own.","Compare the possibilities.","Mission lab.","Your account.","Lunar classroom.","Mission report.","Mission planner."][view]}</h1><p>{view===8?"Your selected location, assessed with real ephemerides. Every result has a source and a limit.":view===14?"Plan a lunar mission and test how sunlight, battery power and Earth visibility affect your choices.":view===9?"A new perspective on exploration. Grounded in data, open about uncertainty.":"Explore measurements, geometry and the evidence behind the mission window."}</p></div></div></>}
          {view===7&&<section className="search-layout revised-search" aria-label="Search for a lunar landing site">
            <section className="lunar-hero cinematic-hero" aria-label="Lunar exploration"><div className="hero-copy"><span className="eyebrow">A NEW PERSPECTIVE ON THE MOON</span><h1>Find your place<br/>on the <em>Moon.</em></h1><p>Every mission starts with a possibility. Explore lunar locations through real sunlight, communication and terrain data.</p><div className="hero-hairline"/><span className="hero-footnote">EXPLORE · ASSESS · DISCOVER</span><button className="cinematic-cta" onClick={()=>document.getElementById("landing-search-form")?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}>Explore the Moon <ArrowRight size={15}/></button></div><CinematicHero animate={preferences.animate}/></section>
            <LandingSearch selected={selected} missionSites={missionSites} onSelected={setSelected} start={start} end={end} startTime={startTime} endTime={endTime} onStart={setStart} onEnd={setEnd} onStartTime={setStartTime} onEndTime={setEndTime} interval={interval} onInterval={setIntervalMinutes} clearance={clearance} onClearance={setClearance} priority={researchPriority} onPriority={v=>setResearchPriority(v as ResearchPriority)} radiusKm={radiusKm} onRadius={setRadiusKm} busy={researchBusy || !!activeArea?.busy} onSubmit={searchResearchArea}/>
            <div className="account-actions search-extra-tools"><button className="button subtle" onClick={()=>setView(12)}>Mission lab</button></div>
          </section>}
          {view===11&&<PreliminaryComparison mission={comparisonMission} state={comparisonState} area={activeArea?.area} areaResult={activeArea?.result} radiusKm={comparisonRadius} alternatives={searchRecord.alternatives} priority={researchPriority} equipment={researchEquipment} notice={comparisonNotice} onEvaluate={()=>activeArea && !recommendation ? void searchResearchArea() : void assessComparison(searchRecord.alternatives)}
            scenarios={comparisonScenarios}
            onScenariosChange={(scenarios) => setWhatIfComparison({ context: whatIfContext, scenarios: scenarios.slice(0, 2 - searchRecord.alternatives.length) })}
            onRemoveSite={(site) => {
              setComparisonNotice("");
              setChosenAlternatives((points) => points.filter((point) => siteKey(point) !== siteKey(site)));
            }}
            alternativePicker={<ComparisonPicker mission={activeArea?.area.centre ?? mission()} radiusKm={comparisonRadius} baseline={comparisonBaseline} limits={activeArea?.area.limits} chosen={chosenAlternatives} maxAlternatives={2 - comparisonScenarios.length} onChange={sites=>{setComparisonNotice("");setChosenAlternatives(sites);}} onAdd={addComparisonSite} busy={comparisonState?.busy ?? false}/>}
            onInspect={r=>{
              if (researchComparison?.results.some((result) => sameMission(result.mission, r.mission))) {
                researchActions.current?.inspect(r);
              }
              setResearchResult(r);
              setView(8);
            }} onSearch={()=>setView(7)} onCancel={cancelComparison}/>}
          {view===11&&<ResearchComparisonReport key={missionKey(comparisonMission)} mission={comparisonMission} alternatives={searchRecord.alternatives} comparison={comparisonState} scenarios={comparisonScenarios} evidenceSite={reportSite} onEvidenceSiteChange={setReportSite} onInspect={result=>{setResearchResult(result);setView(8);}} equipment={researchEquipment}/>}
          {view===13&&<Account onOpenPowerReport={(source) => { setLabSource(source); setOpenSavedLabReport(true); setLabReportVersion((version) => version + 1); setView(12); }} onSignedIn={missionToSave ? async () => {
              await saveMission(missionToSave);
              setMissionSaveStatus({ assessment: missionToSave.snapshot.assessment, status: "saved" });
              setMissionToSave(null);
            } : undefined}
            onOpenResult={(record, snapshot) => { setReopenedMission({ record, snapshot }); setResearchEquipment(snapshot.equipment); setView(8); }} onUsernameChange={setAccountName} onRestore={r=>{restoreMission(r.mission);setChosenAlternatives(r.alternatives);setResearchPriority(r.priority);setRadiusKm(r.radiusKm ?? 20);areaRequest.current?.abort();setAreaSearch(undefined);setView(7);}}/>}
          {education&&<PortableEducation animate={preferences.animate}/>}
          {labVisited&&<div hidden={!labOpen}><MissionLab mode="professional" classroomNav={null} linkedTool={view===16?14:undefined} onModeChange={mode=>setView(mode==="education"?14:12)} mission={mission()} selected={selected} onSelected={setSelected} sites={sites} onMap={openSearchForm} start={start} end={end} startTime={startTime} endTime={endTime} onStart={setStart} onEnd={setEnd} onStartTime={setStartTime} onEndTime={setEndTime} onInterval={setIntervalMinutes} onClearance={setClearance} onRestore={restoreMission}/></div>}
          {(view===12 || labSource)&&<div hidden={view!==12}><PowerMissionLab key={JSON.stringify([labSource?.key, labReportVersion])} openSavedReport={openSavedLabReport} source={labSource} sourceError={labError} onResult={()=>{
            if (labSource && displayedResult !== labSource.assessment) {
              setReopenedMission({
                record: { ...searchRecord, mission: labSource.site, alternatives: [] },
                snapshot: { version: 1, assessment: labSource.assessment, equipment: researchEquipment },
              });
            }
            setView(8);
          }} onConfigure={openSearchForm}/></div>}
          {view===8&&<ResearchOverview key={JSON.stringify(displayedResult?.mission)} result={displayedResult} onNewSearch={openSearchForm} comparisonOrigin={comparisonOrigin} comparisonRadiusKm={comparisonRadius} onNavigate={setView} onRunAgain={reopenedMission ? async () => {
            if (rerunningMission) return;
            const controller = new AbortController();
            rerunRequest.current = controller;
            setRerunningMission(true);
            setRerunError("");
            try {
              const assessment = reopenedMission.snapshot.assessment;
              const response = await fetch("/api/research/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mission: assessment.mission, limits: assessment.limits }),
                signal: controller.signal,
              });
              if (!response.ok) throw new Error("Unable to refresh this mission.");
              const updated: Research = await response.json();
              if (!controller.signal.aborted) setReopenedMission({
                ...reopenedMission, snapshot: { ...reopenedMission.snapshot, assessment: updated },
              });
            } catch {
              if (!controller.signal.aborted) setRerunError("Unable to refresh this mission. Try again.");
            } finally {
              if (!controller.signal.aborted) setRerunningMission(false);
            }
          } : undefined} onOpenMissionLab={(assessment) => {
            try {
              const centre = !reopenedMission && activeArea?.result?.results.some((item) => sameMission(item.mission, assessment.mission))
                ? activeArea.area.centre : undefined;
              const imported = adaptAssessment(assessment, centre);
              setOpenSavedLabReport(false);
              setLabSource((previous) => previous?.assessment === assessment && previous.key === imported.key ? previous : imported);
              setLabError("");
            } catch (error) {
              setLabSource(null);
              setLabError(error instanceof Error ? error.message : "Could not import the selected Result.");
            }
            setView(12);
          }} onSaveMission={saveDisplayedMission} missionSaveStatus={missionSaveStatus && missionSaveStatus.assessment === displayedResult ? missionSaveStatus : undefined} onAddComparison={addComparisonSite} busy={rerunningMission || (!reopenedMission && (researchBusy || !!activeArea?.busy))} equipment={researchEquipment} onEquipmentChange={setResearchEquipment} priority={reopenedMission?.record.priority ?? researchPriority} animate={preferences.animate} assessmentError={reopenedMission ? rerunError : comparisonState?.error}/>}
          <div hidden={![1,3].includes(view)}>
            <section className="task-intro panel">
              <h2>Which location and mission window should I investigate?</h2>
              <p>Choose a site and dates, calculate how often the Sun and Earth are both visible, then compare alternatives. These exploratory results do not establish landing safety.</p>
            </section>
            <Uncertainty analysis={analysis} />
            {analysis && <section className="result-summary panel" aria-label="Main result">
              <span>Calculated simultaneous visibility · {analysis.mission.name}</span>
              <strong>{fmt(analysis.metrics.simultaneous_pct, "%")}</strong>
              <p>of {analysis.mission.start.slice(0,10)} to {analysis.mission.end.slice(0,10)} UTC, in {analysis.mode === "terrain_screened" ? "terrain-screened" : "reference-sphere"} geometry.</p>
              <p>Uncertainty not yet quantified. {analysis.terrain.available ? "Terrain sampling and model limitations apply." : "Local terrain obstruction is unknown."}</p>
              <CalculationDetails analysis={analysis} />
              <button className="button primary" onClick={() => setView(3)}>Next: compare locations <ArrowRight size={16}/></button>
            </section>}
            <div className="science-notice full-only">
              <span className="notice-icon">
                <Satellite size={17} />
              </span>
              <p>
                <strong>Real ephemerides. Transparent limits.</strong> NASA/JPL
                DE421 + NAIF SPICE. Terrain obstruction remains unknown until a
                verified LOLA raster is configured.
              </p>
              <span className="outline-tag">GEOMETRIC MODEL</span>
            </div>
            {error && (
              <div className="error" role="alert">
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="info" role="status">
                {notice}
              </div>
            )}
            <div className="mission-controls" hidden={view===8}>
              <div className="mission-control-title">
                <SlidersHorizontal size={16} />
                <span>Mission window</span>
                <small>UTC · {startTime} → {endTime}</small>
              </div>
              <label>
                Start date
                <input
                  type="date"
                  value={start}
                  min="1901-01-01"
                  max="2052-12-30"
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <span className="date-arrow">→</span>
              <label>
                End date
                <input
                  type="date"
                  value={end}
                  min={start}
                  max="2052-12-31"
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <label className="full-only">
                Time step
                <select
                  value={interval}
                  onChange={(e) => setIntervalMinutes(+e.target.value)}
                >
                  {[5, 15, 30, 60, 180, 360].map((n) => (
                    <option key={n} value={n}>
                      {n < 60
                        ? `${n} minutes`
                        : `${n / 60} hour${n > 60 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-only" title="Additional angle above the reference or terrain horizon for the Earth center.">
                Link clearance
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={clearance}
                  onChange={(e) => setClearance(+e.target.value)}
                />
              </label>
              <button
                className="button primary analyze"
                disabled={busy || !start || !end}
                onClick={run}
              >
                {busy ? <span className="spinner" /> : <Activity size={16} />}{" "}
                {busy ? "Calculating…" : "Analyze site"}{" "}
                {!busy && <ArrowRight size={15} />}
              </button>
            </div>
            {!full && <p className="active-settings">Current settings: {startTime} → {endTime} UTC · {interval}-minute sampling · {clearance}° Earth clearance. Adjust in Full View.</p>}
            </div>
            {view === 0 && (
              <>
                <div className="explorer-layout">
                  <section className="panel map-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <Compass size={17} /> Landing site explorer
                        </h2>
                        <p>Click to select · drag to pan · zoom to explore</p>
                      </div>
                      <button className="button primary" onClick={openSearchForm}>Use point in Configure</button>
                      <span className="small-label">80°–90° S</span>
                    </div>
                    <PolarMap
                      sites={[...referenceSites, ...sites.filter((site) => site.id === "connecting-ridge")]}
                      selected={selected}
                      onSelect={setSelected}
                    />
                    <div className="map-footer">
                      <span>
                        <i className="legend-dot" /> Selected location
                      </span>
                      <span>
                        <i className="legend-dot gray" /> Geographic references
                      </span>
                      <a
                        href="https://trek.nasa.gov/moon/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open NASA Moon Trek <ExternalLink size={11} />
                      </a>
                    </div>
                  </section>
                  <section className="panel site-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Explore a location</h2>
                        <p>South pole geographic references</p>
                      </div>
                      <MapPin size={17} />
                    </div>
                    <div className="site-list">
                      {sites.map((s, i) => (
                        <button
                          key={s.id}
                          className={`site-card ${selected.name === s.name ? "selected" : ""}`}
                          onClick={() => setSelected(s)}
                        >
                          <span className="site-number">0{i + 1}</span>
                          <div>
                            <strong>{s.name}</strong>
                            <span>
                              {s.latitude.toFixed(2)}° N &nbsp;{" "}
                              {s.longitude.toFixed(2)}° E
                            </span>
                          </div>
                          {selected.name === s.name ? (
                            <Check size={16} />
                          ) : (
                            <ChevronRight size={15} />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="coordinates">
                      <div className="section-label">SELECTED COORDINATES</div>
                      <div className="coordinate-inputs">
                        <label>
                          Latitude (° N)
                          <input
                            aria-label="Latitude"
                            type="number"
                            min="-90"
                            max="90"
                            step="0.001"
                            value={selected.latitude}
                            onChange={(e) =>
                              setSelected({
                                ...selected,
                                name: "Custom location",
                                latitude: +e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Longitude (° E)
                          <input
                            aria-label="Longitude"
                            type="number"
                            min="-180"
                            max="180"
                            step="0.001"
                            value={selected.longitude}
                            onChange={(e) =>
                              setSelected({
                                ...selected,
                                name: "Custom location",
                                longitude: +e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="elevation-readout">
                        <Layers size={15} />
                        <span>Surface elevation</span>
                        <strong>
                          {fmt(analysis?.terrain.elevation_m, " m")}
                        </strong>
                      </div>
                      <p className="muted">
                        Planetocentric · east-positive longitude.
                        <br />
                        References are not approved touchdown sites.
                      </p>
                    </div>
                    <div className="site-insight">
                      <Sun size={21} />
                      <div>
                        <strong>
                          A little elevation. A different horizon.
                        </strong>
                        <p>
                          Small terrain changes can alter sunlight and
                          communication at the lunar poles.
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
            {analysis && view !== 4 && (
              <div className="metrics-grid">
                {[
                  {
                    label: "Sunlight availability",
                    value: fmt(analysis.metrics.sun_visible_pct, "%"),
                    icon: Sun,
                    color: "lime",
                    tip: "Sun center above the threshold, weighted by interval duration.",
                  },
                  {
                    label: "Earth visibility",
                    value: fmt(analysis.metrics.earth_visible_pct, "%"),
                    icon: Earth,
                    color: "blue",
                    tip: "Earth center above threshold plus configured link clearance.",
                  },
                  {
                    label: "Simultaneous visibility",
                    value: fmt(analysis.metrics.simultaneous_pct, "%"),
                    icon: Radio,
                    color: "lime",
                    tip: "Both Sun and Earth center visible; geometric operational proxy only.",
                  },
                  {
                    label: "Longest link blackout",
                    value: fmt(analysis.metrics.longest_blackout_hours, " h"),
                    icon: Moon,
                    color: "gray",
                    tip: "Longest sampled continuous Earth-center nonvisibility within this mission.",
                  },
                ].map((m) => (
                  <div className="metric panel" key={m.label} title={m.tip}>
                    <div className="metric-label">
                      {m.label}
                      <m.icon size={17} className={m.color} />
                    </div>
                    <strong>{m.value}</strong>
                    <small>Uncertainty not yet quantified</small>
                    <CalculationDetails analysis={analysis} metric={m.label} />
                    <small>
                      {analysis.mode === "terrain_screened"
                        ? "Local terrain included"
                        : "Reference sphere · terrain unknown"}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {(view === 0 || view === 1) && (
              <section className="panel analysis-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <Activity size={17} />{" "}
                      {view === 1
                        ? "Sun–Earth horizon simulator"
                        : "Mission visibility overview"}
                    </h2>
                    <p>
                      {analysis
                        ? `${analysis.mission.name} · ${mode}`
                        : "Calculated geometry will appear here after analysis"}
                    </p>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot" /> Sun
                    </span>
                    <span>
                      <i className="legend-dot blue-dot" /> Earth
                    </span>
                  </div>
                </div>
                {!analysis ? (
                  empty
                ) : (
                  <>
                    <div className="full-only"><VisibilityChart analysis={analysis} /></div>
                    <Timeline analysis={analysis} />
                    {view === 0 ? (
                      <div className="panel-bottom">
                        <span>
                          Approximate IAU_MOON orientation · no light-time
                          corrections
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setView(1)}
                        >
                          Open horizon simulator <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : (
                      current && (
                        <div className="simulator">
                          <div className="simulator-heading">
                            <div>
                              <h3>Local horizon · {utc(current.time)} UTC</h3>
                              <p>
                                Azimuth measured clockwise from north. Solid
                                line:{" "}
                                {analysis.terrain.available
                                  ? "sampled terrain horizon"
                                  : "reference plane (terrain unknown)"}
                                .
                              </p>
                            </div>
                            <span className="tag">
                              {index + 1} / {analysis.series.length}
                            </span>
                          </div>
                          <div className="horizon-svg">
                            <svg
                              viewBox="0 0 900 280"
                              role="img"
                              aria-label="Sun and Earth elevation against azimuth and terrain horizon"
                            >
                              <rect
                                x="50"
                                y="25"
                                width="800"
                                height="210"
                                fill="#101c22"
                              />
                              {[-10, 0, 10, 20].map((el) => (
                                <g key={el}>
                                  <line
                                    x1="50"
                                    x2="850"
                                    y1={165 - el * 6}
                                    y2={165 - el * 6}
                                    stroke="#344142"
                                    strokeDasharray="3 4"
                                  />
                                  <text
                                    x="15"
                                    y={169 - el * 6}
                                    fill="#96a29c"
                                    fontSize="16"
                                  >
                                    {el}°
                                  </text>
                                </g>
                              ))}
                              {[0, 90, 180, 270, 360].map((az, i) => (
                                <g key={az}>
                                  <line
                                    x1={50 + (az / 360) * 800}
                                    x2={50 + (az / 360) * 800}
                                    y1="25"
                                    y2="235"
                                    stroke="#253334"
                                  />
                                  <text
                                    x={50 + (az / 360) * 800}
                                    y="260"
                                    textAnchor="middle"
                                    fill="#96a29c"
                                    fontSize="16"
                                  >
                                    {
                                      [
                                        "N · 0°",
                                        "E · 90°",
                                        "S · 180°",
                                        "W · 270°",
                                        "N · 360°",
                                      ][i]
                                    }
                                  </text>
                                </g>
                              ))}
                              <path
                                d={
                                  analysis.terrain.horizon
                                    ? analysis.terrain.horizon
                                        .concat([
                                          {
                                            azimuth: 360,
                                            elevation:
                                              analysis.terrain.horizon[0]
                                                .elevation,
                                          },
                                        ])
                                        .map(
                                          (p, i) =>
                                            `${i ? "L" : "M"}${50 + (p.azimuth / 360) * 800},${165 - p.elevation * 6}`,
                                        )
                                        .join(" ")
                                    : "M50 165H850"
                                }
                                fill="none"
                                stroke="#8d9c8a"
                                strokeWidth="2"
                              />
                              {[
                                {
                                  az: current.sun_azimuth,
                                  el: current.sun_elevation,
                                  color: "#d8ed9c",
                                  name: "Sun",
                                },
                                {
                                  az: current.earth_azimuth,
                                  el: current.earth_elevation,
                                  color: "#86c1e4",
                                  name: "Earth",
                                },
                              ].map((p) => (
                                <g key={p.name}>
                                  <circle
                                    cx={50 + (p.az / 360) * 800}
                                    cy={Math.min(
                                      230,
                                      Math.max(30, 165 - p.el * 6),
                                    )}
                                    r="7"
                                    fill={p.color}
                                  />
                                  <text
                                    x={50 + (p.az / 360) * 800 + 12}
                                    y={
                                      Math.min(
                                        230,
                                        Math.max(30, 165 - p.el * 6),
                                      ) + 4
                                    }
                                    fill={p.color}
                                    fontSize="12"
                                  >
                                    {p.name} {p.el.toFixed(2)}°
                                    {p.el < -10 || p.el > 22
                                      ? " (outside plot range)"
                                      : ""}
                                  </text>
                                </g>
                              ))}
                            </svg>
                          </div>
                          <div className="playback">
                            <button
                              className="button primary icon-button"
                              aria-label={
                                playing ? "Pause animation" : "Play animation"
                              }
                              onClick={() => setPlaying(!playing)}
                            >
                              {playing ? (
                                <Pause size={18} />
                              ) : (
                                <Play size={18} />
                              )}
                            </button>
                            <input
                              aria-label="Simulation time"
                              type="range"
                              min={0}
                              max={analysis.series.length - 1}
                              value={index}
                              onChange={(e) => {
                                setPlaying(false);
                                setIndex(+e.target.value);
                              }}
                            />
                            <span>{utc(current.time)} UTC</span>
                          </div>
                          <div className="sim-status">
                            <span>
                              <Sun size={16} />
                              Sun{" "}
                              {current.sun_visible
                                ? "above threshold"
                                : "below threshold"}{" "}
                              · Az {current.sun_azimuth.toFixed(1)}°
                            </span>
                            <span>
                              <Earth size={16} />
                              Earth{" "}
                              {current.earth_visible
                                ? "above threshold"
                                : "below threshold"}{" "}
                              · Az {current.earth_azimuth.toFixed(1)}°
                            </span>
                            <span>
                              Terrain obstruction:{" "}
                              {analysis.terrain.available
                                ? "modeled within 20 km"
                                : "unknown"}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </section>
            )}
            {view === 2 && <TerrainAssessment location={selected} onSelect={setSelected}/> }
            {view === 3 && (
              <section className="panel analysis-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <SlidersHorizontal size={18} /> Landing site comparison
                    </h2>
                    <p>
                      Two or three sites · one mission window · explicit
                      priorities
                    </p>
                  </div>
                </div>
                <div className="comparison-controls">
                  <div>
                    <h3>Locations</h3>
                    {sites.map((s) => (
                      <label className="check-row" key={s.id}>
                        <input
                          type="checkbox"
                          checked={checked.includes(s.id!)}
                          onChange={(e) =>
                            setChecked(
                              e.target.checked
                                ? [...checked, s.id!]
                                : checked.filter((id) => id !== s.id),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                  <div>
                    <h3>Comparison weights</h3>
                    {Object.entries(weights).map(([key, value]) => (
                      <label className="weight-row" key={key}>
                        <span>
                          {key === "earth"
                            ? "Earth visibility"
                            : key === "simultaneous"
                              ? "Simultaneous"
                              : "Sunlight"}
                        </span>
                        <input
                          aria-label={`${key} weight`}
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={value}
                          onChange={(e) =>
                            setWeights({ ...weights, [key]: +e.target.value })
                          }
                        />
                        <b>{value}</b>
                      </label>
                    ))}
                  </div>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      checked.length < 2 ||
                      Object.values(weights).every((w) => w === 0)
                    }
                    onClick={compare}
                  >
                    {busy ? "Calculating…" : "Compare sites"}
                    <ArrowRight size={16} />
                  </button>
                </div>
                {comparison ? (
                  <>
                    <div className="info">
                      {comparison.mode === "reference_sphere"
                        ? "Reference-sphere ranking: local terrain obstruction and landing hazards are unknown."
                        : "Terrain-screened geometric ranking; terrain hazards are not scored."}
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Site / rank</th>
                            <th>Sunlight</th>
                            <th>Earth link</th>
                            <th>Both visible</th>
                            <th>Blackout</th>
                            <th>Darkness</th>
                            <th>Slope</th>
                            <th>Score / 100</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.ranking.map((r, i) => (
                            <tr key={r.mission.name}>
                              <td>
                                <span className="rank">0{i + 1}</span>
                                {r.mission.name}
                              </td>
                              <td>{fmt(r.metrics.sun_visible_pct, "%")}</td>
                              <td>{fmt(r.metrics.earth_visible_pct, "%")}</td>
                              <td className="lime">
                                {fmt(r.metrics.simultaneous_pct, "%")}
                              </td>
                              <td>
                                {fmt(r.metrics.longest_blackout_hours, " h")}
                              </td>
                              <td>
                                {fmt(r.metrics.longest_darkness_hours, " h")}
                              </td>
                              <td>{fmt(r.slope_deg, "°")}</td>
                              <td>
                                <strong>{r.score.toFixed(1)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="uncertainty-banner">Uncertainty not yet quantified. Scores apply only to the displayed mission dates; small differences may not be meaningful.</div>
                    <details className="explanation"><summary>How was this calculated? — ranking</summary>
                    <p>{comparison.explanation}</p>
                    <p>User weights: sunlight {weights.sunlight}, Earth {weights.earth}, simultaneous {weights.simultaneous}. Score = (sunlight % × sunlight weight + Earth % × Earth weight + simultaneous % × simultaneous weight) / total weight. No hazard or safety score is included.</p>
                    {comparison.ranking.map(r => <p key={r.mission.name}>{r.mission.name}: {r.mission.start} to {r.mission.end}; {Object.entries(r.contributions).map(([k,v]) => `${k}: ${v.toFixed(3)} points`).join(" + ")} = {r.score.toFixed(3)} / 100.</p>)}
                    </details>
                    <div className="ranking-explanation full-only">
                      <h3>What drives the ranking?</h3>
                      <p>{comparison.explanation}</p>
                      {comparison.ranking.map((r) => (
                        <div className="score-breakdown" key={r.mission.name}>
                          <span>{r.mission.name}</span>
                          <div>
                            {Object.entries(r.contributions).map(
                              ([k, v], i) => (
                                <i
                                  key={k}
                                  title={`${k}: ${v.toFixed(2)} score points`}
                                  style={{
                                    width: `${v}%`,
                                    background: [
                                      "#cce69c",
                                      "#89bbdc",
                                      "#84bda5",
                                    ][i],
                                  }}
                                />
                              ),
                            )}
                          </div>
                          <small>
                            {Object.entries(r.contributions)
                              .map(([k, v]) => `${k}: ${v.toFixed(1)}`)
                              .join(" · ")}
                          </small>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="comparison-empty">
                    <SlidersHorizontal size={24} />
                    <p>
                      Select your sites and priorities, then calculate the
                      trade-offs.
                    </p>
                  </div>
                )}
              </section>
            )}
            {view === 4 && (
              <section className="panel" aria-label="Historical lunar missions">
                {analysis && <div className="panel-heading" style={{padding:20}}><span>Current site analysis exports</span><div className="export-buttons"><button className="button subtle" disabled={busy} onClick={() => download("csv")}>CSV</button><button className="button subtle" disabled={busy} onClick={() => download("json")}>JSON</button></div></div>}
                <iframe title="Lunar mission archive and interactive 3D paths" src="/mission-archive/index.html" style={{width:"100%",height:"min(1200px, 85vh)",minHeight:640,border:0,borderRadius:12,display:"block"}} />
              </section>
            )}
            {view === 5 && (
              <>
                <div className="panel astro-camera-controls" role="group" aria-label="Observatory view" style={{padding:16}}>
                  <button className={`button ${observatoryMode === "journey" ? "primary" : "subtle"}`} aria-pressed={observatoryMode === "journey"} onClick={() => setObservatoryMode("journey")}>Lunar Journey</button>
                  <button className={`button ${observatoryMode === "system" ? "primary" : "subtle"}`} aria-pressed={observatoryMode === "system"} onClick={() => setObservatoryMode("system")}>Sun–Earth–Moon simulation</button>
                </div>
                {observatoryMode === "journey" && <PortableJourney target={selected} animate={preferences.animate} />}
              </>
            )}
            <LandingResearch showPanel={view===3} onComparisonChange={setResearchComparison} onResultChange={activeArea ? undefined : setResearchResult} actionRef={researchActions} priority={researchPriority} onBusyChange={setResearchBusy} mission={mission()} sites={sites} onAddComparison={addComparisonSite} onSelect={site => { setSelected(site); setView(7); }} />
            <div hidden={view !== 5 || observatoryMode !== "system"}>{astronomyVisited && <AstronomySimulation active={view === 5 && observatoryMode === "system"} />}</div>
            {view===3&&comparison&&<AlternativeCards comparison={comparison} onInspect={r=>{setSelected({name:r.mission.name,latitude:r.mission.latitude,longitude:r.mission.longitude});openSearchForm();}}/>}
            {view===9&&<AboutLunar onExplore={()=>setView(7)} onResults={()=>setView(8)}/>}
            {view===10&&<section className="preferences-page glass"><span className="eyebrow">YOUR EXPERIENCE</span><h2>Settings.</h2><PreferencesControls value={preferences} onChange={updatePreferences}/><button className="button subtle" onClick={()=>setView(7)}>Back to Search <ArrowRight size={14}/></button></section>}
            <footer className="footer">
              <span>
                <img src="/lunar-logo.webp" alt="" width={18} height={18} /> LUNAR LANDING SITE NAVIGATOR <span> / </span>{" "}
                NASA Space Apps 2026 project
              </span>
              <span>
                Exploration, informed by evidence. <span className="live-dot" />
              </span>
            </footer>
          </main>

        </div>
      </div>
    </div>
  );
}
