import {createRenderer} from './renderer.js';
import {DEG, MOON_RADIUS, clamp, wrap, dot, vector, coordinates, cameraBasis} from './geometry.js';

const $=id=>document.getElementById(id);
const canvas=$('overlay'), surface=$('surface'), ctx=canvas.getContext('2d');
const state = { lat: -5.831, lon: 8.151, zoom: 1, flat: false, relief: 3, selected: null };
const southPole = { name: 'Lunar south pole', lat: -90, lon: 0, type: 'Geographic pole', info: 'Longitude is undefined at the pole.' };
let landingPoint = null;
let renderer, fallbackImage, elevation, features = [], missions = [], marks = [], frame = 0, noticeTimer, view;
const majorNames=new Set(['Tycho','Copernicus','Plato','Clavius','Aristarchus','Kepler','Grimaldi','Theophilus','Ptolemaeus','Orientale','Tsiolkovskiy','Montes Apenninus','Rupes Recta','Vallis Alpes','Bailly','Langrenus','Gassendi','Posidonius','Humboldt','Petavius','Schickard','Schiller','Archimedes','Eratosthenes','Atlas','Hercules','Endymion','Wargentin','Pico','Mons Piton','Reiner Gamma','Hyginus','Triesnecker','Linné','Mare Moscoviense']);
const isSea=feature=>/^(Mare|Oceanus|Sinus|Lacus|Palus)\b/.test(feature.name);
function notice(message) {
  $('notice').textContent=message;
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>$('notice').textContent='',4200);
}
try { renderer=createRenderer(surface); } catch(error){ console.warn(error); }
if(!renderer) notice('WebGL 2 is unavailable. The atlas will open in flat map mode.');
if(!renderer) state.flat=true;

