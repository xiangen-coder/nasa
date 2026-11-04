"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AstroBody, AstroFrame, AstronomyData, Vector3 } from "./astronomy-types";

type Focus = AstroBody | "overview";
const KM_PER_UNIT = 1_000_000;
const RADII = { sun: 695700, earth: 6371, moon: 1737.4 };
const COLORS = { sun: 0xffcc69, earth: 0x89bbdc, moon: 0xd7dfcc };
const BODIES: AstroBody[] = ["sun", "earth", "moon"];
const sceneVector = (v: Vector3) => new THREE.Vector3(v[0], v[2], -v[1]).divideScalar(KM_PER_UNIT);

export default function AstronomyScene({ data, frame }: { data: AstronomyData; frame: AstroFrame }) {
  const host = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus>("earth");
  const [perspective, setPerspective] = useState("oblique");
  const [sizeScale, setSizeScale] = useState(10);
  const [paths, setPaths] = useState(true);
  const [reset, setReset] = useState(0);
  const [error, setError] = useState("");
  const [textureNotice, setTextureNotice] = useState("");
  const labels = useRef<Partial<Record<AstroBody, HTMLSpanElement | null>>>({});
  const current = useRef(frame);
  current.current = frame;
  const meshes = useRef<Partial<Record<AstroBody, THREE.Mesh>>>({});
  const drawState = useRef<((f: AstroFrame) => void) | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError("WebGL is unavailable. All NASA coordinates, distances and timeline controls remain available below."); return; }
    setError(""); setTextureNotice("");
    let active = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "NASA ephemeris positions of the Sun, Earth and Moon. Body sizes may be enlarged; centre distances share one uniform scale. Focus buttons provide keyboard camera access.");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#0b141c");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.00001, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = true;
    controls.minDistance = .003; controls.maxDistance = 1500;
    scene.add(new THREE.AmbientLight(0xc5d5e2, .17));
    const light = new THREE.DirectionalLight(0xfff3d9, 2.7); scene.add(light); scene.add(light.target);
    const ownedTextures: THREE.Texture[] = [];
    const makeSphere = (body: AstroBody) => {
      const material = body === "sun"
        ? new THREE.MeshBasicMaterial({ color: COLORS[body] })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(RADII[body] / KM_PER_UNIT, 64, 48), material);
      mesh.scale.setScalar(sizeScale); scene.add(mesh); meshes.current[body] = mesh;
      if (body === "earth") {
        new GLTFLoader().load("/models/earth.glb", gltf => {
          if (!active) {
            gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose(); m.dispose(); } } });
            return;
          }
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          gltf.scene.position.sub(center);
          const scaled = new THREE.Group(); scaled.add(gltf.scene);
          scaled.scale.setScalar(2 * RADII.earth / KM_PER_UNIT / Math.max(size.x, size.y, size.z));
          material.visible = false; mesh.add(scaled);
          gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const value of Object.values(m)) if (value instanceof THREE.Texture) ownedTextures.push(value); });
        }, undefined, () => { if (active) setTextureNotice("The existing Earth model could not load. Earth uses an untextured reference sphere; its centre still comes from NASA."); });
      } else if (body === "moon") {
        new THREE.TextureLoader().load(`/astronomy/${body}.jpg`, texture => {
          if (!active) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          ownedTextures.push(texture);
          (material as THREE.MeshStandardMaterial).map = texture; material.needsUpdate = true;
        }, undefined, () => { if (active) setTextureNotice("The NASA Moon texture could not load. Body centres still use the returned ephemeris."); });
      }
      return mesh;
    };
    BODIES.forEach(makeSphere);
    // A transparent halo is a visual aid, not the physical solar radius.
    const glow = new THREE.Mesh(new THREE.SphereGeometry(RADII.sun / KM_PER_UNIT * 1.12, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffa83b, transparent: true, opacity: .12, depthWrite: false }));
    glow.scale.setScalar(sizeScale); scene.add(glow);
    const earthPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.earth_path.map(p => sceneVector(p.relative_km))), new THREE.LineBasicMaterial({ color: 0x89bbdc, transparent: true, opacity: .65 }));
    const moonPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.moon_path.map(p => sceneVector(p.relative_km))), new THREE.LineBasicMaterial({ color: 0xd5edac, transparent: true, opacity: .8 }));
    earthPath.visible = paths; moonPath.visible = paths; scene.add(earthPath, moonPath);
    let priorAnchor: THREE.Vector3 | null = null;
    const positions = (f: AstroFrame) => Object.fromEntries(BODIES.map(b => [b, sceneVector(f.bodies[b].position_km)])) as Record<AstroBody, THREE.Vector3>;
    const move = (f: AstroFrame) => {
      const barycentric = positions(f);
      const origin = focus === "overview" ? barycentric.sun : barycentric[focus];
      // One translation and one uniform distance scale for all centres and paths.
      BODIES.forEach(b => meshes.current[b]!.position.copy(barycentric[b]).sub(origin));
      glow.position.copy(meshes.current.sun!.position);
      earthPath.position.copy(meshes.current.sun!.position);
      moonPath.position.copy(meshes.current.earth!.position);
      const anchor = focus === "overview" ? meshes.current.sun!.position.clone() : new THREE.Vector3();
      if (priorAnchor) { const delta = anchor.clone().sub(priorAnchor); camera.position.add(delta); controls.target.add(delta); }
      priorAnchor = anchor;
      light.position.copy(meshes.current.sun!.position);
      light.target.position.copy(meshes.current.earth!.position);
    };
    drawState.current = move; move(current.current);
    const earthMoon = current.current.earth_moon_km / KM_PER_UNIT;
    let distance = focus === "overview" ? 430 : focus === "sun" ? Math.max(10, RADII.sun / KM_PER_UNIT * sizeScale * 5) : focus === "moon" ? Math.max(.025, RADII.moon / KM_PER_UNIT * sizeScale * 8) : Math.max(earthMoon * 2.5, RADII.earth / KM_PER_UNIT * sizeScale * 8);
    if (!Number.isFinite(distance)) distance = 2;
    const target = focus === "overview" ? meshes.current.sun!.position : new THREE.Vector3();
    controls.target.copy(target);
    camera.position.copy(target).add(perspective === "top" ? new THREE.Vector3(0, distance, .0001) : perspective === "edge" ? new THREE.Vector3(0, distance * .03, distance) : new THREE.Vector3(distance * .65, distance * .55, distance));
    camera.lookAt(target); controls.update();
    const resize = () => { const { width, height } = container.getBoundingClientRect(); if (width && height) { renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); } };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    renderer.setAnimationLoop(() => {
      controls.update();
      const { width, height } = container.getBoundingClientRect();
      BODIES.forEach(b => {
        const el = labels.current[b]; if (!el) return;
        const position = meshes.current[b]!.position.clone().project(camera);
        const visible = position.z > -1 && position.z < 1 && Math.abs(position.x) < .92 && Math.abs(position.y) < .9;
        el.hidden = !visible;
        if (visible) { el.style.left = `${(position.x + 1) * width / 2}px`; el.style.top = `${(1 - position.y) * height / 2}px`; }
      });
      renderer.render(scene, camera);
    });
    return () => {
      active = false; drawState.current = null; observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.geometry.dispose(); for (const m of Array.isArray(object.material) ? object.material : [object.material]) m.dispose(); } });
      ownedTextures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove(); meshes.current = {};
    };
  }, [data, focus, perspective, sizeScale, paths, reset]);
  useEffect(() => { drawState.current?.(frame); }, [frame]);

  return <>
    <div className="astro-camera-controls" role="group" aria-label="Astronomy camera controls">
      {(["overview", "sun", "earth", "moon"] as Focus[]).map(b => <button className={`button ${focus === b ? "primary" : "subtle"}`} key={b} aria-pressed={focus === b} onClick={() => setFocus(b)}>{b === "overview" ? "Whole system" : `Focus ${b[0].toUpperCase() + b.slice(1)}`}</button>)}
      <label>Perspective<select value={perspective} onChange={e => setPerspective(e.target.value)}><option value="oblique">Oblique</option><option value="top">Ecliptic north</option><option value="edge">Ecliptic edge</option></select></label>
      <button className="button subtle" onClick={() => setReset(x => x + 1)}>Reset camera</button>
    </div>
    <div className="astro-render-stage">
      <div className="astro-canvas" ref={host} />
      {BODIES.map(b => <span className={`astro-body-label astro-label-${b}`} key={b} ref={el => { labels.current[b] = el; }}>{b[0].toUpperCase() + b.slice(1)}</span>)}
      <div className="astro-stage-caption">{focus === "overview" ? "Sun-centred display" : `${focus[0].toUpperCase() + focus.slice(1)}-centred display`} · uniform distance scale<br />Body radii ×{sizeScale}; glow and labels are visual aids</div>
    </div>
    {error && <p className="info" role="alert">{error}</p>}
    {textureNotice && <p className="info" role="status">{textureNotice}</p>}
    <div className="astro-visual-controls">
      <label>Body radius enlargement ×{sizeScale}<input aria-label="Body radius enlargement" type="range" min={1} max={50} step={1} value={sizeScale} onChange={e => setSizeScale(+e.target.value)} /></label>
      <button className="button subtle" onClick={() => setSizeScale(1)}>Use physical body sizes</button>
      <label className="check-row"><input type="checkbox" checked={paths} onChange={e => setPaths(e.target.checked)} /> Show ephemeris orbital paths</label>
    </div>
    <p className="muted">Rotate by dragging; pan with right-drag or two-finger drag; zoom with the wheel or pinch. Focus Earth or Moon to inspect their separation. At whole-system scale they may overlap visually. Positions retain one common scale; enlarging radii can make the visual spheres overlap. Textures do not represent computed body rotation.</p>
  </>;
}
