import type { Mission, Site } from "../app/types";
import type { Research } from "../components/LandingResearch";
import type { ResearchPriority } from "../components/SearchConsole";
import { solarEnergy, validSolar, type SolarSettings } from "../components/mission-lab/scenario-science";
import { comparisonRadiusKm, inComparisonArea, siteKey } from "../components/ComparisonPicker";
import type { ResearchArea } from "./research-area";

const day = 86_400_000;
const ephemerisEnd = Date.UTC(2053, 0, 1) - 1000;
export type PlanBMode = "delay" | "relocate" | "both";
export type PlanBWindow = "month" | "year" | "custom";
export type TerrainBounds = Partial<Record<"slope_mean_deg" | "slope_max_deg" | "roughness_m" | "relief_m", number>>;
export type PlanBSite = { location: Site; bounds?: TerrainBounds; screening_radius_m?: number; shadow_distance_m?: number | null };
export type PlanBShortlist = {
  candidates: PlanBSite[];
  exploration_candidates?: PlanBSite[];
  comparison_candidates?: PlanBSite[];
  searched: number;
  overlap_excluded: number;
  outside_or_missing: number;
  failed_limits: number;
  passing_terrain_candidates: number;
};
type Rejection = { status: "missing" | "limits" | "unavailable"; reasons: string[] };
export type PlanBAssessment = Rejection | { status: "evaluated"; result: Research };
export type PlanBOption = PlanBSite & { result: Research; energy: number };
export type PlanBForecast = PlanBSite & { result: Research; energy?: number; reasons: string[] };

export function latestTouchdown(mission: Mission) {
  return ephemerisEnd - (Date.parse(mission.end) - Date.parse(mission.start));
}

export function calendarEnd(start: number, window: Exclude<PlanBWindow, "custom">) {
  const date = new Date(start);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + (window === "month" ? 1 : 12);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(last, date.getUTCDate()))).toISOString().slice(0, 10);
}

export function searchDates(mission: Mission, window: PlanBWindow, custom: string, time: string) {
  const start = Date.parse(mission.start);
  const endDate = window === "custom" ? custom : calendarEnd(start, window);
  const originalTime = new Date(start).toISOString().slice(11, 23);
  const utcTime = time ? (time.length === 5 ? `${time}:00` : time) : originalTime;
  const end = Date.parse(`${endDate}T${utcTime}Z`);
  const limit = latestTouchdown(mission);
  if (!Number.isFinite(end) || end <= start)
    throw Error("Choose an end date and UTC time after the original touchdown.");
  if (window === "custom" && end > limit)
    throw Error("Choose an earlier end date so the full mission stays within ephemeris coverage through 2052.");
  let first = Date.parse(`${new Date(start).toISOString().slice(0, 10)}T${utcTime}Z`);
  if (first <= start) first += day;
  const count = Math.floor((Math.min(end, limit) - first) / day) + 1;
  if (count < 1) throw Error("There are no later touchdown times within the supported range.");
  return { first, count, clipped: end > limit };
}

export function sampledDays(count: number, budget: number) {
  if (count <= budget) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: budget }, (_, i) => {
    if (i === 0) return 0;
    return 1 + Math.round((count - 2) * (i - 1) / (budget - 2));
  });
}

export function refinementDays(coarse: number[], seeds: number[]) {
  const days = new Set<number>();
  for (const seed of seeds) {
    const index = coarse.indexOf(seed);
    for (const neighbor of [coarse[index - 1], coarse[index + 1]]) {
      if (neighbor === undefined || Math.abs(neighbor - seed) <= 1) continue;
      days.add(Math.floor((neighbor + seed) / 2));
      days.add(seed + Math.sign(neighbor - seed));
    }
  }
  return [...days].sort((a, b) => a - b).slice(0, 6);
}

export function candidateMission(original: Mission, site: Site, touchdown: number): Mission {
  const duration = Date.parse(original.end) - Date.parse(original.start);
  return {
    latitude: site.latitude, longitude: site.longitude, name: site.name,
    interval_minutes: original.interval_minutes, clearance_deg: original.clearance_deg,
    start: new Date(touchdown).toISOString(),
    end: new Date(touchdown + duration).toISOString(),
  };
}

