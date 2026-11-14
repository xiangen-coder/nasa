import type { Mission } from "../app/types";
import type { Research } from "../components/LandingResearch";

export type Activity = { name: string; start: number; end: number; watts: number };
export const powerFields = {
  area: ["Solar panel area", "m²", 0, 10000],
  efficiency: ["Panel efficiency", "%", 0, 100],
  battery: ["Battery capacity", "kWh", 0.001, 100000],
  initial: ["Starting battery charge", "%", 0, 100],
  reserve: ["Battery reserve", "%", 0, 100],
  standby: ["Standby electrical load", "W", 0, 1000000],
  losses: ["System losses", "%", 0, 100],
  chargeEfficiency: ["Charge efficiency", "%", 0.1, 100],
  dischargeEfficiency: ["Discharge efficiency", "%", 0.1, 100],
  irradiance: ["Effective incident irradiance", "W/m²", 0, 2000],
  chargeLimit: ["Charge power limit", "W", 0, 1000000],
  dischargeLimit: ["Discharge power limit", "W", 0, 1000000],
} as const;
export type PowerKey = keyof typeof powerFields;
export type PowerInputs = Record<PowerKey, string>;
export const smallLander: PowerInputs = {
  area: "1.5", efficiency: "28", battery: "2", initial: "90", reserve: "20",
  standby: "45", losses: "10", chargeEfficiency: "95", dischargeEfficiency: "95",
  irradiance: "", chargeLimit: "", dischargeLimit: "",
};
export const optionalLimits = ["chargeLimit", "dischargeLimit"];

export function adaptAssessment(assessment: Research, researchArea?: Mission, resultId?: string) {
  const site = { ...assessment.mission, name: assessment.mission.name?.trim() || "Custom location" };
  const start = Date.parse(site.start);
  const end = Date.parse(site.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start) || !Number.isFinite(site.latitude) ||
      Math.abs(site.latitude) > 90 || !Number.isFinite(site.longitude) || Math.abs(site.longitude) > 180 ||
      !Number.isInteger(site.interval_minutes) || site.interval_minutes <= 0) {
    throw Error("The selected Result has invalid coordinates, dates or sampling settings.");
  }
  if (researchArea && (!Number.isFinite(researchArea.latitude) || Math.abs(researchArea.latitude) > 90 ||
      !Number.isFinite(researchArea.longitude) || Math.abs(researchArea.longitude) > 180)) {
    throw Error("The research area has invalid coordinates.");
  }
  const samples = assessment.geometry.series ?? [];
  const timestamps = samples.map((row) => Date.parse(row.time));
  const complete = assessment.geometry.available && samples.length >= 2 &&
    timestamps[0] === start && timestamps.at(-1) === end &&
    samples.every((row, i) => typeof row.sun_visible === "boolean" &&
      Number.isFinite(timestamps[i]) && (!i || (timestamps[i] > timestamps[i - 1] &&
        timestamps[i] - timestamps[i - 1] <= site.interval_minutes * 60000)));
  return {
    version: 1 as const,
    key: JSON.stringify([site.latitude, site.longitude, site.start, site.end, site.interval_minutes, site.clearance_deg, resultId, assessment.geometry.retrieved_at, researchArea?.name, researchArea?.latitude, researchArea?.longitude]),
    site, researchArea: researchArea ?? site, resultId: resultId ?? assessment.id,
    assessedAt: assessment.assessed_at ?? assessment.geometry.retrieved_at,
    importedAt: new Date().toISOString(), assessment, complete, start, end,
    coordinateMetadata: {
      frame: assessment.terrain.source?.frame ?? assessment.horizon.source?.frame ?? assessment.observer_height?.source?.frame,
      datum: assessment.terrain.source?.reference ?? assessment.observer_height?.source?.reference,
    },
  };
}
export type LabSource = ReturnType<typeof adaptAssessment>;

