"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Decorative surface model. Orientation is illustrative, never an ephemeris. */
export default function HeroMoon() {
  const host = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
    catch { setAvailable(false); return; }
    let disposed = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    camera.position.set(0, 0, 4.3);
    const material = new THREE.MeshStandardMaterial({ color: 0xd0d2d8, roughness: 1 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), material);
    sphere.rotation.y = 2.25;
    scene.add(sphere, new THREE.AmbientLight(0xcbd8f5, 1.1));
    const light = new THREE.DirectionalLight(0xfff1df, 2.3);
    light.position.set(-3, 3, 5); scene.add(light);
    const render = () => { if (!disposed) renderer.render(scene, camera); };
    const texture = new THREE.TextureLoader().load("/astronomy/moon.jpg", () => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace; material.map = texture;
      material.needsUpdate = true; render();
    });
    element.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Illustrative 3D Moon. Drag or use arrow keys to rotate; scroll to zoom. Not a predicted lunar orientation.");
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.minDistance = 3.4; controls.maxDistance = 6;
    controls.enableDamping = false; controls.addEventListener("change", render);
    const key = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault(); sphere.rotation.y += event.key === "ArrowLeft" ? -.12 : event.key === "ArrowRight" ? .12 : 0;
      sphere.rotation.x += event.key === "ArrowUp" ? -.12 : event.key === "ArrowDown" ? .12 : 0; render();
    };
    renderer.domElement.addEventListener("keydown", key);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height; camera.updateProjectionMatrix();
      renderer.setSize(width, height); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => {
      disposed = true; observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("keydown", key);
      sphere.geometry.dispose(); material.dispose(); texture.dispose(); renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div className="hero-moon-wrap">
    <div className={`hero-moon ${available ? "" : "hero-moon-fallback"}`} ref={host} />
    <p className="hero-moon-caption">{available ? "Drag to explore" : "Lunar surface texture"} · illustrative model</p>
  </div>;
}
