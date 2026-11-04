"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Orbit, Play, Pause, RotateCcw, ArrowLeft, ArrowRight } from "lucide-react";
import type { AstroBody, AstronomyData } from "./astronomy-types";
const AstronomyScene = dynamic(() => import("./AstronomyScene"), { ssr: false, loading: () => <div className="empty">Preparing the 3D scene…</div> });
const ZONES = ["UTC", "Asia/Kuala_Lumpur", "Asia/Kolkata", "Asia/Tokyo", "America/New_York", "Europe/London", "Australia/Sydney"];
const BODIES: AstroBody[] = ["sun", "earth", "moon"];
const quantity = (value: number, digits = 2) => value.toLocaleString("en-GB", { maximumFractionDigits: digits });
function inputAt(time: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(time);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return { date: `${pick("year").padStart(4, "0")}-${pick("month")}-${pick("day")}`, time: `${pick("hour")}:${pick("minute")}:${pick("second")}` };
}

export default function AstronomySimulation({ active }: { active: boolean }) {
  const [date, setDate] = useState(() => inputAt(new Date(), "UTC").date);
  const [time, setTime] = useState(() => inputAt(new Date(), "UTC").time);
  const [zone, setZone] = useState("UTC"), [days, setDays] = useState(30);
  const [data, setData] = useState<AstronomyData | null>(null), [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(2);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const requestId = useRef(0), controller = useRef<AbortController | null>(null);
  const frame = data?.frames[index];
  const key = `${date}T${time}|${zone}|${days}`;
  const dirty = !!data && key !== loadedKey;
  const stepHours = data && data.frames.length > 1 ? (Date.parse(data.frames[1].time) - Date.parse(data.frames[0].time)) / 3600000 : 0;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    if (!playing || !data || !active) return;
    const timer = window.setInterval(() => setIndex(i => Math.min(i + 1, data.frames.length - 1)), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [playing, data, active, speed]);
  useEffect(() => { if (data && index === data.frames.length - 1) setPlaying(false); }, [data, index]);

  const show = async (input = { date, time, zone, days }) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const id = ++requestId.current;
    const timeout = window.setTimeout(() => abort.abort(), 150000);
    setPlaying(false); setBusy(true); setError("");
    try {
      const response = await fetch("/api/astronomy", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ local_time: `${input.date}T${input.time.length === 5 ? input.time + ":00" : input.time}`, timezone: input.zone, window_days: input.days, include_paths: true }) });
      const result = await response.json();
      if (!response.ok) throw Error(typeof result.detail === "string" ? result.detail : "Check the date, time, time zone and available ephemeris range.");
      if (!Array.isArray(result.frames) || !result.frames.length || !result.frames[result.selected_index]) throw Error("The scientific service returned an incomplete time series.");
      if (id === requestId.current) {
        setData(result); setIndex(result.selected_index);
        setLoadedKey(`${input.date}T${input.time}|${input.zone}|${input.days}`);
      }
    } catch (e) {
      if (id === requestId.current) setError(abort.signal.aborted ? "The request was cancelled or timed out. Retry later. No substitute positions were generated." : (e as Error).message);
    } finally { window.clearTimeout(timeout); if (id === requestId.current) setBusy(false); }
  };

  return <section className="panel astronomy-simulation" aria-label="Sun Earth Moon simulation">
    <div className="panel-heading"><div><h2><Orbit size={20} /> Sun–Earth–Moon simulation</h2><p>Geometric body-centre positions from NASA JPL Horizons</p></div><span className="tag">J2000 ECLIPTIC</span></div>
    <div className="astronomy-body">
      <div className="astro-inputs">
        <label>Date<input aria-label="Astronomy date" type="date" required min="0001-01-01" max="9999-12-31" value={date} onChange={e => { setDate(e.target.value); setPlaying(false); }} /></label>
        <label>Time<input aria-label="Astronomy time" type="time" required step="1" value={time} onChange={e => { setTime(e.target.value); setPlaying(false); }} /></label>
        <label>Time zone<select aria-label="Astronomy time zone" value={zone} onChange={e => { setZone(e.target.value); setPlaying(false); }}>{ZONES.map(z => <option key={z}>{z}</option>)}</select></label>
        <label>Animation window<select aria-label="Astronomy animation window" value={days} onChange={e => { setDays(+e.target.value); setPlaying(false); }}>{[2, 7, 30, 366].map(d => <option key={d} value={d}>{d} days centred on selection</option>)}</select></label>
        <button className="button primary" disabled={busy || !date || !time} onClick={() => show()}>{busy ? "Retrieving NASA vectors…" : "Show Position"}</button>
        <button className="button subtle" disabled={busy} onClick={() => { const now = inputAt(new Date(), zone); setDate(now.date); setTime(now.time); show({ ...now, zone, days }); }}>Current Time</button>
      </div>
      <p className="muted">The selected local time is converted to UTC on the backend, including daylight-saving rules. Ambiguous or nonexistent local times are rejected; use UTC to identify the instant. Calendar years 0001–9999 can be submitted; Horizons validates actual body coverage.</p>
      <div className="uncertainty-banner"><strong>Ephemeris uncertainty is not quantified in this response.</strong><p>Past positions are model reconstructions; future positions are predictions. Before 1962, Horizons interprets the converted clock time as UT1 rather than UTC. Future leap seconds are unknown. Texture orientation and rotation are illustrative.</p></div>
      {error && <p className="error" role="alert">{error}{data ? " The previous result remains displayed with its original timestamp." : ""}</p>}
      {busy && <p className="info" role="status">Requesting three bodies with matching epochs, frame and origin. NASA requests are serialized and cached. This may take up to two minutes.</p>}
      {dirty && <p className="info" role="status">Inputs changed. Press Show Position to update. The displayed result still belongs to the loaded timestamp below.</p>}
      {!data && !busy && <div className="empty"><Orbit size={36} /><h3>Choose a moment in the solar system.</h3><p>Show Position retrieves the exact selected epoch, a sampled animation window, and orbital paths. No scene is generated before NASA data arrives.</p></div>}
      {data && frame && <>
        <div className="astro-current" aria-live="off"><span>Displayed NASA sample · {zone}</span><strong>{new Date(frame.time).toLocaleString("en-GB", { timeZone: zone, dateStyle: "full", timeStyle: "long" })}</strong><p>{frame.time} · {Date.parse(frame.time) > Date.now() ? "Predicted future position" : "Ephemeris reconstruction"} · {data.cached ? "Cached NASA vectors" : "NASA vectors"}</p><p>Initially requested instant: {data.selected_time}</p></div>
        {active && <AstronomyScene data={data} frame={frame} />}
        <div className="astro-playback" role="group" aria-label="Astronomy playback">
          <button className="button primary" disabled={busy || index === data.frames.length - 1} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? "Pause" : "Play"}</button>
          <button className="button subtle" onClick={() => { setPlaying(false); setIndex(data.selected_index); }}><RotateCcw size={17} /> Reset time</button>
          <button className="button subtle" disabled={index === 0} onClick={() => { setPlaying(false); setIndex(i => i - 1); }}><ArrowLeft size={17} /> Backward</button>
          <button className="button subtle" disabled={index === data.frames.length - 1} onClick={() => { setPlaying(false); setIndex(i => i + 1); }}>Forward <ArrowRight size={17} /></button>
          <label>Simulation speed<select value={speed} onChange={e => setSpeed(+e.target.value)}>{[1, 2, 5, 10].map(s => <option value={s} key={s}>{quantity(s * stepHours)} simulated hours / second</option>)}</select></label>
        </div>
        <label className="astro-timeline-label">Ephemeris timeline · sample {index + 1} of {data.frames.length}<input aria-label="Astronomy timeline" type="range" min={0} max={data.frames.length - 1} value={index} onChange={e => { setPlaying(false); setIndex(+e.target.value); }} /></label>
        <div className="astro-time-bounds"><span>{data.frames[0].time}</span><span>{data.frames[data.frames.length - 1].time}</span></div>
        <p className="muted">Playback advances only through returned NASA samples ({quantity(stepHours)} hours apart). The slider does not interpolate or invent positions. Reset returns to the exact requested instant. Paths connect sampled positions with straight segments; they are not analytic circles.</p>
        <div className="astro-metrics">
          {([["Earth–Sun distance", frame.earth_sun_km], ["Earth–Moon distance", frame.earth_moon_km], ["Moon–Sun distance", frame.moon_sun_km]] as [string, number][]).map(([label, value]) => <div className="panel" key={label}><span>{label}</span><strong>{quantity(value)} km</strong></div>)}
          <div className="panel"><span>Moon phase · geocentric geometry</span><strong>{frame.moon_phase.label}</strong><p>{quantity(frame.moon_phase.illuminated_fraction * 100)}% illuminated · phase angle {quantity(frame.moon_phase.phase_angle_deg)}°</p></div>
        </div>
        <h3>Cartesian positions at {frame.time}</h3>
        <p className="muted">All coordinates below are kilometres from the solar-system barycentre in the same J2000 ecliptic frame. The camera’s display origin may differ; relative geometry does not.</p>
        <div className="table-scroll"><table><thead><tr><th>Body</th><th>X (km)</th><th>Y (km)</th><th>Z (km)</th></tr></thead><tbody>{BODIES.map(body => <tr key={body}><th>{body[0].toUpperCase() + body.slice(1)}</th>{frame.bodies[body].position_km.map((v, i) => <td key={i}>{quantity(v, 3)}</td>)}</tr>)}</tbody></table></div>
        <details className="explanation"><summary>How were these positions, distances and Moon phase calculated?</summary>
          <p>NASA target IDs: Sun 10, Earth 399, Moon 301. Every request uses CENTER=500@0, EPHEM_TYPE=VECTORS, REF_SYSTEM=ICRF, REF_PLANE=ECLIPTIC, OUT_UNITS=KM-S, TIME_TYPE=UT, VEC_CORR=NONE. Horizons’ returned metadata, epochs and finite vector values are validated before display.</p>
          <p>Time submitted: {data.selected_time}. Frame: {data.provenance.frame}. Origin: {data.provenance.origin}. Calendar: {data.provenance.calendar}. {data.provenance.time_scale}.</p>
          <p>Distances are Euclidean lengths of differences of the returned XYZ vectors: d = √((x₁−x₂)² + (y₁−y₂)² + (z₁−z₂)²). {data.provenance.phase}</p>
          <p>For the displayed sample, Sun–Moon–Earth phase angle = {quantity(frame.moon_phase.phase_angle_deg, 5)}°; illuminated fraction = (1 + cos(angle)) / 2 = {quantity(frame.moon_phase.illuminated_fraction, 6)}. Phase names use 22.5°-wide bins around new/quarter/full elongations and crescent/gibbous categories between them. They do not predict the exact time of a phase event.</p>
          <p>Paths: {data.provenance.paths} Earth’s annual path spans the returned year-long window. The lunar path covers the selected animation window and can be partial or contain multiple revolutions.</p>
          <p>Rendering maps (X,Y,Z) to (X,Z,−Y), then applies a single uniform scale of 1 scene unit = 1,000,000 km and a common origin translation. The body radius slider changes rendered radii only. Physical reference radii: Sun 695,700 km; Earth 6,371 km; Moon 1,737.4 km. {data.provenance.visuals}</p>
          <p>Sources: Sun {data.provenance.ephemerides.sun}; Earth {data.provenance.ephemerides.earth}; Moon {data.provenance.ephemerides.moon}. Retrieved {data.provenance.retrieved_at}. {data.provenance.uncertainty} No historical error percentage, confidence interval, observation comparison or guarantee is inferred.</p>
          <div className="reference-links"><a href={data.provenance.documentation} target="_blank" rel="noreferrer">NASA JPL Horizons documentation</a><a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA/LRO Moon colour map</a></div>
          <p>The Earth reuses your existing textured GLB, with its existing attribution status. Moon colour: NASA SVS / LRO / Ernie Wright. Eclipse darkening, light-time corrections, surface orientation, and spin are not modelled.</p>
        </details>
      </>}
    </div>
  </section>;
}
