import type { Analysis } from "../app/types";

export function Uncertainty({ analysis }: { analysis: Analysis | null }) {
  return <aside className="uncertainty-banner" aria-label="Scientific uncertainty">
    <strong>Uncertainty not yet quantified</strong>
    <p>No validated prediction interval, confidence interval, or historical percentage error is available. {analysis ? `Results cover ${analysis.mission.start.slice(0,10)} to ${analysis.mission.end.slice(0,10)} UTC. Visibility transitions are sampled every ${analysis.mission.interval_minutes} minutes; each boundary may shift by up to one sampling step. This is temporal resolution, not a statistical error bound.` : "Choose dates to define the calculation horizon. Local terrain and model limitations may change visibility."}</p>
  </aside>;
}
export function CalculationDetails({ analysis: a, metric = "Simultaneous visibility" }: { analysis: Analysis; metric?: string }) {
  const duration = (Date.parse(a.mission.end)-Date.parse(a.mission.start))/3600000;
  const field = metric === "Sunlight availability" ? "sun_visible" : metric === "Earth visibility" ? "earth_visible" : "simultaneous";
  const visibleHours = a.series.slice(0,-1).reduce((sum,row,i) => sum + (row[field] ? (Date.parse(a.series[i+1].time)-Date.parse(row.time))/3600000 : 0),0);
  const pct = a.metrics[field === "sun_visible" ? "sun_visible_pct" : field === "earth_visible" ? "earth_visible_pct" : "simultaneous_pct"];
  return <details className="explanation">
    <summary>How was this calculated? <span className="sr-only">{metric}</span></summary>
    <h3>{metric}</h3>
    <p><b>User inputs:</b> {a.mission.name}; latitude {a.mission.latitude}°, east longitude {a.mission.longitude}°; {a.mission.start} to {a.mission.end}; {a.mission.interval_minutes} minute step; Earth clearance {a.mission.clearance_deg}°.</p>
    <p><b>Scientific source:</b> {a.provenance.ephemeris}. Orientation: {a.provenance.orientation}.</p>
    <p><b>Method:</b> SPICE geometric Sun/Earth vectors are transformed into local east, north and up axes. Azimuth = atan2(east, north); elevation = atan2(up, √(east² + north²)). Sun centre must be strictly above the horizon; Earth centre must exceed horizon plus the entered clearance. Both tests must pass for simultaneous visibility.</p>
    <p><b>Terrain:</b> {a.terrain.reason || a.terrain.method || "See source metadata."} {a.terrain.source?.source_url && <a href={a.terrain.source.source_url} target="_blank" rel="noreferrer">Terrain source</a>}</p>
    {metric === "Terrain" ? <p>Backend-reported elevation: {a.terrain.elevation_m ?? "unavailable"} m; slope: {a.terrain.slope_deg ?? "unavailable"}°; pixel spacing: {a.terrain.resolution_m ?? "unavailable"} m. Slope uses central elevation differences; horizon tracing includes spherical curvature. No values are substituted for missing measured terrain.</p> : metric === "Longest link blackout" ? <p><b>Calculated value:</b> {a.metrics.longest_blackout_hours.toFixed(3)} h. Adjacent intervals with Earth below the threshold are merged; the longest merged duration is reported. The final endpoint contributes no duration.</p> : <p><b>Intermediate and final values:</b> sum of visible interval durations = {visibleHours.toFixed(4)} h; mission duration = {duration.toFixed(4)} h. Availability = 100 × visible hours / total hours. Returned result = {pct.toFixed(4)}%. Each interval uses its starting sample, including a shortened last interval; the final endpoint has zero weight.</p>}
    <p><b>Uncertainty not yet quantified.</b> There are no measured outcomes or validated error statistics for this result. This is a geometric calculation, not guaranteed sunlight power or radio communication.</p>
    <details><summary>Returned assumptions and supporting samples</summary>
      <ul>{a.provenance.assumptions.map(x => <li key={x}>{x}</li>)}</ul>
      <div className="table-scroll"><table><thead><tr><th>UTC</th><th>Sun elevation °</th><th>Earth elevation °</th><th>Sun / Earth / Both</th></tr></thead><tbody>{a.series.slice(0,8).map(r => <tr key={r.time}><td>{r.time}</td><td>{r.sun_elevation.toFixed(4)}</td><td>{r.earth_elevation.toFixed(4)}</td><td>{[r.sun_visible,r.earth_visible,r.simultaneous].map(v=>v?"Yes":"No").join(" / ")}</td></tr>)}</tbody></table></div>
      <p>First {Math.min(8,a.series.length)} of {a.series.length} returned samples. Export the complete series from Mission report.</p>
    </details>
  </details>;
}
