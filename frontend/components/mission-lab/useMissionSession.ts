"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, Comparison, Mission, Site } from "../../app/types";
import {
  defaultSolar,
  missionError,
  solarEnergy,
  validSolar,
  type SolarSettings,
} from "./scenario-science";
export type ExperienceMode = "professional" | "education";
export type Weights = { sunlight: number; earth: number; simultaneous: number };
export type ComparisonMode = "locations" | "dates" | "options";
export type ScenarioPlan = {
  id: string;
  mission: Mission;
  solar: SolarSettings;
};
export type ScenarioSnapshot = {
  mode: ComparisonMode;
  equalDuration: boolean;
  baseline: string;
  plans: ScenarioPlan[];
};
export const pointKey = (s: Site) =>
  `${s.latitude.toFixed(6)},${Math.abs(s.latitude) === 90 ? 0 : ((((s.longitude + 180) % 360) + 360) % 360).toFixed(6)}`;
export const calculationKey = (m: Mission) =>
  JSON.stringify([
    m.latitude,
    m.longitude,
    m.name,
    Date.parse(m.start),
    Date.parse(m.end),
    m.interval_minutes,
    m.clearance_deg,
  ]);
export const validSite = (s: Site) =>
  typeof s?.name === "string" &&
  s.name.length <= 100 &&
  Number.isFinite(s.latitude) &&
  Math.abs(s.latitude) <= 90 &&
  Number.isFinite(s.longitude) &&
  Math.abs(s.longitude) <= 180;
