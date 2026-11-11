"use client";

import {useEffect,useRef,useState} from "react";

import type {Mission,Site} from "../app/types";

type Assessment={status:string;nominal_terrain_score:number|null;margin_terrain_score:number|null;screening_radius_m:number;constraints_failed:string[];bounds:Record<string,number|null>;uncertainty:{available:boolean;reason?:string;layers:Record<string,{available:boolean;maximum?:number;zero_fraction?:number;reason?:string}>}};

type Report={spacecraft_suitability:string;baseline:Assessment;nominal_analysis:{score:number|null};margin_analysis:{score:number|null;missing:string[]};apollo_reference:{caution:string;sources:string[]};alternatives:{searched:number;overlap_excluded:number;outside_or_missing:number;failed_limits:number;passing_terrain_candidates:number;scope:string;inspection_candidates:{location:Mission;distance_m:number;assessment:Assessment;reachability:string}[];candidates:{location:Mission;distance_m:number;assessment:Assessment;terrain_score_change:number|null;improvement_verified:boolean;reachability:string}[]};mitigations:{issue:string;adjustment:string;status:string}[];energy:null|{estimated_endurance_hours:number;longest_sampled_darkness_hours:number|null;margin_hours:number|null}};

const defaults={name:"Apollo Lunar Module — historical reference",diameter_m:9.4488,landing_dispersion_m:50,rms_multiplier:2,search_radius_m:500,diversion_range_m:null as number|null,battery_wh:null as number|null,load_w:null as number|null,reserve_fraction:.2};

const labels:Record<string,string>={diameter_m:"Landing gear span / envelope (m)",landing_dispersion_m:"Assumed radial landing-position error (m)",rms_multiplier:"RMS sensitivity multiplier (not confidence)",search_radius_m:"Backup search radius (m)",diversion_range_m:"Optional diversion distance cap (m)",battery_wh:"Optional nameplate system battery capacity (Wh)",load_w:"Optional constant total load, including heaters (W)",reserve_fraction:"Battery reserve fraction (0–1)"};

const n=(v:number|null|undefined)=>v==null?"Unavailable":v.toLocaleString("en-GB",{maximumFractionDigits:2});

