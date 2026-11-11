"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import LandingReliability from "./LandingReliability";
import type { ResearchPriority } from "./SearchConsole";
import type { Site, Mission } from "../app/types";

type Source = {
  name?: string;
  source_url?: string;
  resolution_m?: number;
  observation_period?: string;
  quality?: string;
};
type Factor = {
  name: string;
  score: number | null;
  weight: number;
  effective_weight: number;
  contribution: number | null;
  quality: string;
  explanation: string;
  source?: Source;
};
export type ResearchSpan = { start: string; end: string; hours: number };
type Span = ResearchSpan;
export type Research = {
  mission: Mission;
  limits?: Record<string, number>;
  formula?: string;
  score: number | null;
  available_weight: number;
  missing: string[];
  provisional: boolean;
  safety_status: string;
  constraints_failed: string[];
  warnings: string[];
  limitations: string[];
  factors: Record<string, Factor>;
  terrain: {
    available: boolean;
    coverage_type?: "regional";
    reason?: string;
    elevation_m?: number;
    slope_p95_deg?: number;
    slope_max_deg?: number;
    roughness_m?: number;
    relief_m?: number;
    resolution_m?: number;
    radius_m?: number;
    source?: Source;
    grid: {
      east_m: number;
      north_m: number;
      elevation_m: number;
      slope_deg: number;
    }[];
  };
  observer_height?: { available: boolean; value?: number; source?: Source };
  horizon: {
    available: boolean;
    reason?: string;
    method?: string;
    source?: Source;
    profile?: { azimuth: number; elevation: number }[] | null;
  };
  geometry: {
    available: boolean;
    reason?: string;
    mode?: string;
    cached?: boolean;
    sunlight_hours?: number;
    sunlight_windows?: Span[];
    earth_windows?: Span[];
    series?: {
      time: string;
      sun_elevation: number;
      sun_azimuth: number;
      sun_horizon_deg?: number | null;
      earth_horizon_deg?: number | null;
      earth_elevation: number;
      earth_azimuth: number;
      earth_distance_km: number;
      earth_light_time_seconds: number;
      sun_visible: boolean;
      earth_visible: boolean;
      simultaneous: boolean;
    }[];
    metrics?: {
      sun_visible_pct: number;
      earth_visible_pct: number;
      simultaneous_pct: number;
      longest_darkness_hours: number;
      longest_blackout_hours: number;
      operational_windows: Span[];
      darkness_windows: Span[];
      blackout_windows: Span[];
    };
    sources?: Record<string, { ephemeris: string; orientation: string }>;
  };
  temperature: {
    available: boolean;
    minimum_k?: number;
    maximum_k?: number;
    source?: Source;
  };
  ice?: { available: boolean; value?: number | null; radius_m?: number; source?: Source };
};
export type ResearchComparison = {
  results: Research[];
  candidates: Site[];
  busy: boolean;
  progress: string;
  error: string;
  failures: Record<string, string>;
};
export type ResearchActions = {
  evaluate: () => Promise<void>;
  compare: (chosen?: Site[]) => Promise<void>;
  inspect: (result: Research) => void;
  cancel: () => void;
};

type Catalog = {
  datasets: (Source & { kind: string; status: string; reason?: string })[];
  regions: {
    name: string;
    published: string;
    source_url: string;
    type: string;
  }[];
  reference_points: Site[];
  preparation_command: string;
  documentation_url: string;
};
const DEFAULTS = {
  radius_m: 100,
  good_slope_deg: 2,
  max_slope_deg: 15,
  max_roughness_m: 5,
  max_relief_m: 50,
  max_resolution_m: 20,
  hazard_penalty: 100,
  max_hazard_fraction: 0.05,
  min_temperature_k: 100,
  max_temperature_k: 350,
};
const LABELS: Record<keyof typeof DEFAULTS, string> = {
  radius_m: "Terrain radius (m)",
  good_slope_deg: "Good slope (°)",
  max_slope_deg: "Maximum slope (°)",
  max_roughness_m: "Maximum roughness (m)",
  max_relief_m: "Maximum relief (m)",
  max_resolution_m: "Maximum DEM pixel size (m)",
  hazard_penalty: "Hazard penalty (points)",
  max_hazard_fraction: "Maximum hazard fraction (0–1)",
  min_temperature_k: "Minimum operating temperature (K)",
  max_temperature_k: "Maximum operating temperature (K)",
};
const num = (v: number | null | undefined, suffix = "") =>
  v == null
    ? "Unavailable"
    : `${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${suffix}`;
