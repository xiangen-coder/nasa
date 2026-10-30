"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { USDLoader } from "three/addons/loaders/USDLoader.js";
import { Earth, Moon, Sun, Orbit, Upload, RotateCcw } from "lucide-react";
import type { Row } from "../app/types";

type Body = "moon" | "earth" | "sun" | "sky";
function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}
function direction(azimuth: number, elevation: number) {
  const a = THREE.MathUtils.degToRad(azimuth),
    e = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(
    Math.cos(e) * Math.sin(a),
    Math.sin(e),
    -Math.cos(e) * Math.cos(a),
  );
}
export default function CelestialViewer({ sample }: { sample?: Row }) {
  const mount = useRef<HTMLDivElement>(null),
    skyBodies = useRef<{ sun: THREE.Mesh; earth: THREE.Mesh } | null>(null);
  const [body, setBody] = useState<Body>("moon"),
    [status, setStatus] = useState("Preparing 3D view…"),
    [error, setError] = useState(""),
    [reset, setReset] = useState(0);
  const [local, setLocal] = useState<{ url: string; name: string } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (local) URL.revokeObjectURL(local.url);
    },
    [local],
  );
  useEffect(() => {
    if (!mount.current) return;
    const container = mount.current;
    let active = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        "WebGL is unavailable. Try a browser with hardware acceleration. The 2D simulator remains available.",
      );
      setStatus("3D unavailable");
      return;
    }
    setError("");
    setStatus("Preparing 3D view…");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive celestial 3D view",
    );
    renderer.domElement.setAttribute("role", "img");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b141c");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(3, 1.7, 5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 14;
    controls.enablePan = false;
    scene.add(new THREE.HemisphereLight(0xe7f0ff, 0x343e4a, 2.2));
    const light = new THREE.DirectionalLight(0xfff2dc, 3);
    light.position.set(4, 3, 5);
    scene.add(light);
    const root = new THREE.Group();
    scene.add(root);
    const sphere = (radius: number, color: number) =>
      new THREE.Mesh(
        new THREE.SphereGeometry(radius, 64, 40),
        new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      );
    const fallback = sphere(
      1.45,
      body === "sun" ? 0xf3ac42 : body === "earth" ? 0x4a86ad : 0x949b9c,
    );
    root.add(fallback);
    const normalize = (object: THREE.Group) => {
      const box = new THREE.Box3().setFromObject(object),
        size = box.getSize(new THREE.Vector3()),
        center = box.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(extent) || extent <= 0)
        throw Error("The model has no renderable geometry.");
      object.position.sub(center);
      const group = new THREE.Group();
      group.add(object);
      group.scale.setScalar(2.9 / extent);
      return group;
    };
    const loaded = (object: THREE.Group) => {
      if (!active) {
        dispose(object);
        return;
      }
      try {
        const normalized = normalize(object);
        root.remove(fallback);
        dispose(fallback);
        root.add(normalized);
        setStatus(
          body === "moon"
            ? "Local lunar model · orientation unverified"
            : `Uploaded ${body === "earth" ? "Earth" : "Sun"} model loaded`,
        );
      } catch {
        dispose(object);
        setError("The model could not be framed. Showing a reference sphere.");
      }
    };
    if (body === "sky") {
      root.remove(fallback);
      dispose(fallback);
      camera.position.set(6, 4, 7);
      controls.maxDistance = 20;
      const grid = new THREE.GridHelper(10, 10, 0x819d80, 0x263e45);
      root.add(grid);
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from(
            { length: 128 },
            (_, i) =>
              new THREE.Vector3(
                4 * Math.cos((i * Math.PI) / 64),
                0,
                4 * Math.sin((i * Math.PI) / 64),
              ),
          ),
        ),
        new THREE.LineBasicMaterial({ color: 0x82967f }),
      );
      root.add(ring);
      const sun = sphere(0.24, 0xf2d777),
        earth = sphere(0.18, 0x7bbadd);
      root.add(sun, earth);
      skyBodies.current = { sun, earth };
      const observer = sphere(0.08, 0xe9f2d5);
      root.add(observer);
      // Axis helper: red = east (X), green = zenith (Y), blue = south (+Z).
      root.add(new THREE.AxesHelper(1.1));
      setStatus("Local sky · geometric body-center directions");
    } else if (body === "moon" && !local) {
      const pole = sphere(0.045, 0xd5f0a4);
      pole.position.set(0, -1.48, 0);
      root.add(pole);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, -1.48, 0),
          new THREE.Vector3(1.7, -1.8, 0),
        ]),
        new THREE.LineBasicMaterial({ color: 0xd5f0a4 }),
      );
      root.add(line);
      setStatus("Reference Moon · spherical, no measured topography");
    } else if (body === "moon" && local) {
      setStatus(`Loading ${local.name}…`);
      if (local.name.toLowerCase().endsWith(".usdz"))
        new USDLoader().load(local.url, loaded, undefined, () => {
          if (active) {
            setError(
              "This USDZ variant is unsupported. Export a self-contained GLB to view it here.",
            );
            setStatus("Reference sphere · import failed");
          }
        });
      else
        new GLTFLoader().load(
          local.url,
          (g) => loaded(g.scene),
          undefined,
          () => {
            if (active) {
              setError(
                "Unable to load this GLB. Use a self-contained, uncompressed GLB.",
              );
              setStatus("Reference sphere · import failed");
            }
          },
        );
    } else {
      setStatus(`Loading uploaded ${body} model…`);
      new GLTFLoader().load(
        `/models/${body}.glb`,
        (g) => loaded(g.scene),
        undefined,
        () => {
          if (active) {
            setError(
              "Model download failed. Showing a reference sphere, not the uploaded asset.",
            );
            setStatus("Reference sphere · asset unavailable");
          }
        },
      );
    }
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width && height) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      active = false;
      skyBodies.current = null;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [body, local, reset]);
  useEffect(() => {
    if (skyBodies.current) {
      skyBodies.current.sun.visible = !!sample;
      skyBodies.current.earth.visible = !!sample;
      if (!sample) return;
      skyBodies.current.sun.position.copy(
        direction(sample.sun_azimuth, sample.sun_elevation).multiplyScalar(4),
      );
      skyBodies.current.earth.position.copy(
        direction(sample.earth_azimuth, sample.earth_elevation).multiplyScalar(
          4,
        ),
      );
    }
  }, [sample, body, local, reset]);
  return (
    <section className="panel observatory">
      <div className="panel-heading">
        <div>
          <h2>
            <Orbit size={17} /> 3D observatory
          </h2>
          <p>Inspect the supplied assets or explore your computed local sky.</p>
        </div>
      </div>
      <div className="body-tabs" role="group" aria-label="3D view selection">
        {(
          [
            { key: "moon", label: "Moon", icon: Moon },
            { key: "earth", label: "Earth", icon: Earth },
            { key: "sun", label: "Sun", icon: Sun },
            { key: "sky", label: "Computed local sky", icon: Orbit },
          ] as const
        ).map((item) => (
          <button
            className={body === item.key ? "selected" : ""}
            onClick={() => setBody(item.key)}
            key={item.key}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
        <button
          aria-label="Reset 3D camera"
          onClick={() => setReset((v) => v + 1)}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="celestial-stage">
        <div className="celestial-canvas" ref={mount} />
        <div className="stage-overlay">
          <span className="tag">
            {body === "sky"
              ? "LOCAL TANGENT FRAME"
              : "VISUAL REFERENCE · NOT TO SCALE"}
          </span>
          <span>
            {body === "sky"
              ? "N = −Z · E = +X · up = +Y"
              : "Drag to orbit · scroll to zoom"}
          </span>
        </div>
        {body === "moon" && !local && (
          <div className="pole-label">
            South pole · 90° S<br />
            <small>Reference sphere only</small>
          </div>
        )}
      </div>
      <div className="model-status" role="status" aria-label="3D model status">
        {status}
      </div>
      {error && (
        <div className="info" role="alert">
          {error}
        </div>
      )}
      <div className="observatory-details">
        {body === "moon" ? (
          <>
            <p>
              The uploaded Moon USDZ exceeded the 32 MB transfer limit and is
              not bundled. Import your local file below. Imported orientation
              and relief are unverified; meshes are never used as LOLA terrain
              measurements.
            </p>
            <label className="button subtle model-import">
              <Upload size={14} /> Import local Moon GLB / USDZ
              <input
                aria-label="Import local Moon model"
                type="file"
                accept=".glb,.usdz"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 100 * 1024 * 1024) {
                    setError(
                      "Please use a model smaller than 100 MB for browser performance.",
                    );
                    return;
                  }
                  if (!/\.(glb|usdz)$/i.test(file.name)) {
                    setError("Choose a GLB or USDZ model.");
                    return;
                  }
                  setLocal({ url: URL.createObjectURL(file), name: file.name });
                }}
              />
            </label>
            {local && (
              <button className="text-button" onClick={() => setLocal(null)}>
                Use reference sphere
              </button>
            )}
          </>
        ) : body === "sky" ? (
          <>
            <p>
              {sample
                ? `Computed sample: ${new Date(sample.time).toUTCString()}. Sun azimuth ${sample.sun_azimuth.toFixed(2)}°, elevation ${sample.sun_elevation.toFixed(2)}°; Earth azimuth ${sample.earth_azimuth.toFixed(2)}°, elevation ${sample.earth_elevation.toFixed(2)}°.`
                : "Run an analysis first to position the Sun and Earth. No directions are invented."}
            </p>
            <p>
              Yellow: Sun center · blue: Earth center. Both are drawn at the
              same display distance. The grid is the zero-degree reference
              plane, not a measured terrain horizon or a flight trajectory.
            </p>
          </>
        ) : (
          <>
            <p>
              User-supplied {body === "earth" ? "Earth" : "Sun"} model,
              normalized for inspection. Texture orientation, illumination, size
              and rotation do not represent the selected mission time.
            </p>
            <div className="reference-links">
              <a href={`/models/${body}.glb`} download>
                Download GLB
              </a>
              <a href={`/models/${body}.usdz`} download>
                Download USDZ
              </a>
            </div>
          </>
        )}
        {body === "sky" && !sample && (
          <p className="info">
            The local sky has no calculated sample yet. Use Analyze site or load
            a verified example.
          </p>
        )}
      </div>
    </section>
  );
}
