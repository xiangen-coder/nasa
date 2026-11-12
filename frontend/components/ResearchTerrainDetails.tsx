"use client";

import { useState } from "react";
import type { Research } from "./LandingResearch";

const num = (value: number, unit: string) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 2 }) + unit;

export default function ResearchTerrainDetails({
  result,
}: {
  result: Research;
}) {
  const [mapLayer, setMapLayer] = useState<"slope" | "elevation">("slope");
  const [imagery, setImagery] = useState<"nac" | "psr" | null>(null);
  const [imageError, setImageError] = useState(false);
  const grid = result.terrain.grid ?? [];
  const elevations = grid.map((point) => point.elevation_m);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);

  return (
    <>
      {grid.length > 0 && (
        <details className="explanation">
          <summary>Local terrain layer: slope / elevation</summary>
          <label>
            Terrain layer
            <select
              value={mapLayer}
              onChange={(e) =>
                setMapLayer(e.target.value as "slope" | "elevation")
              }
            >
              <option value="slope">Slope (0° blue → 30° red)</option>
              <option value="elevation">
                Elevation (local minimum blue → maximum red)
              </option>
            </select>
          </label>
          <svg
            className="research-terrain"
            viewBox="-110 -110 220 220"
            role="img"
            aria-label="Measured local terrain grid, projected grid +Y up, selected point at centre"
          >
            {grid.map((p, i) => {
              const value =
                mapLayer === "slope"
                  ? p.slope_deg / 30
                  : (p.elevation_m - minElevation) /
                    (maxElevation - minElevation || 1);
              return (
                <rect
                  key={i}
                  x={(p.east_m / (result.terrain.radius_m || 100)) * 100 - 4}
                  y={(-p.north_m / (result.terrain.radius_m || 100)) * 100 - 4}
                  width="8"
                  height="8"
                  fill={`hsl(${220 - 220 * Math.min(1, Math.max(0, value))} 65% 50%)`}
                >
                  <title>
                    {num(p.elevation_m, " m")} / {num(p.slope_deg, "°")}
                  </title>
                </rect>
              );
            })}
            <circle r="2" fill="white" />
            <text x="0" y="-103" fill="white" fontSize="8">
              +Y
            </text>
          </svg>
          <p className="muted">
            The white dot marks the selected point. In slope view, warmer colors
            indicate steeper ground. In elevation view, warmer colors indicate
            higher ground within this window. Each square represents a plotted
            sample of the elevation model.
          </p>
        </details>
      )}
      <h3>LROC surface inspection</h3>
      <p className="muted">
        NAC south-pole mosaic: native 1 m/pixel, acquired 23 July–11 December
        2010; uncontrolled image registration. Preview spans 4 km (7.8 m per
        displayed pixel), projected grid +Y up. It cannot resolve or certify all
        boulders. PSR imagery is context, not an ice-abundance or hazard score.
      </p>
      <div className="astro-camera-controls">
        <button
          className="button subtle"
          disabled={result.mission.latitude > -85.5}
          onClick={() => {
            setImagery("nac");
            setImageError(false);
          }}
        >
          Load LROC regional image
        </button>
        <button
          className="button subtle"
          disabled={result.mission.latitude > -85.5}
          onClick={() => {
            setImagery("psr");
            setImageError(false);
          }}
        >
          Inspect PSR imagery
        </button>
        <a
          href="https://quickmap.lroc.im-ldi.com/"
          target="_blank"
          rel="noreferrer"
        >
          Open LROC QuickMap
        </a>
      </div>
      {imagery && !imageError && (
        <figure>
          <img
            className="research-image"
            src={`/api/research/imagery?latitude=${result.mission.latitude}&longitude=${result.mission.longitude}&layer=${imagery}`}
            alt={`LROC ${imagery} image centred on ${result.mission.name}. Dark or blank areas do not imply hazard-free terrain.`}
            onError={() => setImageError(true)}
          />
          <figcaption>
            NASA/GSFC/LROC · centre {result.mission.latitude}°,{" "}
            {result.mission.longitude}° · 4 km square; no automatic hazard
            detections.
          </figcaption>
        </figure>
      )}
      {imageError && (
        <p className="info">
          LROC preview unavailable. Use QuickMap and enter the coordinates shown
          in the result.
        </p>
      )}
    </>
  );
}