export function sameMission(a: Mission, b: Mission) {
  return a.latitude === b.latitude && a.longitude === b.longitude &&
    Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end) &&
    a.interval_minutes === b.interval_minutes && a.clearance_deg === b.clearance_deg;
}

export function missionKey(mission: Mission) {
  return JSON.stringify([
    mission.latitude, mission.longitude, Date.parse(mission.start), Date.parse(mission.end),
    mission.interval_minutes, mission.clearance_deg,
  ]);
}

export function solarEstimate(result: Research, equipment: SolarSettings) {
  const rows = result.geometry.series;
  if (!result.geometry.available || !rows || rows.length < 2 ||
      Date.parse(rows[0].time) !== Date.parse(result.mission.start) ||
      Date.parse(rows[rows.length - 1].time) !== Date.parse(result.mission.end) ||
      rows.some((row) => typeof row.sun_visible !== "boolean" ||
        !Number.isFinite(row.sun_elevation) || !Number.isFinite(row.sun_azimuth))) return null;
  return solarEnergy({ mission: result.mission, series: rows }, equipment);
}

export function comparableScores(original: Research, candidate: Research) {
  return original.available_weight === candidate.available_weight &&
    comparableVisibility(original, candidate) &&
    Object.entries(original.factors).every(([key, factor]) => {
      const other = candidate.factors[key];
      return other && (factor.score == null) === (other.score == null) && factor.quality === other.quality &&
        factor.source?.resolution_m === other.source?.resolution_m;
    }) && comparableTerrain(original, candidate);
}

export function comparableVisibility(original: Research, candidate: Research) {
  return original.geometry.available && candidate.geometry.available &&
    original.geometry.mode === candidate.geometry.mode &&
    original.horizon.source?.name === candidate.horizon.source?.name &&
    original.horizon.source?.resolution_m === candidate.horizon.source?.resolution_m;
}

export function comparableTerrain(original: Research, candidate: Research) {
  return original.terrain.available && candidate.terrain.available &&
    original.terrain.coverage_type === candidate.terrain.coverage_type &&
    original.terrain.resolution_m === candidate.terrain.resolution_m &&
    original.terrain.radius_m === candidate.terrain.radius_m;
}

export function rankOptions(options: PlanBOption[], priority: ResearchPriority, mode: PlanBMode) {
  const common = Object.keys(options[0]?.result.factors ?? {}).filter((key) =>
    options.every(({ result }) => result.factors[key]?.score != null));
  const score = (result: Research) => {
    if (priority !== "overall") return result.factors[priority]?.score ?? -1;
    const weight = common.reduce((total, key) => total + result.factors[key].weight, 0);
    return weight > 0
      ? common.reduce((total, key) => total + result.factors[key].score! * result.factors[key].weight, 0) / weight
      : result.score ?? -1;
  };
  return [...options].sort((a, b) =>
    (mode === "relocate" ? 0 : Date.parse(a.result.mission.start) - Date.parse(b.result.mission.start)) ||
    (priority === "I" && mode !== "delay" ? (a.shadow_distance_m ?? Infinity) - (b.shadow_distance_m ?? Infinity) : 0) ||
    score(b.result) - score(a.result));
}

export const touchdownAt = (first: number, index: number) => first + index * day;

export type PlanBProgress = {
  evaluated: number;
  unavailable: number;
  limits: number;
  missing: number;
  skipped: number;
  scheduled: number;
  sampled: boolean;
  clipped: boolean;
  shortlist?: PlanBShortlist;
  reasons: string[];
  options: PlanBOption[];
  forecasts: PlanBForecast[];
  forecastsUnavailable: number;
  stage: string;
};

const responseCache = new Map<string, { data: unknown; expires: number }>();

