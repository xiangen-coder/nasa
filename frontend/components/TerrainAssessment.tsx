"use client";
import {useEffect,useState} from "react";
import type {Site} from "../app/types";
import type {Research} from "./LandingResearch";

type Source={name?:string;source_url?:string;quality?:string;frame?:string;observation_period?:string;resolution_m?:number};
type TerrainResult={location:Site;radius_m:number;terrain:Research["terrain"];regional_elevation:{available:boolean;value?:number;reason?:string;source?:Source;coverage_type?:"global"|"regional"};coordinate_note:string;limitations:string[]};
const number=(n:number|undefined,unit="")=>n==null?"Unavailable":`${n.toLocaleString("en-GB",{maximumFractionDigits:2})}${unit}`;
export default function TerrainAssessment({location,onSelect}:{location:Site;onSelect:(site:Site)=>void}){
  const [radius,setRadius]=useState(100),[layer,setLayer]=useState<"slope"|"elevation">("slope"),[retry,setRetry]=useState(0);
  const [response,setResponse]=useState<{key:string;data?:TerrainResult;error?:string}|null>(null);
  const key=`${location.latitude},${location.longitude},${radius},${retry}`;
  useEffect(()=>{
    const controller=new AbortController();const timeout=window.setTimeout(()=>{controller.abort();setResponse({key,error:"Terrain request timed out. Please retry."});},30000);
    fetch(`/api/research/terrain?${new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),radius_m:String(radius)})}`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error(`Terrain request failed (${r.status}).`);return r.json() as Promise<TerrainResult>;})
      .then(data=>{if(!controller.signal.aborted)setResponse({key,data});})
      .catch(e=>{if(!controller.signal.aborted)setResponse({key,error:(e as Error).message});})
      .finally(()=>window.clearTimeout(timeout));
    return()=>{controller.abort();window.clearTimeout(timeout);};
  },[key,location.latitude,location.longitude,radius]);
  const current=response?.key===key?response:undefined,data=current?.data,t=data?.terrain;
  const source: Source | undefined=t?.source??data?.regional_elevation.source;
  const globalElevation=data?.regional_elevation.coverage_type==="global";
  const points=t?.grid??[],values=points.map(p=>layer==="slope"?p.slope_deg:p.elevation_m),lo=Math.min(...values),hi=Math.max(...values);
  const steps=[...new Set(points.map(p=>p.east_m))].sort((a,b)=>a-b),cell=steps.length>1?steps[1]-steps[0]:5;
  return <section className="panel analysis-panel" aria-label="NASA regional terrain assessment">
    <div className="panel-heading"><div><h2>Local terrain assessment</h2><p>Verified NASA LOLA registry · native neighbourhood measurements</p></div><a className="text-button" href="https://pgda.gsfc.nasa.gov/products/78" target="_blank" rel="noreferrer">NASA LOLA source ↗</a></div>
    <div className="terrain-content">
      <p><strong>{location.name}</strong> · {location.latitude.toFixed(5)}° N, {location.longitude.toFixed(5)}° E</p>
      <div className="astro-inputs"><label>Latitude (° N)<input type="number" min="-90" max="90" step="any" value={location.latitude} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&Math.abs(n)<=90)onSelect({...location,name:"Custom terrain point",latitude:n});}}/></label><label>Longitude (° E)<input type="number" min="-180" max="180" step="any" value={location.longitude} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&Math.abs(n)<=180)onSelect({...location,name:"Custom terrain point",longitude:n});}}/></label></div>
      <div className="astro-inputs"><label>Analysis radius<select value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[25,50,100,250,500].map(n=><option key={n} value={n}>{n} m</option>)}</select></label><label>Diagnostic layer<select value={layer} onChange={e=>setLayer(e.target.value as "slope"|"elevation")}><option value="slope">Slope</option><option value="elevation">Elevation</option></select></label></div>
      {!current&&<p role="status">Reading a local raster window…</p>}
      {current?.error&&<div role="alert"><p>{current.error}</p><button className="button subtle" onClick={()=>setRetry(v=>v+1)}>Retry terrain request</button></div>}
      {data&&<>
        <div className="terrain-summary">
          <div><span>{globalElevation?"Approximate elevation":t?.available&&t.coverage_type!=="regional"?"Footprint elevation":"Regional elevation"}</span><strong>{number(t?.available?t.elevation_m:data.regional_elevation.value," m")}</strong></div>
          <div><span>95th percentile slope</span><strong>{number(t?.slope_p95_deg,"°")}</strong></div>
          <div><span>Maximum slope</span><strong>{number(t?.slope_max_deg,"°")}</strong></div>
          <div><span>Detrended RMS roughness</span><strong>{number(t?.roughness_m," m")}</strong></div>
          <div><span>Neighbourhood relief</span><strong>{number(t?.relief_m," m")}</strong></div>
          <div><span>{globalElevation?"Global DEM spacing at equator":"DEM pixel spacing"}</span><strong>{number(t?.resolution_m??source?.resolution_m," m")}</strong></div>
        </div>
        {!t?.available&&<div className="info"><strong>Local terrain unavailable.</strong> {t?.reason}</div>}
        {t?.coverage_type==="regional"&&<p className="info">Regional screening uses native {t.resolution_m} m pixels. Finer footprint slopes and small hazards remain unresolved.</p>}
        {points.length>0&&<figure className="regional-terrain-figure"><svg viewBox={`${-radius-cell} ${-radius-cell} ${2*(radius+cell)} ${2*(radius+cell)}`} role="img" aria-label={`${layer} diagnostic within ${radius} metre radius; projected raster axes`}>
          {points.map((p,i)=><rect key={i} x={p.east_m-cell/2} y={-p.north_m-cell/2} width={cell} height={cell} fill={`hsl(${210-180*(values[i]-lo)/(hi-lo||1)} 55% 48%)`}><title>{`Raster X ${p.east_m} m, Y ${p.north_m} m: ${number(values[i],layer==="slope"?"°":" m")}`}</title></rect>)}
          <circle cx="0" cy="0" r={Math.max(2,radius/40)} fill="white" stroke="#142b35" strokeWidth={Math.max(1,radius/80)}/>
        </svg><figcaption>{layer==="slope"?"Slope":"Elevation"}: {number(lo,layer==="slope"?"°":" m")} (blue) → {number(hi,layer==="slope"?"°":" m")} (orange). {data.coordinate_note}</figcaption></figure>}
        {source&&<div className="info"><strong>{source.name}</strong><p>{source.quality}</p>{source.source_url&&<a href={source.source_url} target="_blank" rel="noreferrer">Dataset provenance ↗</a>}<p>Frame: {source.frame||"See source metadata"} · Period: {source.observation_period||"See source product"}</p></div>}
        <ul className="muted">{data.limitations.map(s=><li key={s}>{s}</li>)}</ul>
        <p className="muted">This page reads the same terrain registry as NASA landing research. Sunlight horizons and research scoring are calculated in the assessment. Boulder-scale hazards remain unverified.</p>
      </>}
    </div>
  </section>;
}