function redraw() {
  if(!frame) frame=requestAnimationFrame(draw);
}
function layout() {
  const {width,height}=canvas.getBoundingClientRect();
  const dpr=Math.min(devicePixelRatio||1,2);
  for(const layer of [canvas,surface]){
    const w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(layer.width!==w || layer.height!==h){layer.width=w;layer.height=h;}
  }
  const radius=(state.flat?Math.min(width/(2*Math.PI),height/Math.PI)*.93:Math.min(width,height)*.405)*state.zoom;
  return {width,height,dpr,radius,basis:cameraBasis(state.lat,state.lon)};
}
function project(lat,lon) {
  const {width,height,radius,basis}=view;
  if(state.flat){
    return [width/2+wrap(lon-state.lon)*DEG*radius,height/2-(lat-state.lat)*DEG*radius];
  }
  const v=vector(lat,lon);
  if(dot(v,basis[2])<0) return null;
  return [width/2+dot(v,basis[0])*radius,height/2-dot(v,basis[1])*radius];
}
function unproject(x,y) {
  const {width,height,radius,basis}=view;
  const a=(x-width/2)/radius,b=(height/2-y)/radius;
  if(state.flat){
    const lat=state.lat+b/DEG;
    return Math.abs(lat)<=90?[lat,wrap(state.lon+a/DEG)]:null;
  }
  const r2=a*a+b*b;
  if(r2>1) return null;
  return coordinates(basis[0].map((value,i)=>a*value+b*basis[1][i]+Math.sqrt(1-r2)*basis[2][i]));
}
function heightAt(lat,lon) {
  if(!elevation) return null;
  const x=(wrap(lon)+180)*4-.5,y=clamp((90-lat)*4-.5,0,719);
  const x0=Math.floor(x),y0=Math.floor(y),xf=x-x0,yf=y-y0;
  const get=(column,row)=>elevation[row*1440+(column+1440)%1440]/1000;
  const top=get(x0,y0)*(1-xf)+get(x0+1,y0)*xf;
  const bottom=get(x0,Math.min(y0+1,719))*(1-xf)+get(x0+1,Math.min(y0+1,719))*xf;
  return top*(1-yf)+bottom*yf;
}
function drawPath(points,color,width=1) {
  ctx.beginPath();
  let previous=null;
  for(const [lat,lon] of points){
    const next=project(lat,lon);
    if(next){
      if(previous && Math.abs(next[0]-previous[0])<view.radius*Math.PI) ctx.lineTo(...next);
      else ctx.moveTo(...next);
    }
    previous=next;
  }
  ctx.lineWidth=width;
  ctx.strokeStyle=color;
  ctx.stroke();
}
function drawGrid() {
  for(let lat=-75;lat<=75;lat+=15){
    drawPath(Array.from({length:181},(_,i)=>[lat,i*2-180]),'#b6d8f45c');
  }
  for(let lon=-180;lon<180;lon+=15){
    drawPath(Array.from({length:91},(_,i)=>[i*2-90,lon]),'#b6d8f45c');
  }
}
function drawLabels() {
  marks=[];
  const candidates=[];
  for(const feature of features){
    const {name,diameter}=feature;
    if(isSea(feature)) candidates.push([feature,'#a1dbf2',2]);
    else if(majorNames.has(name)) candidates.push([feature,'#e1edf7',2]);
    else if(diameter>=Math.max(1,140/state.zoom)) candidates.push([feature,'#d6dfed',1.5]);
  }
  for(const mission of missions) candidates.unshift([mission,'#f5c480',3.5]);
  if(state.selected) candidates.unshift([state.selected,'#fff',4.5]);
  candidates.unshift([southPole,'#ffc477',5]);
  ctx.font='11px Geist, system-ui, sans-serif';
  ctx.textBaseline='middle';
  const boxes=[];
  for(const [feature,color,size] of candidates){
    const pos=project(feature.lat,feature === southPole && state.flat ? state.lon : feature.lon);
    if(!pos) continue;
    const [x,y]=pos;
    if(x<4||y<7||x>view.width-4||y>view.height-(feature === southPole ? 6 : 30)) continue;
    const width=ctx.measureText(feature.name).width+14;
    if(boxes.some(([bx,by,bw])=>Math.abs(y-by)<16 && x+width>bx && bx+bw>x)) continue;
    boxes.push([x,y,width]);
    marks.push({x,y,width,feature});
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.arc(x,y,size,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle='#08111b';
    ctx.lineWidth=3;
    ctx.strokeText(feature.name,x+7,y);
    ctx.fillText(feature.name,x+7,y);
  }
}
function drawLandingPoint() {
  if (!landingPoint) return;
  const position = project(landingPoint.latitude, landingPoint.longitude);
  if (!position) return;
  const [x, y] = position;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#132539';
  ctx.fill();
  ctx.strokeStyle = '#9ce9ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#9ce9ff';
  ctx.fill();
}
function draw() {
  frame=0;
  view=layout();
  if(!view.radius) return;
  const {width,height,dpr,radius}=view;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  if(renderer){
    renderer.render({...view,basis:view.basis.flat(),center:[state.lat*DEG,state.lon*DEG],relief:state.relief,night:false,flat:state.flat,sun:[0,0,1]});
  } else if(fallbackImage){
    const offset=width/2-(state.lon+180)*DEG*radius;
    const top=height/2-(90-state.lat)*DEG*radius;
    const span=2*Math.PI*radius;
    for(let x=offset+Math.floor(-offset/span)*span;x<width;x+=span) ctx.drawImage(fallbackImage,x,top,span,span/2);
  }
  if(state.flat) drawGrid();
  drawLabels();
  drawLandingPoint();
  $('scale').textContent=`≈ ${Math.round(50*MOON_RADIUS/radius).toLocaleString()} km / 50 px at center`;
}
function coordText(lat,lon) {
  const coordinate=(value,positive,negative)=>`${Math.abs(value).toFixed(3)}° ${value>=0?positive:negative}`;
  return `${coordinate(lat,'N','S')} · ${coordinate(lon,'E','W')}`;
}
function centerLanding() {
  state.lat = state.flat ? 0 : landingPoint?.latitude ?? -5.831;
  state.lon = landingPoint?.longitude ?? 8.151;
  state.zoom = 1;
  redraw();
}
function setLandingPoint(point, recenter = false) {
  const firstSelectionSync = landingPoint === null;
  const coordinatesChanged = point?.latitude !== landingPoint?.latitude ||
    point?.longitude !== landingPoint?.longitude;
  landingPoint = point;
  $('landing-point').textContent = point
    ? `Selected: ${point.name || 'Landing point'} · ${coordText(point.latitude, point.longitude)}`
    : '';
  if (point && coordinatesChanged && recenter && !(firstSelectionSync && state.selected === southPole)) {
    $('dismiss').click();
    centerLanding();
  } else {
    redraw();
  }
}
function pickLandingPoint(latitude, longitude, name = 'Custom location') {
  const point = {
    name: name.slice(0, 100),
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(wrap(longitude).toFixed(6)),
  };
  setLandingPoint(point);
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'lunar-atlas:pick', point }, location.origin);
  }
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent ||
      event.data?.type !== 'lunar-atlas:set-selection') return;
  const point = event.data.point;
  if (point === null) setLandingPoint(null);
  else if (typeof point?.name === 'string' && point.name.length <= 100 &&
      typeof point.latitude === 'number' && Math.abs(point.latitude) <= 90 &&
      typeof point.longitude === 'number' && Math.abs(point.longitude) <= 180) {
    setLandingPoint(point, true);
  }
});
function readout(point) {
  if(!point){
    $('coords').textContent='Move over the surface for coordinates';
    return;
  }
  const [lat,lon]=point,height=heightAt(lat,lon);
  $('coords').textContent = coordText(lat,lon) + (height === null ? '' : ' · ' + height.toFixed(2) + ' km elevation');
}
function select(feature) {
  state.selected=feature;
  $('feature').hidden=false;
  $('feature-type').textContent=feature.type;
  $('feature-name').textContent=feature.name;
  $('feature-info').textContent=feature === southPole ? `90° S · ${feature.info}` :
    [coordText(feature.lat,feature.lon),feature.info].filter(Boolean).join(' · ');
  $('select-pole').hidden = feature !== southPole;
  redraw();
}
$('dismiss').onclick=()=>{
  state.selected=null;
  $('feature').hidden=true;
  redraw();
};

