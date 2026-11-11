import type { Site } from "../app/types";

export const terrainReference: Site = {
  id: "pgda-site01-centre",
  name: "Connecting Ridge DEM centre",
  latitude: -89.463162834,
  longitude: -137.489552922,
  description: "Reference coordinate at the centre of NASA’s LOLA Site01 elevation raster.",
};

export const referenceSites: readonly Site[] = [
  { id: "shackleton", name: "Shackleton vicinity", latitude: -89.54, longitude: 0 },
  { id: "de-gerlache", name: "de Gerlache vicinity", latitude: -88.48, longitude: -87.1 },
  terrainReference,
];
