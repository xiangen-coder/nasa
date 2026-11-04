export type Vector3 = [number, number, number];
export type AstroBody = "sun" | "earth" | "moon";
export type AstroState = { position_km: Vector3; velocity_km_s: Vector3 };
export type AstroFrame = {
  time: string;
  bodies: Record<AstroBody, AstroState>;
  earth_sun_km: number;
  earth_moon_km: number;
  moon_sun_km: number;
  moon_phase: { label: string; illuminated_fraction: number; phase_angle_deg: number; geocentric_ecliptic_elongation_deg: number };
};
export type AstronomyData = {
  selected_time: string;
  selected_index: number;
  frames: AstroFrame[];
  earth_path: { time: string; relative_km: Vector3 }[];
  moon_path: { time: string; relative_km: Vector3 }[];
  cached: boolean;
  provenance: { source: string; url: string; documentation: string; ephemerides: Record<AstroBody, string>; origin: string; frame: string; units: string; correction: string; time_scale: string; calendar: string; retrieved_at: string; uncertainty: string; paths: string; phase: string; visuals: string };
};