export default function LandingReliability({mission,limits,onSelect,onAddComparison}:{mission:Mission;limits:Record<string,number>;onSelect:(s:Site)=>void;onAddComparison:(s:Site)=>void}){

 const [vehicle,setVehicle]=useState(defaults),[report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");const abort=useRef<AbortController|null>(null);const key=JSON.stringify({mission,limits,vehicle});

 useEffect(()=>{abort.current?.abort();setReport(null);setBusy(false);setError("");return()=>abort.current?.abort()},[key]);

 async function assess(){const controller=new AbortController();abort.current=controller;setBusy(true);setError("");setReport(null);const timer=window.setTimeout(()=>controller.abort(),145000);try{const r=await fetch('/api/reliability/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mission,limits,vehicle}),signal:controller.signal});const j=await r.json();if(!r.ok)throw Error(typeof j.detail==='string'?j.detail:JSON.stringify(j.detail));if(!controller.signal.aborted)setReport(j)}catch(e){if(abort.current===controller)setError(controller.signal.aborted?'Assessment cancelled or timed out. Retry with a shorter window or larger time step.':(e as Error).message)}finally{window.clearTimeout(timer);if(abort.current===controller)setBusy(false)}}

 function exportReport(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({mission,limits,vehicle,report},null,2)],{type:'application/json'}));a.href=url;a.download='apollo-landing-contingency-research.json';a.click();URL.revokeObjectURL(url)}

 return <section className="explanation" aria-label="Apollo landing reliability and backups"><h3>Apollo LM · uncertainty and backup landing points</h3><p>Historical reference: 9.45 m diagonal gear span, 6° mean terrain slope and 12° effective slope. The 0.61 m footprint-irregularity requirement cannot be verified from a 5 m DEM. Touchdown dynamics, soil bearing strength, flight reachability and polar operations remain unverified.</p><p><a href="https://ntrs.nasa.gov/api/citations/19720018253/downloads/19720018253.pdf" target="_blank" rel="noreferrer">NASA landing-gear design reference</a> · <a href="https://science.nasa.gov/wp-content/uploads/2023/09/Apollo_12.pdf" target="_blank" rel="noreferrer">NASA LM dimensions</a></p>

 <details><summary>Spacecraft and contingency assumptions</summary><p>Position error, search radius and energy inputs are research assumptions. No fuel-based diversion range or Apollo battery budget is supplied automatically. Existing research terrain thresholds also apply; slope checks are capped by the historical Apollo reference.</p><div className="astro-inputs">{Object.entries(labels).map(([k,label])=><label key={k}>{label}<input type="number" step="any" value={vehicle[k as keyof typeof vehicle]??""} onChange={e=>setVehicle({...vehicle,[k]:e.target.value===""&&['diversion_range_m','battery_wh','load_w'].includes(k)?null:Number(e.target.value)})}/></label>)}</div></details>

 <button className="button primary" disabled={busy} onClick={assess}>{busy?'Assessing measurements and 24 candidate points…':'Assess uncertainty & find backup points'}</button>{busy&&<p role="status">Retrieving selected-site NASA geometry and screening local footprints. Candidate visibility is evaluated separately after selection.</p>}{error&&<p className="error" role="alert">{error}</p>}

 {report&&<><p className="info"><strong>Spacecraft suitability: {report.spacecraft_suitability}.</strong> This is a regional terrain screen; no touchdown or abort authorization is implied.</p><p>Baseline terrain: {report.baseline.status.replaceAll('_',' ')} · screening radius {n(report.baseline.screening_radius_m)} m.</p>{report.baseline.constraints_failed.map(s=><p className="error" key={s}>{s}</p>)}

 <div className="table-scroll"><table><thead><tr><th>Comparison</th><th>Nominal</th><th>With RMS sensitivity margins</th></tr></thead><tbody><tr><th>Five-factor score / 100</th><td>{n(report.nominal_analysis.score)}</td><td>{n(report.margin_analysis.score)} · provisional; missing {report.margin_analysis.missing.join(', ')||'none'}</td></tr><tr><th>Terrain component / 100</th><td>{n(report.baseline.nominal_terrain_score)}</td><td>{n(report.baseline.margin_terrain_score)}</td></tr></tbody></table></div>

 <p>RMS margins are a sensitivity scenario, not a statistical confidence interval. Missing uncertainty data makes the margin-based total unavailable. A higher available-weight percentage does not indicate higher accuracy.</p>

 <div className="table-scroll"><table><thead><tr><th>Published local evidence</th><th>Maximum / fraction</th></tr></thead><tbody>{Object.entries(report.baseline.uncertainty.layers).map(([k,v])=><tr key={k}><th>{k.replaceAll('_',' ')}</th><td>{v.available?(k==='sample_count'?`${n((v.zero_fraction??0)*100)}% of footprint pixels have zero laser shots`:`${n(v.maximum)} ${k==='slope_uncertainty'?'° RMS':'m RMS'}`):v.reason||'Unavailable'}</td></tr>)}</tbody></table></div>

 <h4>Backup terrain shortlist</h4><p>{report.alternatives.scope}</p><p>{report.alternatives.searched} grid points · {report.alternatives.overlap_excluded} overlap exclusions · {report.alternatives.outside_or_missing} lack evidence · {report.alternatives.failed_limits} fail limits · {report.alternatives.passing_terrain_candidates} pass available terrain checks.</p>{!report.alternatives.candidates.length&&<p className="info">No candidate passed the available evidence and configured limits. Expand coverage or inspect a different region; do not interpret this as a reason to loosen vehicle limits.</p>}

 {report.alternatives.candidates.map((c,i)=><div className="info" key={`${c.location.latitude},${c.location.longitude}`}><strong>Candidate {i+1}: {c.location.latitude.toFixed(6)}°, {c.location.longitude.toFixed(6)}° E</strong><p>{n(c.distance_m)} m away · margin-based terrain score {n(c.assessment.margin_terrain_score)} · change {n(c.terrain_score_change)} points. {c.improvement_verified?'Higher terrain score than selected point under the same screen.':'No verified terrain-score improvement over selected point.'}</p><p>Reachability: {c.reachability}. Lighting, communication and thermal suitability have not been assessed at this candidate.</p><button className="button subtle" onClick={()=>onSelect(c.location)}>Select for full evaluation</button><button className="button subtle" onClick={()=>onAddComparison(c.location)}>Add to comparison</button></div>)}

 {!!report.alternatives.inspection_candidates.length&&<details><summary>Rejected alternatives for further inspection only</summary><p>These points failed the sensitivity screen. They are not accepted backup landing sites, even where their terrain score is higher.</p>{report.alternatives.inspection_candidates.map(c=><div className="error" key={c.location.name}><strong>{c.location.latitude.toFixed(6)}°, {c.location.longitude.toFixed(6)}° E · {n(c.distance_m)} m away · terrain score {n(c.assessment.margin_terrain_score)}</strong>{c.assessment.constraints_failed.map(s=><p key={s}>{s}</p>)}<button className="button subtle" onClick={()=>onSelect(c.location)}>Select rejected point for investigation</button><button className="button subtle" onClick={()=>onAddComparison(c.location)}>Add for comparison</button></div>)}</details>}

 {report.energy&&<p className="info">Estimated battery endurance {n(report.energy.estimated_endurance_hours)} h; sampled darkness {n(report.energy.longest_sampled_darkness_hours)} h; difference {n(report.energy.margin_hours)} h. Includes configured reserve; excludes thermal derating, ageing and charging. Reference geometry may miss terrain shadows.</p>}

 <h4>Adjustments and evidence still needed</h4>{report.mitigations.map(m=><p key={m.issue}><strong>{m.issue}:</strong> {m.adjustment}</p>)}<button className="button subtle" onClick={exportReport}>Download contingency research JSON</button></>}

 </section>

}