export function simulatePower(source: LabSource, inputs: PowerInputs, activities: Activity[]) {
  if (!source.complete) throw Error("Open a Result with a complete sunlight timeline for the selected mission window.");
  const power = Object.fromEntries(Object.entries(powerFields).map(([key, [label, , min, max]]) => {
    const raw = inputs[key as PowerKey]?.trim();
    if (!raw && optionalLimits.includes(key)) return [key, Infinity];
    const number = Number(raw);
    if (!raw || !Number.isFinite(number) || number < min || number > max)
      throw Error(`${label} must be between ${min} and ${max}.`);
    return [key, number];
  })) as Record<PowerKey, number>;
  const schedule = [...activities].sort((a, b) => a.start - b.start);
  if (schedule.some((a, i) => !a.name.trim() || ![a.start, a.end, a.watts].every(Number.isFinite) ||
      a.start < 0 || a.end > 24 || a.start >= a.end || a.watts < 0 || a.watts > 1000000 ||
      (i > 0 && a.start < schedule[i - 1].end))) {
    throw Error("Enter named activities with non-overlapping UTC hours between 0 and 24 and valid loads.");
  }
  const dayMs = 86400000;
  const hourMs = 3600000;
  const samples = source.assessment.geometry.series!;
  const reserve = power.battery * power.reserve / 100;
  let battery = power.battery * power.initial / 100;
  let minimum = battery;
  let firstBelow: number | null = battery < reserve ? 0 : null;
  let belowHours = 0;
  let generated = 0;
  let unmet = 0;
  const timeline: { time: string; solar: number; demand: number; charge: number; sunlight: boolean; earth: boolean | null }[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const row = samples[i];
    const end = Date.parse(samples[i + 1].time);
    let time = Date.parse(row.time);
    while (time < end) {
      const day = Math.floor(time / dayMs) * dayMs;
      const hour = (time - day) / hourMs;
      const activity = schedule.find((item) => hour >= item.start && hour < item.end);
      const boundary = activity?.end ?? schedule.find((item) => item.start > hour)?.start ?? 24;
      const stop = Math.min(end, Math.max(time + 1, Math.round(day + boundary * hourMs)));
      const hours = (stop - time) / hourMs;
      const demand = activity?.watts ?? power.standby;
      const solar = row.sun_visible ? power.irradiance * power.area * power.efficiency / 100 * (1 - power.losses / 100) : 0;
      timeline.push({ time: new Date(time).toISOString(), solar, demand, charge: battery / power.battery * 100,
        sunlight: row.sun_visible, earth: typeof row.earth_visible === "boolean" ? row.earth_visible : null });
      generated += solar * hours / 1000;
      const net = (solar - demand) / 1000;
      const chargeRate = Math.min(net, power.chargeLimit / 1000) * power.chargeEfficiency / 100;
      const dischargeRate = Math.min(-net, power.dischargeLimit / 1000) / (power.dischargeEfficiency / 100);
      const rate = net >= 0 ? chargeRate : -dischargeRate;
      const next = Math.max(0, Math.min(power.battery, battery + rate * hours));
      if (rate < 0 && (next < reserve || (reserve > 0 && next === reserve && battery < reserve))) {
        const crossing = Math.max(0, (battery - reserve) / -rate);
        belowHours += hours - crossing;
        firstBelow ??= (time - source.start) / hourMs + crossing;
      } else if (battery < reserve) {
        belowHours += rate > 0 ? Math.min(hours, (reserve - battery) / rate) : hours;
      }
      if (net < 0) unmet += Math.max(0, -net * hours - (battery - next) * power.dischargeEfficiency / 100);
      battery = next;
      minimum = Math.min(minimum, battery);
      time = stop;
    }
  }
  timeline.push({ ...timeline[timeline.length - 1], time: source.site.end, charge: battery / power.battery * 100 });
  return { timeline, generated, unmet, firstBelow, belowHours, minimumPct: minimum / power.battery * 100 };
}
export type PowerRun = ReturnType<typeof simulatePower>;