async function planBRequest<T>(path: string, body: unknown, signal: AbortSignal, cacheable: (data: T) => boolean) {
  signal.throwIfAborted();
  const payload = JSON.stringify(body);
  const key = path + payload;
  const cached = responseCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data as T;
  const response = await fetch(path, {
    method: "POST", body: payload, headers: { "Content-Type": "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(145_000)]),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw Error(typeof error?.detail === "string" ? error.detail : `Assessment request failed (${response.status}).`);
  }
  const data: T = await response.json();
  if (cacheable(data)) {
    responseCache.delete(key);
    if (responseCache.size >= 60) responseCache.delete(responseCache.keys().next().value!);
    responseCache.set(key, { data, expires: Date.now() + 15 * 60_000 });
  }
  return data;
}

export const initialProgress: PlanBProgress = {
  evaluated: 0, unavailable: 0, limits: 0, missing: 0, skipped: 0, scheduled: 0,
  sampled: false, clipped: false, reasons: [], options: [], forecasts: [], forecastsUnavailable: 0, stage: "",
};

export async function findPlanB({
  original, area, mode, dates, equipment, priority, signal, update, excludedSites = new Set<string>(),
}: {
  original: Research;
  area?: ResearchArea;
  mode: PlanBMode;
  dates: ReturnType<typeof searchDates>;
  equipment: SolarSettings;
  priority: ResearchPriority;
  signal: AbortSignal;
  excludedSites?: ReadonlySet<string>;
  update: (progress: PlanBProgress) => void;
}) {
  if (!validSolar(equipment)) throw Error("Review the original mission’s solar and battery settings.");
  const mission = original.mission;
  const limits = original.limits;
  let locations: PlanBSite[] = [{ location: mission }];
  const exploration = new Map<PlanBSite, string[]>();
  const progress = { ...initialProgress, clipped: dates.clipped };
  const report = (stage: string) => update({ ...progress, stage });
  const addReasons = (reasons: string[]) => {
    progress.reasons = [...new Set([...progress.reasons, ...reasons])].slice(0, 12);
  };

  if (mode !== "delay") {
    const centre = area?.centre ?? mission;
    const radiusKm = area?.radiusKm ?? comparisonRadiusKm;
    const isNewSite = (location: Site) =>
      siteKey(location) !== siteKey(mission) && !excludedSites.has(siteKey(location)) &&
      inComparisonArea(centre, location, radiusKm);
    report(`Screening terrain within ${radiusKm} km…`);
    progress.shortlist = await planBRequest<PlanBShortlist>("/api/reliability/plan-b-sites",
      { mission: centre, limits, search_radius_m: Math.round(radiusKm * 1000), shadow_focus: priority === "I" }, signal, () => true);
    locations = progress.shortlist.candidates.filter(({ location }, index, candidates) =>
      isNewSite(location) &&
      candidates.findIndex((candidate) => siteKey(candidate.location) === siteKey(location)) === index);
    if (priority === "I") {
      for (const site of locations.filter((site) => site.shadow_distance_m == null)) {
        exploration.set(site, ["No mapped shadow target was found in the research area."]);
      }
      locations = locations.filter((site) => site.shadow_distance_m != null);
    }
    for (const site of progress.shortlist.exploration_candidates ?? []) {
      if (isNewSite(site.location))
        exploration.set(site, ["Available terrain supports comparison. Footprint and uncertainty evidence is incomplete."]);
    }
    for (const site of progress.shortlist.comparison_candidates ?? []) {
      if (isNewSite(site.location))
        exploration.set(site, ["Terrain evidence is incomplete for this nearby comparison point."]);
    }
  }

  const coarse = sampledDays(dates.count, mode === "both" ? 6 : 10);
  progress.sampled = coarse.length < dates.count && (locations.length > 0 || exploration.size > 0);
  progress.scheduled = coarse.length * locations.length;
  const blocked = new Map<PlanBSite, string[]>();
  const seeds = new Map<PlanBSite, { index: number; energy: number; score: number; viable: boolean }[]>();

  async function evaluate(site: PlanBSite, index: number) {
    signal.throwIfAborted();
    if (blocked.has(site)) {
      progress.skipped++;
      report("Applying site-wide screening…");
      return;
    }
    const candidate = candidateMission(mission, site.location, touchdownAt(dates.first, index));
    report(`Checking ${candidate.name} · ${candidate.start.slice(0, 10)} UTC…`);
    try {
      const assessment = await planBRequest<PlanBAssessment>("/api/research/plan-b", { mission: candidate, limits }, signal,
        (data) => data.status !== "unavailable");
      signal.throwIfAborted();
      if (assessment.status !== "evaluated") {
        progress[assessment.status]++;
        addReasons(assessment.reasons);
        if (assessment.status !== "unavailable") {
          blocked.set(site, assessment.reasons);
          progress.evaluated++;
        }
      } else {
        const result = assessment.result;
        if (!sameMission(candidate, result.mission)) throw Error("The assessment returned a different mission window or site.");
        const energy = solarEstimate(result, equipment);
        const metrics = result.geometry.metrics;
        progress.evaluated++;
        if (result.constraints_failed.length) {
          progress.limits++;
          addReasons(result.constraints_failed);
        } else if (!energy || result.geometry.mode !== "terrain_screened" || !Number.isFinite(result.geometry.sunlight_hours) ||
                   !Number.isFinite(metrics?.longest_blackout_hours)) {
          progress.missing++;
          addReasons(["Complete terrain-screened Sun and Earth observations are unavailable."]);
        } else {
          const viable = (energy.unmet_kwh ?? 0) <= 1e-8;
          const siteSeeds = seeds.get(site) ?? [];
          const score = priority === "overall" ? result.score : result.factors[priority]?.score;
          siteSeeds.push({ index, energy: energy.total_kwh, score: score ?? -1, viable });
          seeds.set(site, siteSeeds);
          if (!viable) {
            progress.limits++;
            addReasons(["The modeled solar array and battery leave some configured equipment demand unmet."]);
          } else {
            progress.options = [...progress.options, { ...site, result, energy: energy.total_kwh }];
          }
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      progress.unavailable++;
      addReasons([error instanceof Error ? error.message : "An assessment could not be evaluated."]);
    }
    report(progress.stage);
  }

  // Horizons serializes upstream observations. Keep only one candidate request in flight.
  for (const index of coarse) {
    for (const site of locations) await evaluate(site, index);
  }
  if (progress.sampled) {
    const refinements = locations.flatMap((site) => {
      const checked = seeds.get(site) ?? [];
      const earliest = checked.find((seed) => seed.viable);
      const strongest = [...checked].sort((a, b) =>
        Number(b.viable) - Number(a.viable) ||
        (a.viable && b.viable ? b.score - a.score : 0) || b.energy - a.energy)[0];
      const promising = [earliest?.index, strongest?.index].filter((index): index is number => index !== undefined);
      return refinementDays(coarse, promising).map((index) => ({ site, index }));
    }).sort((a, b) => a.index - b.index);
    progress.scheduled += refinements.length;
    for (const { site, index } of refinements) await evaluate(site, index);
  }
  // A site-wide evidence gap still allows a limited outlook for the selected dates.
  const outlookSites = [...blocked, ...exploration];
  const outlookDates = [...new Set([coarse[0], coarse[coarse.length - 1]])];
  progress.scheduled += outlookSites.length * outlookDates.length;
  for (const [site, reasons] of outlookSites) {
    for (const index of outlookDates) {
      signal.throwIfAborted();
      const candidate = candidateMission(mission, site.location, touchdownAt(dates.first, index));
      report(`Forecasting ${candidate.name} · ${candidate.start.slice(0, 10)} UTC…`);
      try {
        const result = await planBRequest<Research>("/api/research/evaluate", { mission: candidate, limits }, signal,
          (data) => data.geometry.available);
        signal.throwIfAborted();
        if (!sameMission(candidate, result.mission)) throw Error("The forecast returned a different site or mission window.");
        if (!result.geometry.available) throw Error(result.geometry.reason || "Future visibility is unavailable for this window.");
        const energy = solarEstimate(result, equipment)?.total_kwh;
        progress.forecasts = [...progress.forecasts, { ...site, result, energy, reasons }];
      } catch (error) {
        signal.throwIfAborted();
        progress.forecastsUnavailable++;
        addReasons([error instanceof Error ? error.message : "An outlook could not be calculated."]);
      }
      report(progress.stage);
    }
  }
  signal.throwIfAborted();
  report("");
}
