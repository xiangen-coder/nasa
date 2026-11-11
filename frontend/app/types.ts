export type Site = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
};
export type MissionCatalogEntry = {
  id: string;
  name: string;
  site_name: string;
  country: string;
  operator: string;
  latitude: number | null;
  longitude: number | null;
  classification: string;
  status: string;
  event_date: string | null;
  coordinate_frame: string | null;
  coordinate_note: string;
  source_url: string;
  relay: string | null;
};
export type Mission = Site & {
  start: string;
  end: string;
  interval_minutes: number;
  clearance_deg: number;
};
export type Row = {
  time: string;
  sun_azimuth: number;
  sun_elevation: number;
  earth_azimuth: number;
  earth_elevation: number;
  sun_visible: boolean;
  earth_visible: boolean;
  simultaneous: boolean;
};
export type Window = { start: string; end: string; hours: number };
export type Metrics = {
  sun_visible_pct: number;
  earth_visible_pct: number;
  simultaneous_pct: number;
  longest_blackout_hours: number;
  longest_darkness_hours: number;
  operational_windows: Window[];
};
export type Terrain = {
  available: boolean;
  reason: string | null;
  elevation_m: number | null;
  slope_deg: number | null;
  horizon: { azimuth: number; elevation: number }[] | null;
  grid: { east_m: number; north_m: number; elevation_m: number | null }[];
  resolution_m?: number;
  method?: string;
  source?: { source_url: string };
};
export type Analysis = {
  mission: Mission;
  series: Row[];
  metrics: Metrics;
  mode: string;
  terrain: Terrain;
  provenance: { assumptions: string[]; ephemeris: string; orientation: string };
  cached: boolean;
};
export type Ranking = {
  mission: Mission;
  metrics: Metrics;
  slope_deg: number | null;
  score: number;
  contributions: Record<string, number>;
};
export type Comparison = {
  ranking: Ranking[];
  mode: string;
  explanation: string;
};
