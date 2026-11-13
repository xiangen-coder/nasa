"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Site } from "../app/types";

function validPoint(point: unknown): point is Site {
  if (!point || typeof point !== "object") return false;
  const { name, latitude, longitude } = point as Partial<Site>;
  return typeof name === "string" && name.length <= 100 &&
    typeof latitude === "number" && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Math.abs(longitude) <= 180;
}

export type LandingAtlasHandle = { focusGlobe: () => void };

export default function LandingAtlas({ ref, selected, onSelect, radiusKm }: {
  ref: Ref<LandingAtlasHandle>;
  selected: Site;
  onSelect: (point: Site) => void;
  radiusKm?: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const section = useRef<HTMLElement>(null);
  const { name, latitude, longitude } = selected;

  const syncSelection = useCallback(() => {
    const point = { name, latitude, longitude };
    frame.current?.contentWindow?.postMessage({
      type: "lunar-atlas:set-selection",
      point: validPoint(point) ? point : null,
      radiusKm,
    }, window.location.origin);
  }, [name, latitude, longitude, radiusKm]);

  useImperativeHandle(ref, () => ({
    focusGlobe() {
      section.current?.focus({ preventScroll: true });
      section.current?.scrollIntoView({ block: "start", behavior: "instant" });
      frame.current?.contentWindow?.postMessage({ type: "lunar-atlas:show-globe" }, window.location.origin);
    },
  }), []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "lunar-atlas:ready") syncSelection();
      if (event.data?.type === "lunar-atlas:pick" && validPoint(event.data.point)) {
        const { name, latitude, longitude } = event.data.point;
        onSelect({ name, latitude, longitude });
      }
    };
    window.addEventListener("message", receive);
    syncSelection();
    return () => window.removeEventListener("message", receive);
  }, [syncSelection, onSelect]);

  return (
    <section ref={section} className="landing-atlas-picker" aria-label="Choose the research centre on the Moon" tabIndex={-1}>
      <iframe
        ref={frame}
        className="landing-atlas"
        title="Lunar Atlas 3D globe and 2D map"
        src="/lunar-atlas/index.html"
        loading="lazy"
        onLoad={syncSelection}
      />
      <p>Click or tap the Moon to set the research centre.{radiusKm != null && Number.isFinite(radiusKm) && ` The cyan ring marks the ${radiusKm} km search radius.`}</p>
      <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">Open NASA Moon Trek</a>
    </section>
  );
}
