import type { Mission, Site } from "../app/types";
export type SearchRecord = {
  version: 1;
  mission: Mission;
  alternatives: Site[];
  priority: "overall" | "T" | "S" | "C" | "I";
  radiusKm?: number;
};
export function validRecord(value: unknown): value is SearchRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as SearchRecord;
  const site = (s: Site) =>
    s &&
    typeof s.name === "string" &&
    s.name.length <= 100 &&
    Number.isFinite(s.latitude) &&
    Math.abs(s.latitude) <= 90 &&
    Number.isFinite(s.longitude) &&
    Math.abs(s.longitude) <= 180;
  const m = r.mission;
  return (
    r.version === 1 &&
    !!m &&
    site(m) &&
    Number.isFinite(Date.parse(m.start)) &&
    Number.isFinite(Date.parse(m.end)) &&
    Date.parse(m.end) > Date.parse(m.start) &&
    Number.isInteger(m.interval_minutes) &&
    m.interval_minutes >= 5 &&
    m.interval_minutes <= 1440 &&
    Number.isFinite(m.clearance_deg) &&
    m.clearance_deg >= 0 &&
    m.clearance_deg <= 20 &&
    Array.isArray(r.alternatives) &&
    r.alternatives.length <= 2 &&
    r.alternatives.every(site) &&
    ["overall", "T", "S", "C", "I"].includes(r.priority) &&
    (r.radiusKm === undefined || (Number.isFinite(r.radiusKm) && r.radiusKm >= 0.25 && r.radiusKm <= 20))
  );
}