const locationKey = (s: Site) => `${s.latitude},${s.longitude}`;

async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api/research/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!r.ok) {
    let message = `Request failed (${r.status})`;
    try {
      const e = await r.json();
      message =
        typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail);
    } catch {}
    throw Error(message);
  }
  return r.json();
}

export default function LandingResearch({
  mission,
  sites,
  onSelect,
  onAddComparison,
  actionRef,
  priority = "overall",
  onBusyChange,
  onResultChange,
  onComparisonChange,
  onSavedChange,
}: {
  mission: Mission;
  sites: Site[];
  onSelect: (site: Site) => void;
  onAddComparison: (site: Site) => void;
  actionRef?: Ref<ResearchActions>;
  priority?: ResearchPriority;
  onBusyChange?: (busy: boolean) => void;
  onResultChange?: (result: Research | null) => void;
  onComparisonChange?: (comparison: ResearchComparison) => void;
  onSavedChange?: (sites: Site[]) => void;
}) {
  const [candidates, setCandidates] = useState<Site[]>([]),
    [failures, setFailures] = useState<Record<string, string>>({}),
    [detailKey, setDetailKey] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [saved, setSaved] = useState<Site[]>([]);
  const [limits, setLimits] = useState(DEFAULTS),
    [results, setResults] = useState<Research[]>([]),
    [detail, setDetail] = useState(0);
  useEffect(() => { onSavedChange?.(saved); }, [saved, onSavedChange]);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const [name, setName] = useState(mission.name),
    [region, setRegion] = useState("");
  const [imagery, setImagery] = useState<"nac" | "psr" | null>(null),
    [imageError, setImageError] = useState(false);
  const [sample, setSample] = useState(0),
    [mapLayer, setMapLayer] = useState<"slope" | "elevation">("slope");
  const abort = useRef<AbortController | null>(null),
    generation = useRef(0);
  const key = JSON.stringify({ mission, limits });
  useEffect(() => {
    api<Catalog>("datasets")
      .then(setCatalog)
      .catch((e) => setError(e.message));
    try {
      const value = JSON.parse(
        localStorage.getItem("lunar-research-points") || "[]",
      );
      if (Array.isArray(value))
        setSaved(
          value
            .filter(
              (s) =>
                typeof s.name === "string" &&
                Number.isFinite(s.latitude) &&
                Math.abs(s.latitude) <= 90 &&
                Number.isFinite(s.longitude) &&
                Math.abs(s.longitude) <= 180,
            )
            .slice(0, 20),
        );
    } catch {}
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    generation.current++;
    abort.current?.abort();
    setResults([]);
    setCandidates([]);
    setFailures({});
    setDetailKey(null);
    setBusy(false);
    setProgress("");
    setImagery(null);
    setName(mission.name);
    setError("");
  }, [key, mission.name]);
  const result =
    results.find((r) => locationKey(r.mission) === detailKey) ??
    results[detail];
  const current = result?.geometry.series?.[sample];
  const save = () => {
    const point = {
      name: name.trim() || "Custom research point",
      latitude: mission.latitude,
      longitude: mission.longitude,
      description: region
        ? `User-associated with ${region}; membership not verified.`
        : "Custom point selected on map.",
    };
    const next = [
      ...saved.filter((s) => locationKey(s) !== locationKey(point)),
      point,
    ].slice(-20);
    setSaved(next);
    try {
      localStorage.setItem("lunar-research-points", JSON.stringify(next));
    } catch {
      setError(
        "Browser storage unavailable. Points remain available until the page closes.",
      );
    }
  };
  const run = async (compare: boolean, chosen?: Site[]) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const gen = ++generation.current;
    const candidates = compare ? [mission, ...(chosen ?? [...saved, ...sites])] : [mission];
    const unique = candidates
      .filter(
        (s, i, a) =>
          a.findIndex((p) => locationKey(p) === locationKey(s)) === i,
      )
      .slice(0, 3);
    setBusy(true);
    setError("");
    setFailures({});
    setCandidates(unique);
    // Reuse completed assessments for the same mission window and limits.
    // The request-key effect invalidates these when inputs change.
    const retained = compare
      ? results.filter((r) => unique.some((site) => locationKey(site) === locationKey(r.mission)))
      : [];
    setResults(retained);
    setDetailKey(retained.some((r) => locationKey(r.mission) === locationKey(mission)) ? locationKey(mission) : null);
    setDetail(0);
    setSample(0);
    setImagery(null);
    const collected: Research[] = [...retained];
    try {
      for (const [i, s] of unique.entries()) {
        if (collected.some((r) => locationKey(r.mission) === locationKey(s)))
          continue;
        setProgress(
          `Evaluating ${s.name} (${i + 1}/${unique.length}). Cached NASA observations and local raster windows; no large downloads.`,
        );
        const timeout = window.setTimeout(() => controller.abort(), 145000);
        let r: Research;
        try {
          r = await api<Research>(
            "evaluate",
            { mission: { ...mission, name: s.name, latitude: s.latitude, longitude: s.longitude }, limits },
            controller.signal,
          );
        } catch (e) {
          if (controller.signal.aborted) throw e;
          if (gen !== generation.current) return;
          setFailures((previous) => ({
            ...previous,
            [locationKey(s)]: (e as Error).message,
          }));
          continue;
        } finally {
          window.clearTimeout(timeout);
        }
        if (gen !== generation.current) return;
        collected.push(r);
        setResults(
          [...collected].sort(
            (a, b) =>
              (a.constraints_failed.length > 0 ? 1 : 0) -
                (b.constraints_failed.length > 0 ? 1 : 0) ||
              (b.score ?? -1) - (a.score ?? -1),
          ),
        );
      }
    } catch (e) {
      if (gen === generation.current)
        setError(
          controller.signal.aborted
            ? "Evaluation cancelled or timed out. Completed results remain available; retry the missing site."
            : (e as Error).message,
        );
    } finally {
      if (gen === generation.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };
  useEffect(() => {
    onResultChange?.(result ?? null);
  }, [result, onResultChange]);
  useImperativeHandle(actionRef, () => ({
    evaluate: () => run(false),
    compare: (chosen) => run(true, chosen),
    inspect: (r: Research) => {
      setDetailKey(locationKey(r.mission));
      setSample(0);
      setImagery(null);
    },
    cancel: () => abort.current?.abort(),
  }));
  useEffect(() => {
    onComparisonChange?.({
      results,
      candidates,
      busy,
      progress,
      error,
      failures,
    });
  }, [
    results,
    candidates,
    busy,
    progress,
    error,
    failures,
    onComparisonChange,
  ]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  return (
    <section
      id="landing-assessment"
      className="panel research-panel"
      aria-label="NASA landing research"
    >
      <div className="panel-heading">
        <div>
          <h2>NASA landing research</h2>
          <p>
            Five-factor screening · existing map selection and mission dates
          </p>
        </div>
        <span className="tag">RESEARCH MODEL v1</span>
      </div>
      <div className="research-body">
        <p>
          <strong>{mission.name}</strong> · {mission.latitude.toFixed(5)}° N,{" "}
          {mission.longitude.toFixed(5)}° E<br />
          {mission.start} → {mission.end} · {mission.interval_minutes}-minute
          samples
        </p>
        <p className="priority-label">
          Your focus:{" "}
          {priority === "overall"
            ? "Overall consideration"
            : priority === "T"
            ? "Terrain safety"
            : priority === "S"
              ? "Sunlight availability"
              : "Earth communication"}
        </p>
        <p className="muted">
          0.35 Terrain + 0.25 Sunlight + 0.20 Communication + 0.15 Temperature +
          0.05 Ice. A high score never establishes landing safety. Unknown
          factors remain unavailable.
        </p>
        <div className="astro-inputs">
          <label>
            Saved point name
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Historical NASA region association
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Custom / unverified region</option>
              {catalog?.regions.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </label>
          <button className="button subtle" onClick={save}>
            Save selected point
          </button>
        </div>
        <p className="muted">
          Points are stored in this browser. Region names are from NASA’s 19
          August 2022 release, not a current mission shortlist or exact
          touchdown coordinates. Selecting a name does not prove that your point
          lies within its boundary.
        </p>
        <div className="astro-camera-controls">
          {catalog?.reference_points.map((s) => (
            <button
              className="button subtle"
              key={s.id}
              onClick={() => onSelect(s)}
            >
              Select {s.name}
            </button>
          ))}
          {saved.map((s) => (
            <button
              className="button subtle"
              key={locationKey(s)}
              onClick={() => onSelect(s)}
            >
              Select saved: {s.name}
            </button>
          ))}
        </div>
        <details className="explanation">
          <summary>Configure research thresholds and hard limits</summary>
          <p>
            These are editable research assumptions, not NASA spacecraft
            requirements. Exceeding measured slope, roughness, relief or mapped
            hazard limits flags the location and removes it from the eligible
            ranking. Missing measurements cannot pass a safety test.
          </p>
          <div className="astro-inputs">
            {(Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).map((k) => (
              <label key={k}>
                {LABELS[k]}
                <input
                  type="number"
                  step="any"
                  value={limits[k]}
                  onChange={(e) =>
                    setLimits({ ...limits, [k]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <button className="button subtle" onClick={() => setLimits(DEFAULTS)}>
            Reset research thresholds
          </button>
        </details>
        <div className="astro-camera-controls">
          <button
            className="button primary"
            disabled={busy}
            onClick={() => run(false)}
          >
            Evaluate selected point
          </button>
          <button
            className="button subtle"
            disabled={busy}
            onClick={() => run(true)}
          >
            Compare up to three points
          </button>
        </div>
        <p className="muted">
          Comparison order: selected point, saved points, then existing map
          references. All use the same dates and thresholds. The original
          visibility comparison above remains available.
        </p>
        {busy && (
          <p className="info" role="status">
            {progress}
          </p>
        )}
        {(error || Object.keys(failures).length > 0) && (
          <p className="error" role="alert">
            {error ||
              Object.entries(failures)
                .map(([point, message]) => `${point}: ${message}`)
                .join("; ")}
          </p>
        )}
        {results.length > 1 && (
          <>
            <p className="info">
              Ranks are meaningful only with comparable data coverage. Available
              factors and geometry modes may differ; compare the coverage
              columns. Failed-limit sites are listed after eligible research
              scores, without a rank.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Rank / point</th>
                    <th>Score</th>
                    {["T", "S", "C", "H", "I"].map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                    <th>Available weight / missing</th>
                    <th>Safety</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={locationKey(r.mission)}>
                      <td>
                        <button
                          className="button subtle"
                          onClick={() => {
                            setDetail(i);
                            setDetailKey(locationKey(r.mission));
                            setSample(0);
                            setImagery(null);
                          }}
                        >
                          {r.constraints_failed.length || r.score === null
                            ? "Unranked"
                            : i + 1}
                          . {r.mission.name}
                        </button>
                      </td>
                      <td>
                        {num(r.score)}{" "}
                        {r.provisional ? "provisional" : "complete"}
                      </td>
                      {["T", "S", "C", "H", "I"].map((k) => (
                        <td key={k}>{num(r.factors[k].score)}</td>
                      ))}
                      <td>
                        {num(r.available_weight * 100, "%")} /{" "}
                        {r.missing.join(", ") || "none"}
                        <br />
                        {r.geometry.mode}
                      </td>
                      <td>{r.safety_status.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {result && (
          <>
            <h3>
              {result.mission.name}: {num(result.score, " / 100")} ·{" "}
              {result.provisional ? "provisional" : "complete"}
            </h3>
            <p>
              Available weight: {num(result.available_weight * 100, "%")} ·
              Missing factors: {result.missing.join(", ") || "none"}. Safety:{" "}
              <strong>{result.safety_status.replaceAll("_", " ")}</strong>.
            </p>
            {result.constraints_failed.map((w) => (
              <p className="error" key={w}>
                {w}
              </p>
            ))}
            {result.warnings.map((w) => (
              <p className="info" key={w}>
                {w}
              </p>
            ))}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Score / 100</th>
                    <th>Nominal → used weight</th>
                    <th>Contribution</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.factors).map(([k, f]) => (
                    <tr
                      key={k}
                      className={priority === k ? "priority-factor" : undefined}
                    >
                      <th>
                        {k} · {f.name}
                      </th>
                      <td>{num(f.score)}</td>
                      <td>
                        {num(f.weight * 100, "%")} →{" "}
                        {num(f.effective_weight * 100, "%")}
                      </td>
                      <td>{num(f.contribution, " points")}</td>
                      <td>{f.quality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="explanation">
              <summary>Score calculation and sources</summary>
              {Object.entries(result.factors).map(([k, f]) => (
                <p key={k}>
                  <strong>{k}: </strong>
                  {f.explanation}{" "}
                  {f.source?.source_url && (
                    <a
                      href={f.source.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source: {f.source.name || k}
                    </a>
                  )}
                </p>
              ))}
              {result.limitations.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </details>
            <h3 id="result-terrain" tabIndex={-1}>Terrain evidence</h3>
            <div className="astro-metrics">
              <div className="panel">
                <span>Neighbourhood slope · p95 / max</span>
                <strong>
                  {num(result.terrain.slope_p95_deg, "°")} /{" "}
                  {num(result.terrain.slope_max_deg, "°")}
                </strong>
                <p>
                  {num(result.terrain.resolution_m, " m pixels")} ·{" "}
                  {num(result.terrain.radius_m, " m radius")}
                </p>
              </div>
              <div className="panel">
                <span>Detrended roughness / relief</span>
                <strong>
                  {num(result.terrain.roughness_m, " m")} /{" "}
                  {num(result.terrain.relief_m, " m")}
                </strong>
                <p>Elevation: {num(result.terrain.elevation_m, " m")}</p>
              </div>
              <div className="panel">
                <span>Diviner historical summer range</span>
                <strong>
                  {num(result.temperature.minimum_k, " K")} –{" "}
                  {num(result.temperature.maximum_k, " K")}
                </strong>
                <p>
                  {result.temperature.source?.observation_period ||
                    "No valid paired temperature observations"}
                </p>
              </div>
              <div className="panel">
                <span>Estimated sunlight duration</span>
                <strong>{num(result.geometry.sunlight_hours, " hours")}</strong>
                <p>{result.geometry.mode || "Unavailable"}</p>
              </div>
            </div>
            {!result.terrain.available && (
              <p className="muted">
                Fine-footprint terrain unavailable: {result.terrain.reason}
              </p>
            )}
            <p className="muted">
              Terrain shadow screening:{" "}
              {result.horizon.available
                ? result.horizon.method
                : result.horizon.reason}
            </p>
            {result.observer_height?.available && (
              <p className="muted">
                Observer elevation used for visibility:{" "}
                {num(result.observer_height.value, " m")} ·{" "}
                {result.observer_height.source?.name}. This does not establish
                fine-footprint terrain coverage.
              </p>
            )}
            {result.terrain.grid.length > 0 && (
              <details className="explanation">
                <summary>Local terrain layer: slope / elevation</summary>
                <label>
                  Terrain layer
                  <select
                    value={mapLayer}
                    onChange={(e) =>
                      setMapLayer(e.target.value as "slope" | "elevation")
                    }
                  >
                    <option value="slope">Slope (0° blue → 30° red)</option>
                    <option value="elevation">
                      Elevation (local minimum blue → maximum red)
                    </option>
                  </select>
                </label>
                <svg
                  className="research-terrain"
                  viewBox="-110 -110 220 220"
                  role="img"
                  aria-label="Measured local terrain grid, projected grid +Y up, selected point at centre"
                >
                  {result.terrain.grid.map((p, i) => {
                    const zs = result.terrain.grid.map((g) => g.elevation_m);
                    const value =
                      mapLayer === "slope"
                        ? p.slope_deg / 30
                        : (p.elevation_m - Math.min(...zs)) /
                          (Math.max(...zs) - Math.min(...zs) || 1);
                    return (
                      <rect
                        key={i}
                        x={
                          (p.east_m / (result.terrain.radius_m || 100)) * 100 -
                          4
                        }
                        y={
                          (-p.north_m / (result.terrain.radius_m || 100)) *
                            100 -
                          4
                        }
                        width="8"
                        height="8"
                        fill={`hsl(${220 - 220 * Math.min(1, Math.max(0, value))} 65% 50%)`}
                      >
                        <title>
                          {num(p.elevation_m, " m")} / {num(p.slope_deg, "°")}
                        </title>
                      </rect>
                    );
                  })}
                  <circle r="2" fill="white" />
                  <text x="0" y="-103" fill="white" fontSize="8">
                    +Y
                  </text>
                </svg>
                <p className="muted">
                  The white dot marks the selected point. In slope view, warmer colors indicate steeper
                  ground. In elevation view, warmer colors indicate higher ground within this window.
                  Each square represents a plotted sample of the elevation model.
                </p>
              </details>
            )}
            {result.geometry.available && (
              <>
                <h3>Horizons surface geometry</h3>
                <p className="muted">
                  Time runs left to right. Solid lines show the Sun and Earth’s elevation in degrees.
                  Dashed lines show the terrain threshold where coverage is available.
                  A body is visible at a sample when its solid line is above its matching threshold.
                </p>
                <div className="research-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.geometry.series}>
                      <CartesianGrid stroke="#29414a" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(s) => s.slice(5, 16)}
                        minTickGap={65}
                      />
                      <YAxis unit="°" />
                      <Tooltip />
                      <Line
                        dataKey="sun_elevation"
                        name="Sun elevation (°)"
                        stroke="#e7c980"
                        dot={false}
                      />
                      <Line
                        dataKey="earth_elevation"
                        name="Earth elevation (°)"
                        stroke="#89bbdc"
                        dot={false}
                      />
                      <Line
                        dataKey="sun_horizon_deg"
                        name="Sun terrain horizon (°)"
                        stroke="#e2bf72"
                        strokeDasharray="4 3"
                        dot={false}
                      />
                      <Line
                        dataKey="earth_horizon_deg"
                        name="Earth terrain horizon + clearance (°)"
                        stroke="#b0a0d8"
                        strokeDasharray="4 3"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <label>
                  Observation sample
                  <input
                    aria-label="Surface observation sample"
                    type="range"
                    min="0"
                    max={(result.geometry.series?.length || 1) - 1}
                    value={sample}
                    onChange={(e) => setSample(+e.target.value)}
                  />
                </label>
                {current && (
                  <p>
                    {current.time}
                    <br />
                    Sun azimuth/elevation: {num(
                      current.sun_azimuth,
                      "°",
                    )} / {num(current.sun_elevation, "°")} · Earth:{" "}
                    {num(current.earth_azimuth, "°")} /{" "}
                    {num(current.earth_elevation, "°")}
                    <br />
                    Earth range: {num(current.earth_distance_km, " km")} ·
                    One-way down-leg light-time:{" "}
                    {num(current.earth_light_time_seconds, " s")}
                  </p>
                )}
                <details className="explanation">
                  <summary>
                    Sunlight, darkness and Earth visibility intervals (UTC)
                  </summary>
                  {[
                    ["Sunlight", result.geometry.sunlight_windows],
                    ["Darkness", result.geometry.metrics?.darkness_windows],
                    ["Earth visible", result.geometry.earth_windows],
                    [
                      "Earth blackout",
                      result.geometry.metrics?.blackout_windows,
                    ],
                  ].map(([label, spans]) => (
                    <div key={label as string}>
                      <h4>{label as string}</h4>
                      {((spans as Span[]) || []).length ? (
                        (spans as Span[]).map((s) => (
                          <p key={s.start}>
                            {s.start} → {s.end} · {num(s.hours, " h")}
                          </p>
                        ))
                      ) : (
                        <p>No intervals in this sampled period.</p>
                      )}
                    </div>
                  ))}
                </details>
              </>
            )}
            <h3>LROC surface inspection</h3>
            <p className="muted">
              NAC south-pole mosaic: native 1 m/pixel, acquired 23 July–11
              December 2010; uncontrolled image registration. Preview spans 4 km
              (7.8 m per displayed pixel), projected grid +Y up. It cannot
              resolve or certify all boulders. PSR imagery is context, not an
              ice-abundance or hazard score.
            </p>
            <div className="astro-camera-controls">
              <button
                className="button subtle"
                disabled={result.mission.latitude > -85.5}
                onClick={() => {
                  setImagery("nac");
                  setImageError(false);
                }}
              >
                Load LROC regional image
              </button>
              <button
                className="button subtle"
                disabled={result.mission.latitude > -85.5}
                onClick={() => {
                  setImagery("psr");
                  setImageError(false);
                }}
              >
                Inspect PSR imagery
              </button>
              <a
                href="https://quickmap.lroc.im-ldi.com/"
                target="_blank"
                rel="noreferrer"
              >
                Open LROC QuickMap
              </a>
            </div>
            {imagery && !imageError && (
              <figure>
                <img
                  className="research-image"
                  src={`/api/research/imagery?latitude=${result.mission.latitude}&longitude=${result.mission.longitude}&layer=${imagery}`}
                  alt={`LROC ${imagery} image centred on ${result.mission.name}. Dark or blank areas do not imply hazard-free terrain.`}
                  onError={() => setImageError(true)}
                />
                <figcaption>
                  NASA/GSFC/LROC · centre {result.mission.latitude}°,{" "}
                  {result.mission.longitude}° · 4 km square; no automatic hazard
                  detections.
                </figcaption>
              </figure>
            )}
            {imageError && (
              <p className="info">
                LROC preview unavailable. Use QuickMap and enter the coordinates
                above.
              </p>
            )}
          </>
        )}
        <LandingReliability
          mission={result?.mission ?? mission}
          limits={limits}
          onSelect={onSelect}
          onAddComparison={onAddComparison}
        />
        <details className="explanation">
          <summary>Dataset availability and activation</summary>
          <p>
            Large scientific files are downloaded and processed offline once.
            Clicks read bounded local windows. New regional files can be
            registered without changing the UI.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Status / resolution</th>
                  <th>Observation period / quality</th>
                </tr>
              </thead>
              <tbody>
                {catalog?.datasets.map((d) => (
                  <tr key={d.kind}>
                    <td>
                      <a href={d.source_url} target="_blank" rel="noreferrer">
                        {d.name}
                      </a>
                    </td>
                    <td>
                      {d.status} · {num(d.resolution_m, " m")}
                    </td>
                    <td>
                      {d.observation_period || "Not supplied"}
                      <br />
                      {d.quality || d.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Preparation command: <code>{catalog?.preparation_command}</code>
          </p>
          <a
            href={
              catalog?.documentation_url ||
              "https://github.com/xiangen-coder/nasa"
            }
            target="_blank"
            rel="noreferrer"
          >
            Dataset setup, scoring methods and limitations
          </a>
        </details>
      </div>
    </section>
  );
}