export function validSnapshot(s: ScenarioSnapshot): boolean {
  return (
    !!s &&
    ["locations", "dates", "options"].includes(s.mode) &&
    typeof s.equalDuration === "boolean" &&
    typeof s.baseline === "string" &&
    Array.isArray(s.plans) &&
    s.plans.length >= 1 &&
    s.plans.length <= 3 &&
    s.plans.every(
      (p) =>
        !!p &&
        typeof p.id === "string" &&
        !missionError(p.mission) &&
        validSolar(p.solar),
    ) &&
    s.plans[0].id === "primary" &&
    new Set(s.plans.map((p) => p.id)).size === s.plans.length &&
    s.plans.some((p) => p.id === s.baseline)
  );
}
export function effectiveMission(
  base: Mission,
  saved: Mission,
  mode: ComparisonMode,
  equal: boolean,
): Mission {
  const m =
    mode === "locations"
      ? {
          ...base,
          name: saved.name,
          latitude: saved.latitude,
          longitude: saved.longitude,
        }
      : mode === "dates"
        ? {
            ...saved,
            name: base.name,
            latitude: base.latitude,
            longitude: base.longitude,
          }
        : { ...saved };
  if (
    mode !== "locations" &&
    equal &&
    Number.isFinite(Date.parse(m.start)) &&
    Number.isFinite(Date.parse(base.end) - Date.parse(base.start))
  )
    m.end = new Date(
      Date.parse(m.start) + Date.parse(base.end) - Date.parse(base.start),
    ).toISOString();
  return m;
}
export function useMissionSession(mission: Mission, weights: Weights) {
  const [mode, setMode] = useState<ComparisonMode>("locations"),
    [equalDuration, setEqualDuration] = useState(true);
  const [alternatives, setAlternatives] = useState<ScenarioPlan[]>([]);
  const [solar, setSolar] = useState<SolarSettings>(defaultSolar),
    [primaryInterval, setPrimaryInterval] = useState<number | null>(null);
  const [precision, setPrecision] = useState<Record<string, number>>({});
  const [baseline, setBaseline] = useState("primary"),
    [records, setRecords] = useState<Record<string, Analysis>>({});
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [pending, setPending] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const requests = useRef(
    new Map<
      string,
      { controller: AbortController; promise: Promise<Analysis | null> }
    >(),
  );
  const cache = useRef<Record<string, Analysis>>({});
  const primary = {
    ...mission,
    interval_minutes: primaryInterval ?? mission.interval_minutes,
  };
  const plans: ScenarioPlan[] = [
    { id: "primary", mission: primary, solar },
    ...alternatives.map((p) => {
      const m = effectiveMission(primary, p.mission, mode, equalDuration);
      return {
        ...p,
        mission: {
          ...m,
          interval_minutes: precision[p.id] ?? m.interval_minutes,
        },
      };
    }),
  ];
  const entries = useMemo(
    () =>
      plans.map((plan) => {
        const key = calculationKey(plan.mission),
          analysis = records[key],
          inputError = missionError(plan.mission);
        return {
          ...plan,
          site: plan.mission,
          key,
          analysis: inputError ? undefined : analysis,
          error: inputError || errors[key],
          energy:
            analysis && !inputError
              ? solarEnergy(analysis, plan.solar)
              : undefined,
          stale: !analysis && Object.keys(records).length > 0,
        };
      }),
    [JSON.stringify(plans), records, errors],
  );
  const current = useRef({ plans, mode });
  current.current = { plans, mode };
  useEffect(
    () => () => {
      requests.current.forEach((r) => r.controller.abort());
    },
    [],
  );
  useEffect(() => {
    setPrimaryInterval(null);
    setPrecision({});
  }, [mission.interval_minutes]);
  // Obsolete responses remain isolated by their full geometry key and never replace current inputs.
  const seed = (a: Analysis) => {
    const key = calculationKey(a.mission);
    cache.current[key] = a;
    setRecords((old) => ({ ...old, [key]: a }));
  };
  const evaluateMission = (body: Mission): Promise<Analysis | null> => {
    const key = calculationKey(body),
      invalid = missionError(body);
    if (invalid) {
      setErrors((old) => ({ ...old, [key]: invalid }));
      return Promise.resolve(null);
    }
    if (cache.current[key]) return Promise.resolve(cache.current[key]);
    const running = requests.current.get(key);
    if (running) return running.promise;
    const controller = new AbortController();
    setPending((old) => [...old, key]);
    setErrors((old) => ({ ...old, [key]: "" }));
    const timer = setTimeout(() => controller.abort(), 145000);
    const promise = fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          let detail = `Calculation unavailable (${r.status})`;
          try {
            const e = await r.json();
            detail =
              typeof e.detail === "string"
                ? e.detail
                : JSON.stringify(e.detail);
          } catch {}
          throw Error(detail);
        }
        return r.json() as Promise<Analysis>;
      })
      .then((a) => {
        seed(a);
        return a;
      })
      .catch((e: Error) => {
        setErrors((old) => ({
          ...old,
          [key]: controller.signal.aborted
            ? "Calculation cancelled or timed out. Retry this scenario."
            : e.message,
        }));
        return null;
      })
      .finally(() => {
        clearTimeout(timer);
        requests.current.delete(key);
        setPending((old) => old.filter((k) => k !== key));
      });
    requests.current.set(key, { controller, promise });
    return promise;
  };
  const evaluate = (site: Site) => {
    const p = current.current.plans.find(
      (p) =>
        p.id === site.id ||
        calculationKey(p.mission) === calculationKey(site as Mission),
    );
    return evaluateMission(
      p?.mission || {
        ...mission,
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
      },
    );
  };
  const add = (site: Site) => {
    if (!validSite(site)) {
      setMessage("Enter a valid name and coordinates.");
      return false;
    }
    if (current.current.plans.length >= 3) {
      setMessage("Compare up to three scenarios. Remove one first.");
      return false;
    }
    if (
      mode === "locations" &&
      current.current.plans.some((p) => pointKey(p.mission) === pointKey(site))
    ) {
      setMessage("This location is already selected.");
      return false;
    }
    const id = crypto.randomUUID();
    setAlternatives((old) => [
      ...old,
      { id, mission: { ...mission, ...site }, solar: { ...solar } },
    ]);
    setMessage("");
    return true;
  };
  const addDate = () => {
    if (current.current.plans.length >= 3) return;
    const offset = current.current.plans.length * 7 * 86400000;
    if (!Number.isFinite(Date.parse(mission.start))) return;
    const start = new Date(Date.parse(mission.start) + offset).toISOString(),
      end = new Date(Date.parse(mission.end) + offset).toISOString();
    setAlternatives((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        mission: { ...mission, start, end },
        solar: { ...solar },
      },
    ]);
  };
  const removeId = (id: string) => {
    if (id === "primary") return;
    setAlternatives((old) => old.filter((p) => p.id !== id));
    if (baseline === id) setBaseline("primary");
  };
  const remove = (site: Site) => {
    const p = current.current.plans.find(
      (p) => p.id === site.id || pointKey(p.mission) === pointKey(site),
    );
    if (p) removeId(p.id);
  };
  const update = (id: string, patch: Partial<Mission>) => {
    if (id === "primary") {
      if (patch.interval_minutes !== undefined)
        setPrimaryInterval(patch.interval_minutes);
      return;
    }
    if (patch.interval_minutes !== undefined)
      setPrecision((old) => ({ ...old, [id]: patch.interval_minutes! }));
    setAlternatives((old) =>
      old.map((p) =>
        p.id === id
          ? {
              ...p,
              mission: {
                ...effectiveMission(primary, p.mission, mode, equalDuration),
                ...patch,
              },
            }
          : p,
      ),
    );
  };
  const setEquipment = (id: string, settings: SolarSettings) => {
    if (!validSolar(settings)) {
      setMessage("Equipment values are outside the supported limits.");
      return;
    }
    if (id === "primary") setSolar(settings);
    else
      setAlternatives((old) =>
        old.map((p) => (p.id === id ? { ...p, solar: settings } : p)),
      );
  };
  const restore = (sites: Site[], snapshot?: ScenarioSnapshot) => {
    requests.current.forEach((r) => r.controller.abort());
    setPrimaryInterval(null);
    setPrecision(
      snapshot && validSnapshot(snapshot)
        ? Object.fromEntries(
            snapshot.plans
              .slice(1)
              .map((p) => [p.id, p.mission.interval_minutes]),
          )
        : {},
    );
    if (snapshot && validSnapshot(snapshot)) {
      setMode(snapshot.mode);
      setEqualDuration(snapshot.equalDuration);
      setBaseline(snapshot.baseline);
      setSolar(snapshot.plans[0].solar);
      setPrimaryInterval(snapshot.plans[0].mission.interval_minutes);
      setAlternatives(snapshot.plans.slice(1));
    } else {
      setMode("locations");
      setEqualDuration(true);
      setBaseline("primary");
      setSolar(defaultSolar);
      setAlternatives(
        sites
          .filter(validSite)
          .slice(1, 3)
          .map((s) => ({
            id: crypto.randomUUID(),
            mission: { ...mission, ...s },
            solar: { ...defaultSolar },
          })),
      );
    }
    setMessage("");
  };
  const complete = entries.filter(
    (
      e,
    ): e is typeof e & {
      analysis: Analysis;
      energy: NonNullable<typeof e.energy>;
    } => !!e.analysis && !!e.energy,
  );
  let ranking: Comparison | null = null,
    rankingError = "";
  if (complete.length >= 2 && complete.length === entries.length) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total <= 0) rankingError = "At least one weight must be positive.";
    else if (new Set(complete.map((e) => e.analysis.mode)).size > 1)
      rankingError =
        "Terrain coverage differs. Compare raw measurements; a combined ranking is unavailable.";
    else
      ranking = {
        mode: complete[0].analysis.mode,
        explanation:
          "Weighted mean of sunlight, Earth and simultaneous visibility. Energy and terrain are reported separately. Weights change ranking, not calculated geometry. Similar scores have unquantified sampling/frame uncertainty.",
        ranking: complete
          .map((e) => {
            const m = e.analysis.metrics;
            const contributions = {
              sunlight: (m.sun_visible_pct * weights.sunlight) / total,
              earth: (m.earth_visible_pct * weights.earth) / total,
              simultaneous: (m.simultaneous_pct * weights.simultaneous) / total,
            };
            return {
              mission: e.mission,
              metrics: m,
              slope_deg: e.analysis.terrain.slope_deg,
              score: Object.values(contributions).reduce((a, b) => a + b, 0),
              contributions,
            };
          })
          .sort((a, b) => b.score - a.score),
      };
  }
  const finer = (id: string) => {
    const p = plans.find((p) => p.id === id);
    if (!p) return;
    const minutes = Math.max(
      5,
      Math.ceil(
        (Date.parse(p.mission.end) - Date.parse(p.mission.start)) /
          60000 /
          2000,
      ),
      Math.floor(p.mission.interval_minutes / 2),
    );
    if (minutes >= p.mission.interval_minutes) {
      setMessage(
        "Already at the finest step supported for this mission duration.",
      );
      return;
    }
    update(id, { interval_minutes: minutes });
    void evaluateMission({ ...p.mission, interval_minutes: minutes });
  };
  const snapshot: ScenarioSnapshot = { mode, equalDuration, baseline, plans };
  return {
    mission: primary,
    locations: plans.map((p) => ({ ...p.mission, id: p.id })),
    entries,
    pending,
    message,
    setMessage,
    add,
    addDate,
    remove,
    removeId,
    restore,
    update,
    evaluate,
    evaluateMission,
    calculate: () =>
      Promise.all(current.current.plans.map((p) => evaluateMission(p.mission))),
    seed,
    complete,
    busy: entries.some((e) => pending.includes(e.key)),
    stale: Object.keys(records).length > 0 && entries.some((e) => !e.analysis),
    ranking,
    rankingError,
    retryRanking: () => {},
    mode,
    setMode,
    equalDuration,
    setEqualDuration,
    baseline,
    setBaseline,
    solar,
    setEquipment,
    snapshot,
    finer,
    cancel: (key: string) => requests.current.get(key)?.controller.abort(),
  };
}
export type MissionSession = ReturnType<typeof useMissionSession>;