function setProjection(flat) {
  const next = flat || !renderer;
  const changed = state.flat !== next;
  state.flat = next;
  $('globe').setAttribute('aria-pressed',String(!state.flat));
  $('flat').setAttribute('aria-pressed',String(state.flat));
  $('globe').disabled=!renderer;
  if (changed && state.selected === southPole) focusSouthPole();
  else if (changed && landingPoint) centerLanding();
  else redraw();
}
$('globe').onclick=()=>setProjection(false);
$('flat').onclick=()=>setProjection(true);
function focusSouthPole() {
  state.lat = state.flat ? 0 : -90;
  state.lon = 0;
  state.zoom = 1;
  select(southPole);
}
$('south-pole').onclick=focusSouthPole;
$('select-pole').onclick=()=>pickLandingPoint(southPole.lat, southPole.lon, southPole.name);
setProjection(state.flat);
$('flat').disabled = false;
$('south-pole').disabled = false;

function setZoom(value) {
  state.zoom=clamp(value,.5,450);
  redraw();
}
$('closer').onclick=()=>setZoom(state.zoom*1.3);
$('farther').onclick=()=>setZoom(state.zoom/1.3);
$('reset').onclick=()=>{
  centerLanding();
  $('dismiss').click();
};
const pointers=new Map();
let moved=false, pointerOrigin;
const position=event=>{
  const rect=canvas.getBoundingClientRect();
  return [event.clientX-rect.left,event.clientY-rect.top];
};
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0) return;
  if(pointers.size===0) {
    moved=false;
    pointerOrigin=position(event);
  }
  else moved=true;
  pointers.set(event.pointerId,position(event));
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  const next=position(event),previous=pointers.get(event.pointerId);
  if(!view) return;
  if(previous){
    if(pointers.size===2){
      const other=[...pointers].find(([id])=>id!==event.pointerId)[1];
      const oldDistance=Math.hypot(previous[0]-other[0],previous[1]-other[1]);
      if(oldDistance>0) setZoom(state.zoom*Math.hypot(next[0]-other[0],next[1]-other[1])/oldDistance);
    }else{
      const dx=next[0]-previous[0],dy=next[1]-previous[1];
      moved ||= Math.hypot(next[0]-pointerOrigin[0],next[1]-pointerOrigin[1])>4;
      if(moved){
        state.lon=wrap(state.lon-dx/view.radius/DEG);
        state.lat=clamp(state.lat+dy/view.radius/DEG,-89.8,89.8);
        redraw();
      }
    }
    pointers.set(event.pointerId,next);
  }
  readout(unproject(...next));
});
canvas.addEventListener('pointerup',event=>{
  if(!pointers.delete(event.pointerId) || moved || pointers.size || !view) return;
  const [x,y]=position(event);
  const hit=marks.find(mark=>Math.abs(y-mark.y)<9 && x>=mark.x-7 && x<=mark.x+mark.width);
  if(hit) {
    select(hit.feature);
    pickLandingPoint(hit.feature.lat, hit.feature.lon, hit.feature.name);
  } else {
    const point=unproject(x,y);
    if(point) {
      $('dismiss').click();
      pickLandingPoint(...point);
    }
  }
});
canvas.addEventListener('pointercancel',event=>pointers.delete(event.pointerId));
canvas.addEventListener('pointerleave',()=>readout(null));
canvas.addEventListener('wheel',event=>{
  if (document.activeElement !== canvas) return;
  event.preventDefault();
  setZoom(state.zoom*Math.exp(-clamp(event.deltaY,-300,300)*.0018));
},{passive:false});
canvas.addEventListener('keydown',event=>{
  if(event.key==='Enter') {
    event.preventDefault();
    $('dismiss').click();
    pickLandingPoint(state.lat, state.lon);
    return;
  }
  const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'];
  if(!keys.includes(event.key)) return;
  event.preventDefault();
  const step=9/state.zoom;
  if(event.key==='ArrowLeft') state.lon=wrap(state.lon-step);
  if(event.key==='ArrowRight') state.lon=wrap(state.lon+step);
  if(event.key==='ArrowUp') state.lat=clamp(state.lat+step,-89.8,89.8);
  if(event.key==='ArrowDown') state.lat=clamp(state.lat-step,-89.8,89.8);
  if(event.key==='+' || event.key==='=') setZoom(state.zoom*1.3);
  if(event.key==='-') setZoom(state.zoom/1.3);
  redraw();
});
new ResizeObserver(redraw).observe(canvas);
if (window.parent !== window) {
  window.parent.postMessage({ type: 'lunar-atlas:ready' }, location.origin);
}

