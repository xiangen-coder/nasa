import type { Analysis, Mission, Row, Window } from "../../app/types";

export type SolarSettings = {
  area_m2: number;
  efficiency_pct: number;
  tracking: boolean;
  tilt_deg: number;
  azimuth_deg: number;
  irradiance_wm2: number;
  loss_pct: number;
  demand_enabled: boolean;
  demand_w: number;
  battery_kwh: number;
  initial_soc_pct: number;
  charge_efficiency_pct: number;
  discharge_efficiency_pct: number;
};
export const defaultSolar: SolarSettings = {
  area_m2: 4,
  efficiency_pct: 25,
  tracking: true,
  tilt_deg: 90,
  azimuth_deg: 0,
  irradiance_wm2: 1361,
  loss_pct: 10,
  demand_enabled: false,
  demand_w: 200,
  battery_kwh: 2,
  initial_soc_pct: 100,
  charge_efficiency_pct: 95,
  discharge_efficiency_pct: 95,
};
export function validSolar(s: SolarSettings): boolean {
  if (
    !s ||
    typeof s.tracking !== "boolean" ||
    typeof s.demand_enabled !== "boolean"
  )
    return false;
  const bounds: [keyof SolarSettings, number, number][] = [
    ["area_m2", 0.01, 10000],
    ["efficiency_pct", 0.1, 100],
    ["tilt_deg", 0, 180],
    ["azimuth_deg", 0, 360],
    ["irradiance_wm2", 1, 2000],
    ["loss_pct", 0, 100],
    ["demand_w", 0, 1000000],
    ["battery_kwh", 0, 100000],
    ["initial_soc_pct", 0, 100],
    ["charge_efficiency_pct", 0.1, 100],
    ["discharge_efficiency_pct", 0.1, 100],
  ];
  return bounds.every(
    ([key, min, max]) =>
      typeof s[key] === "number" &&
      Number.isFinite(s[key]) &&
      Number(s[key]) >= min &&
      Number(s[key]) <= max,
  );
}
export function missionError(m: Mission): string {
  if (!m || typeof m !== "object") return "Mission settings are missing.";
  const start = Date.parse(m.start),
    end = Date.parse(m.end),
    duration = end - start;
  if (
    !m.name?.trim() ||
    m.name.length > 100 ||
    !Number.isFinite(m.latitude) ||
    Math.abs(m.latitude) > 90 ||
    !Number.isFinite(m.longitude) ||
    Math.abs(m.longitude) > 180
  )
    return "Enter a name and valid coordinates.";
  if (!Number.isFinite(duration) || duration <= 0 || duration > 31 * 86400000)
    return "Choose a mission longer than zero and no longer than 31 days.";
  if (
    start < Date.parse("1901-01-01T00:00:00Z") ||
    end >= Date.parse("2053-01-01T00:00:00Z")
  )
    return "Dates must lie within 1901–2052.";
  if (
    !Number.isInteger(m.interval_minutes) ||
    m.interval_minutes < 5 ||
    m.interval_minutes > 1440 ||
    duration / (m.interval_minutes * 60000) > 2000
  )
    return "Use a 5–1440 minute step with no more than 2000 intervals.";
  if (
    !Number.isFinite(m.clearance_deg) ||
    m.clearance_deg < 0 ||
    m.clearance_deg > 20
  )
    return "Earth clearance must be between 0° and 20°.";
  return "";
}
const rad = (deg: number) => (deg * Math.PI) / 180;
type SolarRow = Pick<Row, "time" | "sun_visible" | "sun_elevation" | "sun_azimuth">;
export function panelPower(row: SolarRow, s: SolarSettings): number {
  if (!row.sun_visible) return 0;
  // Local ENU frame: azimuth clockwise from north; tilt of normal from zenith.
  const incidence = s.tracking
    ? 1
    : Math.max(
        0,
        Math.cos(rad(s.tilt_deg)) * Math.sin(rad(row.sun_elevation)) +
          Math.sin(rad(s.tilt_deg)) *
            Math.cos(rad(row.sun_elevation)) *
            Math.cos(rad(row.sun_azimuth - s.azimuth_deg)),
      );
  return (
    ((s.irradiance_wm2 * s.area_m2 * s.efficiency_pct) / 100) *
    (1 - s.loss_pct / 100) *
    incidence
  );
}
export type EnergySample = {
  time: string;
  power_w: number;
  demand_w: number;
  battery_kwh: number | null;
  soc_pct: number | null;
  unmet_kwh: number;
};
export function solarEnergy(a: { mission: Analysis["mission"]; series: SolarRow[] }, s: SolarSettings) {
  if (!validSolar(s)) throw Error("Invalid solar or battery assumptions.");
  let battery = (s.battery_kwh * s.initial_soc_pct) / 100,
    total = 0,
    unmet = 0,
    curtailed = 0;
  const samples: EnergySample[] = a.series.map((row, i) => {
    // State at this timestamp; previous left-endpoint sample drives this interval.
    if (i > 0) {
      const hours =
        (Date.parse(row.time) - Date.parse(a.series[i - 1].time)) / 3600000;
      if (!Number.isFinite(hours) || hours <= 0)
        throw Error("Analysis timestamps must increase.");
      const generated = (panelPower(a.series[i - 1], s) * hours) / 1000;
      total += generated;
      if (s.demand_enabled) {
        const net = generated - (s.demand_w * hours) / 1000;
        if (net >= 0) {
          const stored = Math.min(
            s.battery_kwh - battery,
            (net * s.charge_efficiency_pct) / 100,
          );
          battery += stored;
          curtailed += net - stored / (s.charge_efficiency_pct / 100);
        } else {
          const supplied = Math.min(
            -net,
            (battery * s.discharge_efficiency_pct) / 100,
          );
          battery -= supplied / (s.discharge_efficiency_pct / 100);
          unmet += -net - supplied;
        }
        battery = Math.max(0, Math.min(s.battery_kwh, battery));
      }
    }
    return {
      time: row.time,
      power_w: panelPower(row, s),
      demand_w: s.demand_enabled ? s.demand_w : 0,
      battery_kwh: s.demand_enabled ? battery : null,
      soc_pct:
        s.demand_enabled && s.battery_kwh > 0
          ? (battery / s.battery_kwh) * 100
          : null,
      unmet_kwh: unmet,
    };
  });
  const days =
    (Date.parse(a.mission.end) - Date.parse(a.mission.start)) / 86400000;
  return {
    total_kwh: total,
    daily_kwh: total / days,
    unmet_kwh: s.demand_enabled ? unmet : null,
    curtailed_kwh: curtailed,
    samples,
  };
}
export type Energy = ReturnType<typeof solarEnergy>;
export function threshold(a: Analysis, row: Row, body: "sun" | "earth") {
  const horizon = a.terrain.available ? a.terrain.horizon : null;
  let obstruction = 0;
  if (horizon?.length) {
    const az = ((row[`${body}_azimuth`] % 360) + 360) % 360;
    const points = [
      ...horizon,
      { azimuth: 360, elevation: horizon[0].elevation },
    ];
    const upper = points.findIndex((p) => p.azimuth > az);
    if (upper > 0) {
      const lo = points[upper - 1],
        hi = points[upper];
      obstruction =
        lo.elevation +
        ((hi.elevation - lo.elevation) * (az - lo.azimuth)) /
          (hi.azimuth - lo.azimuth);
    } else obstruction = horizon[0].elevation;
  }
  return obstruction + (body === "earth" ? a.mission.clearance_deg : 0);
}
export function unavailableWindows(
  a: Analysis,
  body: "sun" | "earth",
): Window[] {
  const windows: Window[] = [];
  for (let i = 0; i < a.series.length - 1; i++) {
    const row = a.series[i],
      end = a.series[i + 1].time;
    if (row[`${body}_visible`]) continue;
    const last = windows[windows.length - 1];
    if (last?.end === row.time) {
      last.end = end;
      last.hours = (Date.parse(end) - Date.parse(last.start)) / 3600000;
    } else
      windows.push({
        start: row.time,
        end,
        hours: (Date.parse(end) - Date.parse(row.time)) / 3600000,
      });
  }
  return windows;
}
export type Difference = {
  changes: string[];
  statements: string[];
  evidence: {
    body: "sun" | "earth";
    start: string;
    end: string;
    text: string;
  }[];
};
export function explainDifference(base: Analysis, next: Analysis): Difference {
  const changes: string[] = [],
    statements: string[] = [],
    evidence: Difference["evidence"] = [];
  const b = base.mission,
    n = next.mission;
  if (b.latitude !== n.latitude || b.longitude !== n.longitude)
    changes.push("Coordinates changed; observer geometry differs.");
  if (Date.parse(b.start) !== Date.parse(n.start))
    changes.push(
      "Landing date changed; the sampled geometry covers a different UTC window.",
    );
  if (
    Date.parse(b.end) - Date.parse(b.start) !==
    Date.parse(n.end) - Date.parse(n.start)
  )
    changes.push(
      "Stay durations differ; compare daily energy as well as totals.",
    );
  if (b.interval_minutes !== n.interval_minutes)
    changes.push(
      "Sampling steps differ; short windows may be resolved differently.",
    );
  if (b.clearance_deg !== n.clearance_deg)
    changes.push("Earth clearance threshold changed.");
  if (base.mode !== next.mode)
    changes.push(
      "Terrain coverage differs; a combined weighted ranking is unavailable.",
    );
  for (const body of ["sun", "earth"] as const) {
    const field = body === "sun" ? "sun_visible_pct" : "earth_visible_pct";
    const delta = next.metrics[field] - base.metrics[field];
    statements.push(
      `${body === "sun" ? "Sun" : "Earth"} visibility: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} percentage points against baseline.`,
    );
    const windows = unavailableWindows(next, body).sort(
      (x, y) => y.hours - x.hours,
    );
    const longest = windows[0];
    if (longest)
      evidence.push({
        body,
        start: longest.start,
        end: longest.end,
        text: `${body === "sun" ? "Sun" : "Earth"} is unavailable from ${longest.start} to ${longest.end} (${longest.hours.toFixed(2)} h) in this scenario.`,
      });
    const near = next.series.filter(
      (r) => Math.abs(r[`${body}_elevation`] - threshold(next, r, body)) <= 0.5,
    );
    if (near.length)
      statements.push(
        `${near.length} ${body === "sun" ? "Sun" : "Earth"} samples lie within 0.5° of the applicable threshold. Small angular changes may change visibility flags.`,
      );
  }
  statements.push(
    `Transitions are sampled, uncertain by up to ${n.interval_minutes} minutes per boundary. Recalculate more finely to check sensitivity; no unique physical cause is inferred from percentages alone.`,
  );
  if (!next.terrain.available)
    statements.push(
      "Local terrain shadows are unmodelled; these differences cannot be attributed to a specific crater or ridge.",
    );
  return {
    changes: changes.length
      ? changes
      : ["Scientific mission inputs are unchanged."],
    statements,
    evidence,
  };
}
