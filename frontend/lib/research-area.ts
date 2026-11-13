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
  sampled: number;
  reasons: string[];
  counts: { evaluated: number; limits: number; missing: number; unavailable: number; focus_missing: number };
};
