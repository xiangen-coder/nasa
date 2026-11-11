"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Site } from "../app/types";

export type ResearchPriority = "T" | "S" | "C";
type Props = {
  selected: Site; onSelect: (site: Site) => void;
  start: string; end: string; startTime: string; endTime: string;
  onStart: (value: string) => void; onEnd: (value: string) => void;
  onStartTime: (value: string) => void; onEndTime: (value: string) => void;
  interval: number; onInterval: (value: number) => void;
  clearance: number; onClearance: (value: number) => void;
  priority: ResearchPriority; onPriority: (value: ResearchPriority) => void;
  busy: boolean; onEvaluate: () => void;
};

export default function SearchConsole(p: Props) {
  const [error, setError] = useState("");
  return <form id="landing-search-form" className="search-console" aria-label="Search for a lunar landing site" onSubmit={event => {
    event.preventDefault();
    const start = Date.parse(`${p.start}T${p.startTime}:00Z`);
    const end = Date.parse(`${p.end}T${p.endTime}:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setError("Return date and time must be later than departure. Adjust the return time in calculation settings if needed."); return;
    }
    setError(""); p.onEvaluate();
  }}>
    <div className="console-heading">01 / Mission timeline & priority</div>
    <div className="search-row">
      <label>Date<input aria-label="Departure date" type="date" required min="1901-01-01" max="2052-12-30" value={p.start} onChange={e=>p.onStart(e.target.value)}/></label>
      <label>Time (UTC)<input type="time" required value={p.startTime} onChange={e=>p.onStartTime(e.target.value)}/></label>
      <label>Date of return<input type="date" required min={p.start} max="2052-12-31" value={p.end} onChange={e=>p.onEnd(e.target.value)}/></label>
      <label>Priority<select value={p.priority} onChange={e=>p.onPriority(e.target.value as ResearchPriority)}><option value="T">Terrain Safety</option><option value="S">Sunlight Availability</option><option value="C">Earth Communication</option></select></label>
    </div>
    <div className="console-heading">02 / Target coordinates</div>
    <div className="search-row coordinates-row">
      <label>Location name<input required maxLength={100} placeholder="e.g. South pole" value={p.selected.name} onChange={e=>p.onSelect({...p.selected,name:e.target.value})}/></label>
      <label>Latitude (° N)<input aria-label="Target latitude" type="number" required min="-90" max="90" step="any" value={p.selected.latitude} onChange={e=>p.onSelect({...p.selected,id:undefined,latitude:Number(e.target.value)})}/></label>
      <label>Longitude (° E)<input aria-label="Target longitude" type="number" required min="-180" max="180" step="any" value={p.selected.longitude} onChange={e=>p.onSelect({...p.selected,id:undefined,longitude:Number(e.target.value)})}/></label>
    </div>
    <details className="console-advanced"><summary>Calculation settings · {p.interval}-minute sampling · return at {p.endTime} UTC</summary>
      <div className="mission-controls">
        <label>Return time (UTC)<input type="time" required value={p.endTime} onChange={e=>p.onEndTime(e.target.value)}/></label>
        <label>Sampling interval<select value={p.interval} onChange={e=>p.onInterval(Number(e.target.value))}>{[5,15,30,60,180,360].map(n=><option key={n} value={n}>{n<60?`${n} minutes`:`${n/60} hour${n>60?"s":""}`}</option>)}</select></label>
        <label>Earth clearance (°)<input type="number" required min="0" max="20" step="0.1" value={p.clearance} onChange={e=>p.onClearance(Number(e.target.value))}/></label>
      </div>
    </details>
    <div className="console-action"><button className="button console-go" type="submit" disabled={p.busy}>{p.busy?<><span className="spinner"/> Evaluating…</>:<>Go <ArrowUpRight size={17}/></>}</button></div>
    {error&&<p className="console-validation" role="alert">{error}</p>}
    <p className="console-note">NASA ephemerides & measured terrain · Priority highlights a factor; scoring weights remain fixed. Research screening, not flight guidance.</p>
  </form>;
}
