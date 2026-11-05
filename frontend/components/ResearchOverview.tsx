"use client";
import { ArrowUpRight, Layers, Radio, Sun } from "lucide-react";
import type { Research } from "./LandingResearch";

export default function ResearchOverview({result,onNavigate,busy=false}:{result:Research|null;onNavigate:(view:number)=>void;busy?:boolean}) {
  if(!result)return <section className="assessment-main glass"><span className="eyebrow">YOUR LANDING RESEARCH</span><h2>{busy?"Assessing your selected site…":"Begin with a possibility."}</h2><p role={busy?"status":undefined}>{busy?"Retrieving NASA geometry and screening the available terrain. Measurements and their coverage will appear here.":"Choose coordinates and a mission window on Search, then assess the site."}</p><button className="button primary" onClick={()=>onNavigate(7)}>Choose a location <ArrowUpRight size={15}/></button></section>;
  return <div className="assessment-layout">
    <article className="assessment-main glass"><div className="assessment-card-top"><span className="eyebrow">YOUR SELECTED LOCATION</span><span className="tag">{result.provisional?"PROVISIONAL RESEARCH":"RESEARCH ASSESSMENT"}</span></div>
      <h2>{result.mission.name}</h2><p className="assessment-coordinates">{result.mission.latitude.toFixed(4)}° N <span>/</span> {result.mission.longitude.toFixed(4)}° E</p>
      <div className="assessment-value"><span>{result.score==null?"—":result.score.toFixed(1)}</span><small>/100</small></div><h3>Five-factor research score</h3>
      <p className="assessment-caption">Available evidence: {(result.available_weight*100).toFixed(0)}% of nominal weight. Missing factors: {result.missing.join(", ")||"none"}. This score is not a probability of landing success. Safety: {result.safety_status.replaceAll("_"," ")}.</p>
      <div className="assessment-actions"><button className="button primary" onClick={()=>document.getElementById("landing-assessment")?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}>Evidence & sources <ArrowUpRight size={15}/></button><button className="button subtle" onClick={()=>onNavigate(3)}>Compare alternatives</button></div><span className="data-attribution">NASA JPL HORIZONS · REGIONAL LOLA · HISTORICAL DIVINER</span>
    </article>
    <div className="assessment-details">
      {[{key:"S",label:"Sunlight availability",Icon:Sun},{key:"C",label:"Earth communication geometry",Icon:Radio}].map(({key,label,Icon})=>{const f=result.factors[key];return <article className="assessment-data glass" key={key}><div><span><Icon size={17}/>{label}</span><strong>{f.score==null?"Unavailable":`${f.score.toFixed(1)}%`}</strong></div>{f.score!=null&&<div className="availability-bar"><span style={{width:`${f.score}%`}}/></div>}<p>{f.quality} · {key==="S"?"Sampled visibility, not a power forecast":"Geometric visibility, not a link budget"}</p></article>;})}
      <article className="assessment-data glass"><div><span><Layers size={17}/>Fine-footprint terrain</span><strong>{result.terrain.available&&result.terrain.slope_p95_deg!=null?`${result.terrain.slope_p95_deg.toFixed(1)}° p95`:"Unavailable"}</strong></div><p>{result.terrain.available?`${result.terrain.resolution_m} m native pixels; terrain limits and uncertainty still apply.`:result.terrain.reason}</p><button className="text-button" onClick={()=>document.getElementById("landing-assessment")?.scrollIntoView()}>Inspect coverage & limits <ArrowUpRight size={13}/></button></article>
      <article className="assessment-data glass"><div><span>Spacecraft & contingency evidence</span></div><p>Apollo LM assumptions, footprint uncertainty and backup terrain candidates remain in the assessment below. A geometric score does not establish a safe or reachable landing site.</p></article>
    </div>
  </div>;
}
