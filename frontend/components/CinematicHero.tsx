"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Art-directed concept scene. No ephemerides, mission vectors or scoring data. */
export default function CinematicHero({animate=true}:{animate?:boolean}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<{ pause: (value: boolean) => void } | null>(null);
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const [sceneVersion,setSceneVersion] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setReady(false);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.setClearColor(0x030a19, 1);
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
    let disposed = false, userPaused = true, inView = true, graphicsAvailable = true;
    let frame = 0, previous = 0, elapsed = 0, segmentStart = 0;
    const textures = new Set<THREE.Texture>();
    const disposeObject = (root: THREE.Object3D) => {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      root.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
          geometries.add(o.geometry);
          for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          }
          if (o instanceof THREE.InstancedMesh) o.dispose();
        }
        if (o instanceof THREE.Sprite) { materials.add(o.material); if (o.material.map) textures.add(o.material.map); }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    };
    const metal = new THREE.MeshStandardMaterial({ color: 0xc7cbd4, metalness: .83, roughness: .39 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x172335, metalness: .65, roughness: .4 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xb79748, metalness: .87, roughness: .38 });
    const cell = new THREE.MeshPhysicalMaterial({ color: 0x27336e, metalness: .7, roughness: .28, clearcoat: .55 });
    const craft = new THREE.Group(); scene.add(craft);
    const box = (parent: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...position); parent.add(mesh); return mesh;
    };
    const rod = (from: THREE.Vector3, to: THREE.Vector3, radius = .012, material: THREE.Material = metal) => {
      const delta = to.clone().sub(from);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
      mesh.position.copy(from).add(to).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); craft.add(mesh);
    };
    // Foil wrinkles are decorative geometry; this is not a vehicle engineering model.
    const foilGeometry = new THREE.BoxGeometry(1.06, 1.04, .95, 10, 10, 10);
    const positions = foilGeometry.attributes.position, normals = foilGeometry.attributes.normal;
    for (let i = 0; i < positions.count; i++) {
      const wrinkle = .014 * Math.sin(positions.getX(i) * 93 + positions.getY(i) * 71 + positions.getZ(i) * 113);
      positions.setXYZ(i, positions.getX(i) + normals.getX(i) * wrinkle, positions.getY(i) + normals.getY(i) * wrinkle, positions.getZ(i) + normals.getZ(i) * wrinkle);
    }
    foilGeometry.computeVertexNormals(); craft.add(new THREE.Mesh(foilGeometry, metal));
    box(craft, [1.1, .18, .99], [0, -.42, 0], gold);
    box(craft, [.82, .025, .76], [0, .55, 0], dark);
    for (let i = 0; i < 7; i++) box(craft, [.025, .035, .65], [-.32 + i * .105, .58, 0], metal);
    box(craft, [.26, .29, .075], [.27, .1, .51], dark);
    const sensor = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .085, 24), new THREE.MeshStandardMaterial({ color: 0x183b56, metalness: .6, roughness: .15 }));
    sensor.rotation.x = Math.PI / 2; sensor.position.set(.27, .1, .58); craft.add(sensor);
    for (const x of [-.43, .43]) for (const z of [-.36, .36]) {
      const thruster = new THREE.Mesh(new THREE.ConeGeometry(.09, .19, 16, 1, true), dark);
      thruster.position.set(x, -.64, z); craft.add(thruster);
      box(craft, [.065, .045, .065], [x, .54, z], gold);
    }
    const cellsGeometry = new THREE.BoxGeometry(.177, .153, .012);
    const contactsGeometry = new THREE.BoxGeometry(.07, .009, .008);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group(); wing.position.x = side * 2.19; craft.add(wing);
      box(wing, [2.72, 1.53, .045], [0, 0, -.025], dark);
      box(craft, [.65, .065, .065], [side * .78, 0, 0], metal);
      const cells = new THREE.InstancedMesh(cellsGeometry, cell, 112);
      const contacts = new THREE.InstancedMesh(contactsGeometry, metal, 112);
      const transform = new THREE.Object3D();
      for (let row = 0; row < 8; row++) for (let col = 0; col < 14; col++) {
        const index = row * 14 + col;
        transform.position.set((col - 6.5) * .188, (row - 3.5) * .176, .006); transform.updateMatrix(); cells.setMatrixAt(index, transform.matrix);
        transform.position.y += .043; transform.position.z = .017; transform.updateMatrix(); contacts.setMatrixAt(index, transform.matrix);
      }
      wing.add(cells, contacts);
      for (const y of [-.77, .77]) box(wing, [2.78, .035, .06], [0, y, 0], metal);
      for (const x of [-1.38, 0, 1.38]) box(wing, [.032, 1.55, .06], [x, 0, 0], metal);
    }
    // Generic communications dish and antenna, without third-party branding.
    const profile = Array.from({ length: 18 }, (_, i) => {
      const r = i / 17 * .41; return new THREE.Vector2(r, r * r * .72);
    });
    const dish = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: .42, roughness: .35, side: THREE.DoubleSide }));
    dish.rotation.x = Math.PI / 2; dish.position.set(-.15, .95, .05); craft.add(dish);
    rod(new THREE.Vector3(-.15, .5, -.05), new THREE.Vector3(-.15, .95, .05), .035);
    rod(new THREE.Vector3(-.15, .95, .05), new THREE.Vector3(-.15, .95, .47), .014);
    rod(new THREE.Vector3(.36, .47, -.26), new THREE.Vector3(.56, 1.63, -.26), .009);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xb2dfff }));
    beacon.position.set(.56, 1.63, -.26); craft.add(beacon);

    const earth = new THREE.Group(); earth.position.set(2.6, .75, -4.6); scene.add(earth);
    const fallbackPlanet = new THREE.Mesh(new THREE.SphereGeometry(3.25, 64, 48), new THREE.MeshStandardMaterial({ color: 0x16456e, roughness: 1 })); earth.add(fallbackPlanet);
    new GLTFLoader().load("/illustration/earth-lite.glb", gltf => {
      if (disposed) { disposeObject(gltf.scene); textures.forEach(t => t.dispose()); return; }
      const bounds = new THREE.Box3().setFromObject(gltf.scene), size = bounds.getSize(new THREE.Vector3());
      gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()));
      const normalized = new THREE.Group(); normalized.add(gltf.scene);
      normalized.scale.setScalar(6.5 / Math.max(size.x, size.y, size.z));
      gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (material instanceof THREE.MeshStandardMaterial) { material.metalness = 0; material.roughness = 1; }
      }});
      fallbackPlanet.visible = false; earth.add(normalized); render();
    }, undefined, () => { /* The concept planet remains visible if the optional texture is unavailable. */ });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(3.29, 64, 48), new THREE.ShaderMaterial({
      vertexShader: "varying vec3 n; varying vec3 p; void main(){ n=normalize(normalMatrix*normal); vec4 v=modelViewMatrix*vec4(position,1.); p=v.xyz; gl_Position=projectionMatrix*v; }",
      fragmentShader: "varying vec3 n; varying vec3 p; void main(){ float rim=pow(1.-abs(dot(normalize(n),normalize(-p))),4.); gl_FragColor=vec4(.25,.62,1.,rim*.68); }",
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })); earth.add(atmosphere);
    earth.rotation.set(.08, 1.6, -.15);
    scene.add(new THREE.AmbientLight(0xa3b4ef, .75));
    const key = new THREE.DirectionalLight(0xe6f4ff, 3.8); key.position.set(-4, 5, 7); scene.add(key);
    const violet = new THREE.DirectionalLight(0xa76bff, 3); violet.position.set(2, 3, 3); scene.add(violet);
    const blue = new THREE.DirectionalLight(0x64b7ff, 1.2); blue.position.set(-4, -2, 1); scene.add(blue);
    let seed = 240517;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const starPositions = new Float32Array(550 * 3);
    for (let i = 0; i < 550; i++) { starPositions[i * 3] = (rand() - .5) * 45; starPositions[i * 3 + 1] = (rand() - .5) * 25; starPositions[i * 3 + 2] = -10 - rand() * 16; }
    const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xcbdcf9, size: .027, transparent: true, opacity: .8, depthWrite: false })));
    // Decorative graphic trails, not calculated orbits or communications links.
    for (let trail = 0; trail < 3; trail++) {
      const points = Array.from({ length: 150 }, (_, i) => {
        const angle = i / 149 * Math.PI * 1.7;
        return new THREE.Vector3(2.6 + Math.cos(angle) * (4.5 + trail * .7), .75 + Math.sin(angle) * (2 + trail * .5), -3.7 + Math.cos(angle) * .8);
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x6099de, transparent: true, opacity: .13 }));
      line.rotation.z = -.4 + trail * .32; scene.add(line);
    }
    const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 128;
    const ctx = glowCanvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(215,220,255,.8)"); gradient.addColorStop(.08, "rgba(153,146,255,.48)"); gradient.addColorStop(.35, "rgba(96,72,210,.15)"); gradient.addColorStop(1, "rgba(40,60,160,0)");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(glowCanvas); textures.add(texture);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(2.4, 2.4, -.5); glow.scale.set(7, 7, 1); scene.add(glow);
    }
    let portrait = false;
    function render() {
      if (disposed || !graphicsAvailable) return;
      const drift = Math.sin(elapsed * .14);
      craft.position.set((portrait ? 1.1 : 2.3) + Math.sin(elapsed*.23)*.45, (portrait ? -.9 : -.3) + Math.sin(elapsed*.17)*.16, 1+Math.sin(elapsed*.2)*.2);
      craft.rotation.set(.23 + Math.sin(elapsed*.22)*.08, -.42 + Math.sin(elapsed*.25)*.45, -.27 + Math.sin(elapsed*.19)*.08);
      earth.rotation.y = 1.6 + elapsed*.025;
      camera.position.set(drift*.25,.18+Math.cos(elapsed*.14)*.13,portrait?12.4:8.7+Math.cos(elapsed*.16)*.28);
      camera.lookAt(portrait?.25:0,0,0);
      try {renderer.render(scene,camera); element!.dataset.motionSeconds=elapsed.toFixed(2);}
      catch {graphicsAvailable=false;stop();setReady(false);}
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; segmentStart = 0; }
    function tick(now: number) {
      frame = 0;
      if (disposed || !graphicsAvailable || userPaused || !inView || document.hidden) return;
      if (!segmentStart) segmentStart=now-elapsed*1000;
      if (!previous || now - previous >= 1000 / 30) {
        elapsed=(now-segmentStart)/1000;
        previous = now; render();
      }
      frame = requestAnimationFrame(tick);
    }
    function schedule() { stop(); if (!disposed && graphicsAvailable && !userPaused && inView && !document.hidden) frame = requestAnimationFrame(tick); }
    controller.current = { pause(value) { userPaused = value; schedule(); render(); } };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect(); if (!width || !height) return;
      portrait = width / height < 1; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); render();
    };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element);
    const intersection = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; schedule(); }, { threshold: 0 }); intersection.observe(element);
    const visibility = () => schedule(); document.addEventListener("visibilitychange", visibility);
    const contextLost = (event: Event) => { event.preventDefault(); graphicsAvailable=false; stop(); setReady(false); };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const contextRestored=()=>{if(!disposed)setSceneVersion(v=>v+1);};
    renderer.domElement.addEventListener("webglcontextrestored",contextRestored);
    resize(); render(); if(graphicsAvailable)setReady(true);
    return () => {
      disposed = true; stop(); controller.current = null;
      resizeObserver.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("webglcontextrestored",contextRestored);
      disposeObject(scene); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [sceneVersion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPaused(!animate || media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [animate]);
  useEffect(() => { controller.current?.pause(paused); }, [paused, sceneVersion]);
  return (
    <div className="cinematic-visual" role="img" aria-label="Illustration of a generic solar-powered spacecraft passing Earth, with an atmospheric glow and decorative trails. Not a mission simulation." data-motion={!ready ? "static" : paused ? "paused" : "playing"}>
      <div className="cinematic-poster" aria-hidden="true" />
      <div className="cinematic-canvas" ref={host} style={{ opacity: ready ? 1 : 0 }}/>
      <div className="cinematic-shade" aria-hidden="true" />
    </div>
  );
}
