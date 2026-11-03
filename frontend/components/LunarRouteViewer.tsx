"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Site } from "../app/types";
import { LUNAR_RADIUS_KM, routeDistances, unitPoint, validateRoute, type RoutePoint } from "./route-data";
const SOURCE = "https://github.com/ayushsingh01042003/MOON/blob/main/lunar_path.json";

export type RouteMemory = { points: RoutePoint[]; source: string; selected: number };
export default function LunarRouteViewer({ onSelect, initial, onChange }: { onSelect: (site:Site)=>void; initial: RouteMemory | null; onChange: (value: RouteMemory)=>void }) {
  const [points,setPoints]=useState<RoutePoint[]>(initial?.points || []), [selected,setSelected]=useState(initial?.selected || 0);
  const [source,setSource]=useState(initial?.source || "MOON repository · lunar_path.json"), [error,setError]=useState("");
  const [status,setStatus]=useState("Loading route JSON…"), [reset,setReset]=useState(0), [focus,setFocus]=useState(true);
  const mount=useRef<HTMLDivElement>(null), marker=useRef<THREE.Mesh|null>(null);
  const loadGeneration=useRef(0);
  useEffect(()=>{
    if (initial?.points.length) return;
    const generation=++loadGeneration.current;
    const controller=new AbortController();
    fetch("/routes/moon-route.json",{signal:controller.signal}).then(r=>{if(!r.ok)throw Error("Bundled route JSON could not be loaded.");return r.json();}).then(data=>{if(generation===loadGeneration.current){setPoints(validateRoute(data));setStatus("Route JSON loaded");}}).catch(e=>{if(!controller.signal.aborted && generation===loadGeneration.current){setError(e.message);setStatus("Route unavailable");}});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{ if(points.length) onChange({points,source,selected}); },[points,source,selected,onChange]);
  useEffect(()=>{
    if(!points.length || !mount.current)return;
    const host=mount.current;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true});} catch {setStatus("3D unavailable: WebGL could not start. Waypoints and distances remain available below.");return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.domElement.setAttribute("role","img");
    renderer.domElement.setAttribute("aria-label","3D lunar surface route on a reference sphere. Cyan line: ordered waypoints; orange ring: selected waypoint. Use the waypoint controls for keyboard access.");
    host.appendChild(renderer.domElement);
    const scene=new THREE.Scene(); scene.background=new THREE.Color("#0b141c");
    const camera=new THREE.PerspectiveCamera(42,1,0.001,100);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.minDistance=.03;controls.maxDistance=15;
    const surfaceRadius=1.45, lineRadius=1.453;
    scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,-4,5);scene.add(light);
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(surfaceRadius,128,96),new THREE.MeshStandardMaterial({color:0x56636b,roughness:1})); scene.add(sphere);
    // Display coordinates: north +Y; longitude 0 along +X; east longitude toward -Z.
    const vector=(p:RoutePoint,r=lineRadius)=>new THREE.Vector3(...unitPoint(p)).multiplyScalar(r);
    const gridMaterial=new THREE.LineBasicMaterial({color:0x80919a,transparent:true,opacity:.35});
    for(const latitude of [-85,-80,-60,-30,0,30,60,80,85]) {
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:180},(_,i)=>vector({latitude,longitude:i*2},1.4505))),gridMaterial));
    }
    for(let lon=0;lon<360;lon+=30) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:181},(_,i)=>vector({latitude:i-90,longitude:lon},1.4505))),gridMaterial));
    const path:THREE.Vector3[]=[];
    for(let i=1;i<points.length;i++){
      const a=vector(points[i-1],1),b=vector(points[i],1),angle=a.angleTo(b);
      const steps=Math.max(1,Math.ceil(angle/(Math.PI/180)));
      for(let j=0;j<=steps;j++){
        const t=j/steps;
        const v=angle<1e-8?a.clone():a.clone().multiplyScalar(Math.sin((1-t)*angle)/Math.sin(angle)).add(b.clone().multiplyScalar(Math.sin(t*angle)/Math.sin(angle)));
        path.push(v.normalize().multiplyScalar(lineRadius));
      }
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path),new THREE.LineBasicMaterial({color:0x65e7ee})));
    const dotGeometry=new THREE.SphereGeometry(.0018,10,8);
    points.forEach((p,i)=>{
      const dot=new THREE.Mesh(dotGeometry,new THREE.MeshBasicMaterial({color:i===0?0x8cf0a6:i===points.length-1?0xf7b06e:0x65e7ee}));dot.position.copy(vector(p));scene.add(dot);
    });
    const selectedMarker=new THREE.Mesh(new THREE.SphereGeometry(.004,16,12),new THREE.MeshBasicMaterial({color:0xffcf76,wireframe:true}));
    marker.current=selectedMarker;scene.add(selectedMarker);
    // The second effect positions the selected marker whenever the route or camera changes.
    const center=new THREE.Vector3();points.forEach(p=>center.add(vector(p,1)));
    if(center.lengthSq()<1e-8)center.copy(vector(points[0],1));center.normalize();
    const spread=Math.max(...points.map(p=>center.distanceTo(vector(p,1))));
    if(focus && spread<1.5){
      controls.target.copy(center.clone().multiplyScalar(surfaceRadius));
      camera.position.copy(controls.target).add(center.clone().multiplyScalar(Math.max(.18,spread*surfaceRadius*3.5)));
    }else{controls.target.set(0,0,0);camera.position.copy(center.clone().multiplyScalar(4.5));}
    camera.up.set(0,0,-1);camera.lookAt(controls.target);controls.update();
    const resize=()=>{const {width,height}=host.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}};
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
    setStatus(`${points.length} waypoints rendered · reference sphere, no measured topography`);
    return ()=>{
      marker.current=null;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();
      const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>();
      scene.traverse(obj=>{if(obj instanceof THREE.Mesh || obj instanceof THREE.Line){geometries.add(obj.geometry);for(const m of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(m);}});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();
    };
  },[points,reset,focus]);
  useEffect(()=>{if(marker.current && points[selected])marker.current.position.set(...unitPoint(points[selected])).multiplyScalar(1.455);},[points,selected,reset,focus]);
  const distances=routeDistances(points), point=points[selected];
  const download=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(points,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download="lunar-surface-route.json";a.click();URL.revokeObjectURL(url);
  };
  return <section className="panel lunar-route">
    <div className="panel-heading"><div><h2>Lunar surface route · 3D</h2><p>Inspect an ordered route on the Moon. This is not the Moon’s orbit or a spacecraft transfer.</p></div></div>
    <div className="route-body">
      <div className="uncertainty-banner"><strong>Illustrative route · uncertainty not yet quantified</strong><p>The source contains coordinates only: no elevations, timestamps, measured route accuracy or traversability evidence. Joining the points does not establish a safe rover route.</p></div>
      <div className="route-controls">
        <button className="button subtle" onClick={()=>setFocus(!focus)}>{focus?"Show whole Moon":"Focus route"}</button>
        <button className="button subtle" onClick={()=>setReset(x=>x+1)}>Reset route camera</button>
        <button className="button subtle" disabled={!points.length} onClick={download}>Download route JSON</button>
        <label className="button subtle">Import route JSON<input aria-label="Import route JSON" type="file" accept=".json,application/json" onChange={async e=>{
          const file=e.target.files?.[0];if(!file)return;
          const generation=++loadGeneration.current;
          try{if(file.size>1024*1024)throw Error("Use a JSON file smaller than 1 MB.");const next=validateRoute(JSON.parse((await file.text()).replace(/^\uFEFF/,"")));if(generation!==loadGeneration.current)return;setPoints(next);setSelected(0);setSource(`Local file: ${file.name}`);setError("");}catch(e){if(generation===loadGeneration.current)setError((e as Error).message);}
          e.target.value="";
        }}/></label>
      </div>
      {error && <p className="error" role="alert">{error} The last valid route is retained.</p>}
      <div className="route-stage" ref={mount}/>
      <p className="model-status" role="status" aria-label="Route status">{status}</p>
      <p className="route-legend">Cyan line: route order · green: start · peach: end · orange wire marker: selected waypoint. Drag to rotate, scroll/pinch to zoom. Camera lighting is illustrative.</p>
      {point && <section className="route-selection" aria-label="Selected route waypoint">
        <h3>Waypoint {selected+1} of {points.length}</h3>
        <p>{point.latitude.toFixed(6)}° latitude, {point.longitude.toFixed(6)}° east longitude. {Math.abs(point.latitude)===90?"At a pole, longitude does not identify a different physical position.":""}</p>
        <p>Distance along joined great-circle segments: {distances[selected].toFixed(2)} km from the start; total {distances[distances.length-1].toFixed(2)} km. Terrain distance and uncertainty are unknown.</p>
        <label>Inspect waypoint<input aria-label="Route waypoint" type="range" min={0} max={points.length-1} value={selected} onChange={e=>setSelected(+e.target.value)}/></label>
        <div className="route-controls"><button className="button subtle" disabled={selected===0} onClick={()=>setSelected(i=>i-1)}>Previous waypoint</button><button className="button subtle" disabled={selected===points.length-1} onClick={()=>setSelected(i=>i+1)}>Next waypoint</button><button className="button primary" onClick={()=>onSelect({...point,name:`Route waypoint ${selected+1}`})}>Use waypoint for site analysis</button></div>
      </section>}
      <details className="explanation"><summary>How was this route displayed and its distance calculated?</summary>
        <p>Source: {source}. <a href={SOURCE} target="_blank" rel="noreferrer">Original JSON on GitHub</a>. The bundled data preserves all 10 source waypoints in order. No extra starting coordinate is silently added.</p>
        <p>Assumption: input latitude is planetocentric degrees, longitude is east-positive degrees. The source JSON does not document its reference frame. The display uses this app’s {LUNAR_RADIUS_KM} km reference sphere. Unit vector = (cos(lat) cos(lon), sin(lat), −cos(lat) sin(lon)); north is +Y, 0° longitude is +X, 90° E is −Z.</p>
        <p>Each segment follows the shortest great-circle arc. Angular separation = atan2(length of cross product, dot product) of endpoint unit vectors; distance = angular separation in radians × {LUNAR_RADIUS_KM} km. Total distance is the sum of segments. Antipodal segments are rejected because they do not define a unique arc. The visible line is lifted slightly for legibility; that lift is excluded from distance calculations.</p>
        <p>Only latitude and longitude are imported. Additional fields, including height, are not used. There is no terrain following, optimization, vehicle simulation or timing prediction. The repository’s separate script adds a hardcoded starting point and uses a different radius; neither behavior is treated as JSON data here.</p>
      </details>
      <details className="explanation"><summary>Where is the detailed 3D Moon?</summary><p>The source repository streams Cesium ion asset 2684829; it does not bundle a GLB, USDZ or terrain mesh. This view uses a reference sphere and does not reuse the repository author’s access token. A detailed tileset requires your own authorized Cesium access and its applicable usage rights. The existing 3D observatory still supports your local GLB/USDZ models, whose alignment cannot be assumed to match these waypoints.</p></details>
      <details className="explanation"><summary>All waypoints and segment distances</summary><div className="table-scroll"><table><thead><tr><th>Waypoint</th><th>Latitude °</th><th>Longitude ° E</th><th>Segment km</th><th>Cumulative km</th><th>Inspect</th></tr></thead><tbody>{points.map((p,i)=><tr key={i}><td>{i+1}</td><td>{p.latitude.toFixed(6)}</td><td>{p.longitude.toFixed(6)}</td><td>{(distances[i]-(distances[i-1]||0)).toFixed(3)}</td><td>{distances[i].toFixed(3)}</td><td><button className="text-button" aria-label={`Inspect waypoint ${i+1}`} onClick={()=>setSelected(i)}>Select</button></td></tr>)}</tbody></table></div></details>
    </div>
  </section>;
}
