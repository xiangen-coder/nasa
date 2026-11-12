"use client";

import { useEffect, useState } from "react";
import type { Site } from "../app/types";

const labels = {
  shadow: "Permanent shadow",
  illumination: "Long-term solar illumination",
  temperature_min: "Observed summer minimum",
  temperature_max: "Observed summer maximum",
  surface_ice: "M³ exposed ice",
  hydrogen: "LEND regional hydrogen",
};
type Layer = keyof typeof labels;
type Reading = {
  status: "available" | "outside_coverage" | "no_data" | "unavailable" | "error";
  value: number | null;
  source_url: string;
  units?: string;
  source?: { name: string; resolution_m?: number; quality?: string; observation_period?: string; documentation?: string; source_url?: string };
  footprint?: { coverage_fraction: number; mean: number | null; minimum: number | null; maximum: number | null };
};
const statuses = {
  available: "Available",
  outside_coverage: "Outside coverage",
  no_data: "No valid pixel",
  unavailable: "Unavailable",
  error: "Could not read the data",
};

const percentage = (value: number) => `${(100 * value).toFixed(1)}%`;
function readingText(layer: Layer, reading: Reading) {
  if (reading.value == null) return statuses[reading.status];
  if (layer === "shadow") return reading.value === 1 ? "Mapped permanent shadow" : "Outside mapped permanent shadow";
  return reading.units === "K" ? `${reading.value.toFixed(1)} K` : percentage(reading.value);
}

export default function WaterEvidence({ location }: { location: Site }) {
  const [open, setOpen] = useState(true);
  const [radius, setRadius] = useState("");
  const [layer, setLayer] = useState<Layer>("shadow");
  const [response, setResponse] = useState<{ query: string; layers?: Record<Layer, Reading>; error?: boolean }>();
  const valid = Number.isFinite(location.latitude) && Number.isFinite(location.longitude) &&
    Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180;
  const coordinates = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude) });
  const mapQuery = coordinates.toString();
  if (radius) coordinates.set("radius_m", radius);
  const query = coordinates.toString();
  useEffect(() => {
    if (!open || !valid) return;
    const controller = new AbortController();
    fetch(`/api/research/water-evidence?${query}`, { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error("Evidence request failed");
        const data: { layers: Record<Layer, Reading> } = await result.json();
        if (!controller.signal.aborted) setResponse({ query, layers: data.layers });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse({ query, error: true });
      });
    return () => controller.abort();
  }, [open, query, valid]);

  const current = response?.query === query ? response : undefined;
  const layers = current?.layers;
  const map = layers?.[layer];
  return (
    <details className="panel water-evidence" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Water/Ice Evidence</summary>
      <p>{location.name} · Permanent shadow and cold temperatures can help preserve ice. Surface ice at this point remains unconfirmed.</p>
      <label>Area to summarize{" "}
        <select value={radius} onChange={(event) => setRadius(event.target.value)}>
          <option value="">Selected point</option>
          <option value="250">250 m radius</option>
          <option value="1000">1 km radius</option>
          <option value="5000">5 km radius</option>
        </select>
      </label>
      {open && !valid && <p>Enter valid lunar coordinates to check coverage.</p>}
      {open && valid && !current && <p role="status">Reading water and ice evidence…</p>}
      {current?.error && <p role="alert">Evidence could not be loaded.</p>}
      {layers && (
        <>
          <dl>
            {(Object.keys(labels) as Layer[]).map((key) => {
              const reading = layers[key];
              const area = reading.footprint;
              return <div key={key}>
                <dt><strong>{labels[key]}</strong></dt>
                <dd>{readingText(key, reading)}{reading.source?.resolution_m ? ` · ${Math.round(reading.source.resolution_m)} m pixels` : ""}</dd>
                {area && <dd>Area coverage {percentage(area.coverage_fraction)}
                  {area.mean != null && (reading.units === "K"
                    ? ` · mapped range ${area.minimum?.toFixed(1)}–${area.maximum?.toFixed(1)} K`
                    : ` · ${key === "shadow" ? "mapped shadow" : "average illumination"} ${percentage(area.mean)} of covered area`)}
                </dd>}
                {reading.source?.quality && <dd>{reading.source.quality}</dd>}
                {reading.source?.observation_period && <dd>Observations {reading.source.observation_period}</dd>}
                <dd><a href={reading.source?.documentation ?? reading.source?.source_url ?? reading.source_url} target="_blank" rel="noreferrer">Source ↗</a></dd>
              </div>;
            })}
          </dl>
          <label>Local evidence map{" "}
            <select value={layer} onChange={(event) => setLayer(event.target.value as Layer)}>
              {(["shadow", "illumination", "temperature_min", "temperature_max"] as const).map((key) =>
                <option key={key} value={key}>{labels[key]}</option>)}
            </select>
          </label>
          {map?.status === "available" ? (
            <figure>
              <div className="water-evidence-map">
                <img key={`${layer}?${mapQuery}`} src={`/api/research/water-evidence/map/${layer}?${mapQuery}`} alt={`${labels[layer]} around the selected point, marked at the centre`} width={258} height={258} />
              </div>
              <figcaption>{layer === "shadow" ? "Dark = permanent shadow · Light = outside mapped shadow"
                : map.units === "K" ? "Dark to light = 0 to 400 K" : "Dark to light = 0% to 100% of modeled sunlit time"}. Transparent pixels have no data. Map axes follow the polar grid.</figcaption>
            </figure>
          ) : <p>{map && statuses[map.status]} for this map layer.</p>}
        </>
      )}
    </details>
  );
}