async function load(path,method='json') {
  const response=await fetch(path);
  if(!response.ok) throw Error(path+' returned '+response.status);
  return response[method]();
}
const image=new Image();
image.onload=()=>{
  if(renderer) renderer.setImage(image);
  else fallbackImage=image;
  redraw();
};
image.onerror=()=>notice('Lunar surface imagery could not be loaded.');
image.src='moon.jpg';

async function loadCompressed(paths) {
  const parts = await Promise.all(paths.map((path) => load(path, 'arrayBuffer')));
  const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream);
}
const datasets=await Promise.allSettled([
  loadCompressed(['features.json.gz']).then(response=>response.json()).then(rows=>{
    features=rows.map(([name,lat,lon,type,diameter,info])=>({name,lat,lon,type,diameter,info})).sort((a,b)=>b.diameter-a.diameter);
  }),
  load('missions.json').then(catalog=>{
    missions=(catalog.rows??catalog.sites).filter(row=>row.arrived).map(row=>({
      name:row.name,lat:row.latitude,lon:row.longitude,type:row.type.replaceAll('-',' '),
      info:[row.site_name,row.operator,row.year].filter(Boolean).join(' · ')
    }));
  }),
  loadCompressed(["elevation.0.part", "elevation.1.part", "elevation.2.part", "elevation.3.part", "elevation.4.part", "elevation.5.part", "elevation.6.part"]).then(response=>response.arrayBuffer()).then(buffer=>{
    elevation=new Int16Array(buffer);
    if(elevation.length!==1440*720) throw Error('Unexpected elevation grid size');
    if(renderer) renderer.setElevation(elevation);
  }),
]);
if(datasets.some(result=>result.status==='rejected')){
  console.warn(datasets);
  notice('Some atlas data could not be loaded.');
}
redraw();
