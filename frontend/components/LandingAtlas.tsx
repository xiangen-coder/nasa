"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Site } from "../app/types";

function validPoint(point: unknown): point is Site {
  if (!point || typeof point !== "object") return false;
  const { name, latitude, longitude } = point as Partial<Site>;
  return typeof name === "string" && name.length <= 100 &&
    typeof latitude === "number" && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Math.abs(longitude) <= 180;
}

export default function LandingAtlas({ selected, onSelect }: {
  selected: Site;
  onSelect: (point: Site) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { name, latitude, longitude } = selected;

  const syncSelection = useCallback(() => {
    const point = { name, latitude, longitude };
    frame.current?.contentWindow?.postMessage({
      type: "lunar-atlas:set-selection",
      point: validPoint(point) ? point : null,
    }, window.location.origin);
  }, [name, latitude, longitude]);

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
    <iframe
      ref={frame}
      className="landing-atlas"
      title="Lunar Atlas 3D globe and 2D map"
      src="/lunar-atlas/index.html"
      loading="lazy"
      onLoad={syncSelection}
    />
  );
}
