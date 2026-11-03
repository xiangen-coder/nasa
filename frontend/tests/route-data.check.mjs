import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRoute, routeDistances, angularDistance, LUNAR_RADIUS_KM, unitPoint } from '../components/route-data.ts';
const p=(latitude,longitude)=>({latitude,longitude});
test('bundled source has ten preserved waypoints ending at south pole',()=>{
 const points=validateRoute(JSON.parse(readFileSync(new URL('../public/routes/moon-route.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')));
 assert.equal(points.length,10);assert.deepEqual(points[0],p(-85,31.2));assert.deepEqual(points[9],p(-90,-149.00900900900902));
 const distances=routeDistances(points);assert.equal(distances[0],0);assert.ok(distances.every((x,i)=>Number.isFinite(x)&&(i===0||x>distances[i-1])));
});
test('known quarter-circle distance uses the documented lunar radius',()=>{
 const result=routeDistances([p(0,0),p(0,90)]);assert.ok(Math.abs(result[1]-Math.PI/2*LUNAR_RADIUS_KM)<1e-9);
});
test('dateline uses the short arc, not a 358-degree detour',()=>{
 assert.ok(Math.abs(angularDistance(p(0,179),p(0,-179))-2*Math.PI/180)<1e-12);
});
test('longitude is physically degenerate at the pole',()=>{
 assert.ok(angularDistance(p(-90,0),p(-90,130))<1e-12);
});
test('duplicates are valid zero-distance segments',()=>{
 assert.deepEqual(routeDistances(validateRoute([p(-85,30),p(-85,30)])),[0,0]);
});
test('reject malformed, nonnumeric, out-of-range, and ambiguous antipodal routes',()=>{
 for(const input of [null,{},[],[p(0,0)], [p(91,0),p(0,0)], [p(0,181),p(0,0)], [p('1',0),p(0,0)], [p(NaN,0),p(0,0)], [p(0,0),p(0,180)], Array(2001).fill(p(0,0))]) assert.throws(()=>validateRoute(input));
});
test('coordinate axes agree with the documented 3D convention',()=>{
 assert.deepEqual(unitPoint(p(0,0)),[1,0,-0]);assert.ok(Math.abs(unitPoint(p(0,90))[2]+1)<1e-12);assert.equal(unitPoint(p(90,0))[1],1);
});
