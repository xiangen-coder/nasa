export const DEG = Math.PI/180;
export const MOON_RADIUS = 1737.4;
export const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
export const wrap = n=>((n+180)%360+360)%360-180;
export const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function vector(lat,lon) {
  const a=lat*DEG,b=lon*DEG;
  return [Math.cos(a)*Math.sin(b),Math.sin(a),Math.cos(a)*Math.cos(b)];
}
export const coordinates = ([x,y,z])=>[Math.asin(clamp(y,-1,1))/DEG,Math.atan2(x,z)/DEG];
export function southPolarPosition(lat, lon) {
  const distance = 2 * MOON_RADIUS * Math.tan((lat + 90) * DEG / 2);
  return [distance * Math.sin(lon * DEG), distance * Math.cos(lon * DEG)];
}
export function southPolarCoordinates(east, north) {
  const distance = Math.hypot(east, north);
  return [
    2 * Math.atan(distance / (2 * MOON_RADIUS)) / DEG - 90,
    distance === 0 ? 0 : Math.atan2(east, north) / DEG,
  ];
}
export function cameraBasis(lat,lon) {
  const a=lat*DEG,b=lon*DEG;
  return [[Math.cos(b),0,-Math.sin(b)],[-Math.sin(a)*Math.sin(b),Math.cos(a),-Math.sin(a)*Math.cos(b)],vector(lat,lon)];
}
export function geodesic(a,b,count=120) {
  const start=vector(...a),end=vector(...b);
  const cosine=clamp(dot(start,end),-1,1),angle=Math.acos(cosine);
  let tangent=end.map((value,i)=>value-cosine*start[i]);
  let magnitude=Math.hypot(...tangent);
  if(magnitude<1e-10){
    tangent=cameraBasis(...a)[0];
    magnitude=1;
  }
  const points=Array.from({length:count+1},(_,i)=>{
    const step=angle*i/count;
    return coordinates(start.map((value,j)=>value*Math.cos(step)+tangent[j]/magnitude*Math.sin(step)));
  });
  return {points,distance:angle*MOON_RADIUS};
}
export function lighting(date) {
  const days=(Date.parse(date+'T12:00:00Z')-Date.UTC(2000,0,6,18,14))/86400000;
  const cycle=((days/29.530588853)%1+1)%1;
  const phase=Math.round(cycle*8)%8;
  const names=['New Moon','Waxing crescent','First quarter','Waxing gibbous','Full Moon','Waning gibbous','Last quarter','Waning crescent'];
  const icons=['●','☽','◑','◕','○','◕','◐','☾'];
  const longitude=wrap(180-cycle*360);
  return {name:names[phase],icon:icons[phase],percent:Math.round(50*(1-Math.cos(cycle*2*Math.PI))),longitude,sun:vector(1.54*Math.sin(days/346.62*2*Math.PI),longitude)};
}
