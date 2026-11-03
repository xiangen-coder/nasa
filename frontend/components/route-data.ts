export type RoutePoint = { latitude: number; longitude: number };
export const LUNAR_RADIUS_KM = 1737.4;
export function unitPoint(p: RoutePoint): [number, number, number] {
  const lat = p.latitude * Math.PI / 180, lon = p.longitude * Math.PI / 180;
  return [Math.cos(lat)*Math.cos(lon), Math.sin(lat), -Math.cos(lat)*Math.sin(lon)];
}
export function angularDistance(a: RoutePoint, b: RoutePoint): number {
  const u=unitPoint(a), v=unitPoint(b);
  const cross=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
  return Math.atan2(cross,u[0]*v[0]+u[1]*v[1]+u[2]*v[2]);
}
export function validateRoute(input: unknown): RoutePoint[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 2000) throw Error("Use an array of 2–2,000 waypoints.");
  const points = input.map((p: unknown, i) => {
    if (!p || typeof p !== "object") throw Error(`Waypoint ${i+1} must be an object.`);
    const row = p as Record<string, unknown>;
    if (typeof row.latitude !== "number" || !Number.isFinite(row.latitude) || Math.abs(row.latitude)>90 || typeof row.longitude !== "number" || !Number.isFinite(row.longitude) || Math.abs(row.longitude)>180) throw Error(`Waypoint ${i+1}: latitude must be −90…90 and longitude −180…180, in numeric degrees.`);
    return { latitude:row.latitude, longitude:row.longitude };
  });
  for(let i=1;i<points.length;i++) if(Math.PI-angularDistance(points[i-1],points[i])<1e-8) throw Error(`Waypoints ${i} and ${i+1} are antipodal; add an intermediate point to define the path.`);
  return points;
}
export function routeDistances(points: RoutePoint[]): number[] {
  const distances=[0];
  for(let i=1;i<points.length;i++) distances.push(distances[i-1]+angularDistance(points[i-1],points[i])*LUNAR_RADIUS_KM);
  return distances;
}
