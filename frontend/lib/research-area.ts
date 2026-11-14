import type { Mission } from "../app/types";
import type { Research } from "../components/LandingResearch";
import type { ResearchPriority } from "../components/SearchConsole";

export type ResearchArea = {
  centre: Mission;
  radiusKm: number;
  focus: ResearchPriority;
  limits?: Record<string, number>;
};

export type ResearchAreaResult = {
  results: Research[];
  recommended?: boolean;
  sampled: number;
  qualifying?: number;
  sampling?: { radii_m: number[]; points_per_ring: number };
  reasons: string[];
  counts: { evaluated: number; limits: number; missing: number; unavailable: number; focus_missing: number };
};
