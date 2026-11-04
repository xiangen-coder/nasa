"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CalculationDetails, Uncertainty } from "../components/ResultExplanation";
import NewsSidebar from "../components/NewsSidebar";
import MissionPlanner from "../components/MissionPlanner";
import LandingResearch from "../components/LandingResearch";
import type { RouteMemory } from "../components/LunarRouteViewer";
const AstronomySimulation = dynamic(() => import("../components/AstronomySimulation"), { ssr: false, loading: () => <div className="panel empty">Loading astronomical simulation…</div> });
const LunarRouteViewer = dynamic(() => import("../components/LunarRouteViewer"), { ssr: false, loading: () => <div className="panel empty">Loading lunar route viewer…</div> });
const CelestialViewer = dynamic(() => import("../components/CelestialViewer"), {
  ssr: false,
  loading: () => <div className="panel empty">Loading 3D viewer…</div>,
});
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
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Earth,
  ExternalLink,
  FileText,
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
  Orbit,
  Rocket,
} from "lucide-react";

import type { Site, Mission, Analysis, Comparison } from "./types";
const views = [
  "Map explorer",
  "Horizon simulator",
  "Terrain analysis",
  "Site comparison",
  "Mission report",
  "3D observatory",
  "Mission planner",
  "Lunar surface route",
  "Sun–Earth–Moon",
];
const icons = [
  Compass,
  Activity,
  Layers,
  SlidersHorizontal,
  FileText,
  Orbit,
  Rocket,
  MapPin,
  Orbit,
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
  const project = (lat: number, lon: number) => {
    const r =
      (250 * Math.tan(((90 + lat) * Math.PI) / 360)) /
      Math.tan((5 * Math.PI) / 180);
    return {
      x: 320 + r * Math.sin((lon * Math.PI) / 180),
      y: 300 - r * Math.cos((lon * Math.PI) / 180),
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
                  r={r}
                  fill="none"
                  stroke="#9aa99b"
                  strokeOpacity=".22"
                  strokeDasharray="2 5"
                />
                <text x={320+r*0.15} y={300+r*0.85} fill="#829185" fontSize="16">
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
                  x={320 + (p.x - 320) * 1.065}
                  y={303 + (p.y - 300) * 1.065}
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
  const [view, setView] = useState(0);
  const [astronomyVisited, setAstronomyVisited] = useState(false);
  useEffect(() => { if (view === 8) setAstronomyVisited(true); }, [view]);
  const [routeMemory, setRouteMemory] = useState<RouteMemory | null>(null);
  const [full, setFull] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setFull(localStorage.getItem("lunar-view") === "full");
      setSidebarOpen(window.innerWidth > 850 && localStorage.getItem("lunar-sidebar") !== "closed");
      setNewsOpen(localStorage.getItem("lunar-news") === "open");
    } catch { /* Storage is optional. */ }
  }, []);
  const closeSidebar = () => {
    setSidebarOpen(false);
    try { localStorage.setItem("lunar-sidebar", "closed"); } catch {}
    sidebarToggle.current?.focus();
  };
  useEffect(() => {
    if (!sidebarOpen || window.innerWidth > 850) return;
    const sidebar = sidebarRef.current;
    sidebar?.querySelector<HTMLButtonElement>("button")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeSidebar(); }
      if (event.key !== "Tab") return;
      const nodes = sidebar?.querySelectorAll<HTMLElement>('button, a[href]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [sidebarOpen]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<Site>({
    name: "Shackleton vicinity",
    latitude: -89.54,
    longitude: 0,
  });
  const [start, setStart] = useState("2026-10-01");
  const [end, setEnd] = useState("2026-10-08");
  const [interval, setIntervalMinutes] = useState(60);
  const [clearance, setClearance] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState("Connecting");
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
    request<Site[]>("sites")
      .then((s) => {
        setSites(s);
        setChecked(s.map((x) => x.id!));
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
    request<{ status: string }>("health")
      .then(() => setHealth("SPICE online"))
      .catch(() => setHealth("Backend offline"));
  }, []);
  useEffect(() => {
    generation.current++;
    setAnalysis(pendingExample.current);
    pendingExample.current = null;
    setComparison(null);
    setPlaying(false);
    setIndex(0);
  }, [selected, start, end, interval, clearance]);
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
    start: `${start}T00:00:00Z`,
    end: `${end}T00:00:00Z`,
    interval_minutes: interval,
    clearance_deg: clearance,
  });
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
  return (
    <div className={`app-shell ${full ? "full-view" : "simple-view"} ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Dismiss navigation overlay" tabIndex={-1} onClick={closeSidebar} />}
      <aside className="sidebar" id="workspace-navigation" aria-label="Workspace navigation" ref={sidebarRef} hidden={!sidebarOpen}>
        <button className="button subtle close-sidebar" onClick={closeSidebar}>Close sidebar ×</button>
        <a className="brand" href="/" aria-label="Lunar Navigator home">
          <div className="brand-mark">
            <Moon size={22} />
          </div>
          <div>
            LUNAR<span>NAVIGATOR</span>
          </div>
        </a>
        <div className="side-label">MISSION WORKSPACE</div>
        <nav>
          {views.map((label, i) => {
            const Icon = icons[i];
            return (
              <button
                aria-label={label}
                className={view === i ? "active" : ""}
                onClick={() => { setView(i); if (window.innerWidth <= 850) closeSidebar(); }}
                key={label}
              >
                <Icon size={18} />
                <span>{label}</span>
                {view === i && <ChevronRight size={14} />}
              </button>
            );
          })}
        </nav>
        <div className="side-bottom">
          <div className="mission-badge">
            <span className="live-dot" /> NASA SPACE APPS <b>2026</b>
          </div>
          <p>
            Explore possibilities.
            <br />
            Understand the constraints.
          </p>
          <a
            href="https://naif.jpl.nasa.gov/naif/"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={15} /> Science & data reference{" "}
            <ExternalLink size={12} />
          </a>
          <div className="version">
            EXPLORATORY TOOL <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="workspace-toolbar">
          <button ref={sidebarToggle} className="button subtle" aria-expanded={sidebarOpen} aria-controls="workspace-navigation" onClick={() => {
            const next = !sidebarOpen; setSidebarOpen(next);
            try { localStorage.setItem("lunar-sidebar", next ? "open" : "closed"); } catch {}
          }}>{sidebarOpen ? "Close sidebar" : "Open sidebar"}</button>
          <div className="view-switch" role="group" aria-label="Detail view">
            {[false, true].map(value => <button key={String(value)} aria-pressed={full === value} onClick={() => {
              setFull(value); try { localStorage.setItem("lunar-view", value ? "full" : "simple"); } catch {}
            }}>{value ? "Full" : "Simple"}</button>)}
          </div>
          <button className="button subtle" aria-expanded={newsOpen} aria-controls="news-panel" onClick={() => {
            setNewsOpen(!newsOpen); try { localStorage.setItem("lunar-news", !newsOpen ? "open" : "closed"); } catch {}
          }}>{newsOpen ? "Hide news" : "Show news"}</button>
          </div>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} /> <span>{views[view]}</span>
          </div>
          <div className="system-state">
            <span
              className={health === "SPICE online" ? "live-dot" : "offline-dot"}
            />
            {health}
            <span className="separator" /> <span className="avatar">LN</span>
          </div>
        </header>
        <div className={`workspace-with-news ${newsOpen ? "" : "news-closed"}`}>
          <main>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  LUNAR SOUTH POLE / MISSION PLANNING
                </div>
                <h1>
                  {
                    [
                      "Find your next horizon.",
                      "See beyond the horizon.",
                      "Read the lunar landscape.",
                      "Compare the possibilities.",
                      "Your mission, documented.",
                      "A new perspective on space.",
                      "Plan the journey, explicitly.",
                      "Follow a route across the Moon.",
                      "A moment in the solar system.",
                    ][view]
                  }
                </h1>
                <p>
                  {
                    [
                      "Explore landing locations. Understand sunlight, communication, and the terrain between.",
                      "Follow the Sun and Earth across the local sky, one moment at a time.",
                      "Inspect elevation, slope, and obstructions from a verified lunar DEM.",
                      "Weigh operational trade-offs across the same mission window.",
                      "Trace every result back to its data, methods, and assumptions.",
                      "Explore the supplied 3D models and your computed local sky.",
                      "Record vehicle assumptions, inspect launch weather, and save your mission plans.",
                      "Inspect imported waypoints on a 3D reference sphere and select a point for analysis.",
                      "Explore actual NASA ephemerides for the Sun, Earth and Moon at a time you choose.",
                    ][view]
                  }
                </p>
              </div>
              <button
                className="button subtle report-button"
                onClick={() => setView(4)}
              >
                <FileText size={16} /> Mission report <ArrowRight size={15} />
              </button>
            </div>
            <div hidden={view === 8}>
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
            <div className="mission-controls">
              <div className="mission-control-title">
                <SlidersHorizontal size={16} />
                <span>Mission window</span>
                <small>UTC</small>
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
            {!full && <p className="active-settings">Current settings: {interval}-minute sampling · {clearance}° Earth clearance. Adjust in Full View.</p>}
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
                      <span className="small-label">80°–90° S</span>
                    </div>
                    <PolarMap
                      sites={sites}
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
            {analysis && view !== 8 && (
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
            {view === 2 && (
              <section className="panel analysis-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <Layers size={18} /> Local terrain assessment
                    </h2>
                    <p>LOLA elevations · slopes · horizon obstructions</p>
                  </div>
                  <a
                    className="text-button"
                    href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA PDS / LOLA <ExternalLink size={14} />
                  </a>
                </div>
                {!analysis ? (
                  empty
                ) : (
                  <div className="terrain-content">
                    <div className="terrain-summary">
                      <div>
                        <span>Elevation</span>
                        <strong>
                          {fmt(analysis.terrain.elevation_m, " m")}
                        </strong>
                      </div>
                      <div>
                        <span>Local slope</span>
                        <strong>{fmt(analysis.terrain.slope_deg, "°")}</strong>
                      </div>
                      <div>
                        <span>Pixel spacing</span>
                        <strong>
                          {fmt(analysis.terrain.resolution_m, " m")}
                        </strong>
                      </div>
                      <div>
                        <span>Horizon coverage</span>
                        <strong>
                          {analysis.terrain.available
                            ? "20 km / 360°"
                            : "Unavailable"}
                        </strong>
                      </div>
                    </div>
                    <CalculationDetails analysis={analysis} metric="Terrain" />
                    {analysis.terrain.reason && (
                      <div className="info">{analysis.terrain.reason}</div>
                    )}
                    {analysis.terrain.grid.length > 0 && (
                      <div
                        className="terrain-grid"
                        role="img"
                        aria-label="Local elevation heatmap over 10 by 10 km, north is up"
                      >
                        {(() => {
                          const values = analysis.terrain.grid.flatMap((p) =>
                            p.elevation_m === null ? [] : [p.elevation_m],
                          );
                          const low = Math.min(...values),
                            high = Math.max(...values);
                          return [...analysis.terrain.grid]
                            .sort(
                              (a, b) =>
                                b.north_m - a.north_m || a.east_m - b.east_m,
                            )
                            .map((p, i) => (
                              <div
                                key={i}
                                title={`${p.east_m} m E, ${p.north_m} m N: ${fmt(p.elevation_m, " m")}`}
                                style={{
                                  background:
                                    p.elevation_m === null
                                      ? "#242e33"
                                      : `hsl(${75 + ((p.elevation_m - low) / (high - low || 1)) * 50} 25% ${20 + ((p.elevation_m - low) / (high - low || 1)) * 55}%)`,
                                }}
                              />
                            ));
                        })()}
                      </div>
                    )}
                    <p className="muted">
                      {analysis.terrain.method ||
                        "No terrain layer is drawn without measured elevation data. Configure LOLA_MANIFEST on the backend; see the README for the required CRS, vertical datum, provenance, and checksum."}
                    </p>
                    <div className="reference-links">
                      <a
                        href="https://quickmap.lroc.asu.edu/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        LROC QuickMap <ExternalLink size={14} />
                      </a>
                      <a
                        href="https://trek.nasa.gov/moon/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        NASA Moon Trek <ExternalLink size={14} />
                      </a>
                    </div>
                    <p className="muted">
                      External map references only. This app does not assume or
                      proxy an undocumented imagery API. Subpixel rocks,
                      roughness, and landing hazards remain unassessed.
                    </p>
                  </div>
                )}
              </section>
            )}
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
              <section className="panel analysis-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      <FileText size={18} /> Mission analysis report
                    </h2>
                    <p>
                      {analysis
                        ? `${analysis.mission.name} · ${utc(analysis.mission.start)} — ${utc(analysis.mission.end)} UTC`
                        : "Run an analysis to prepare your report"}
                    </p>
                  </div>
                  {analysis && (
                    <div className="export-buttons">
                      <button
                        className="button subtle"
                        disabled={busy}
                        onClick={() => download("csv")}
                      >
                        <ArrowDownToLine size={14} /> CSV
                      </button>
                      <button
                        className="button subtle"
                        disabled={busy}
                        onClick={() => download("json")}
                      >
                        <ArrowDownToLine size={14} /> JSON
                      </button>
                      <button
                        className="button subtle"
                        onClick={() => window.print()}
                      >
                        Print / PDF
                      </button>
                    </div>
                  )}
                </div>
                {!analysis ? (
                  empty
                ) : (
                  <>
                    <div className="report-body">
                      <h3>{mode}</h3>
                      <p>
                        {analysis.mission.latitude.toFixed(4)}° N,{" "}
                        {analysis.mission.longitude.toFixed(4)}° E ·{" "}
                        {analysis.mission.interval_minutes}-minute cadence ·{" "}
                        {analysis.mission.clearance_deg}° communication
                        clearance
                      </p>
                      <div className="full-only"><VisibilityChart analysis={analysis} /></div>
                      <Timeline analysis={analysis} />
                      <h3>Operational windows</h3>
                      {analysis.metrics.operational_windows.length ? (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Start (UTC)</th>
                                <th>End (UTC)</th>
                                <th>Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analysis.metrics.operational_windows.map((w) => (
                                <tr key={w.start}>
                                  <td>{utc(w.start)}</td>
                                  <td>{utc(w.end)}</td>
                                  <td>{w.hours.toFixed(2)} h</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p>
                          No simultaneous visibility within the sampled mission
                          window.
                        </p>
                      )}
                      <h3>Data, assumptions & limitations</h3>
                      <p>
                        {analysis.provenance.ephemeris} ·{" "}
                        {analysis.provenance.orientation}
                      </p>
                      <ul>
                        {analysis.provenance.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                      <div className="info">
                        {analysis.terrain.reason || analysis.terrain.method}
                      </div>
                      <div className="reference-links">
                        <a
                          href="https://ssd.jpl.nasa.gov/planets/eph_export.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          JPL ephemerides <ExternalLink size={13} />
                        </a>
                        <a
                          href="https://naif.jpl.nasa.gov/naif/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          NAIF SPICE <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
            {view === 5 && (
              <>
                <button className="button primary" onClick={() => setView(7)}>Open lunar surface route →</button>
                <CelestialViewer sample={current} />
                {analysis && (
                  <section className="panel playback-panel">
                    <div className="panel-heading">
                      <h2>Computed sample · {utc(current!.time)} UTC</h2>
                    </div>
                    <div className="playback">
                      <button
                        className="button primary icon-button"
                        aria-label={
                          playing ? "Pause 3D animation" : "Play 3D animation"
                        }
                        onClick={() => setPlaying(!playing)}
                      >
                        {playing ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <input
                        type="range"
                        aria-label="3D simulation time"
                        min={0}
                        max={analysis.series.length - 1}
                        value={index}
                        onChange={(e) => {
                          setPlaying(false);
                          setIndex(+e.target.value);
                        }}
                      />
                    </div>
                  </section>
                )}
                {!analysis && <div className="panel">{empty}</div>}
              </>
            )}
            {view === 6 && (
              <MissionPlanner
                mission={mission()}
                onRestore={(m) => {
                  setSelected({
                    name: m.name,
                    latitude: m.latitude,
                    longitude: m.longitude,
                  });
                  setStart(m.start.slice(0, 10));
                  setEnd(m.end.slice(0, 10));
                  setIntervalMinutes(m.interval_minutes);
                  setClearance(m.clearance_deg);
                }}
              />
            )}
            {view === 7 && <LunarRouteViewer initial={routeMemory} onChange={setRouteMemory} onSelect={(site) => { setSelected(site); setView(0); }} />}
            {(view === 0 || view === 3) && <LandingResearch mission={mission()} sites={sites} onSelect={site => { setSelected(site); setView(0); }} />}
            <div hidden={view !== 8}>{astronomyVisited && <AstronomySimulation active={view === 8} />}</div>
            <footer className="footer">
              <span>
                <Moon size={13} /> LUNAR LANDING SITE NAVIGATOR <span> / </span>{" "}
                NASA Space Apps 2026 project
              </span>
              <span>
                Exploration, informed by evidence. <span className="live-dot" />
              </span>
            </footer>
          </main>
          <div id="news-panel" hidden={!newsOpen}><NewsSidebar /></div>
        </div>
      </div>
    </div>
  );
}
