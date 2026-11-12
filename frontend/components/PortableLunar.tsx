"use client";

import Script from "next/script";
import { createElement, useState } from "react";
import type { Site } from "../app/types";

function PortableElement({
  name,
  attributes,
  label,
}: {
  name: "lunar-education" | "lunar-journey";
  attributes: Record<string, string>;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Script src={`/${name}/${name}.js`} onError={() => setFailed(true)} />
      {createElement(
        name,
        attributes,
        <p className="panel empty" role="status">
          {failed ? `Could not load ${label}. Refresh to try again.` : `Loading ${label}…`}
        </p>,
      )}
    </>
  );
}

export function PortableEducation({ animate }: { animate: boolean }) {
  return (
    <PortableElement
      name="lunar-education"
      label="Education Mode"
      attributes={{
        "storage-key": "lunar-navigator-moon-landing-101-v1",
        animate: String(animate),
      }}
    />
  );
}

export function PortableJourney({ target, animate }: { target: Site; animate: boolean }) {
  return (
    <PortableElement
      name="lunar-journey"
      label="Lunar Journey"
      attributes={{
        name: target.name,
        latitude: String(target.latitude),
        longitude: String(target.longitude),
        animate: String(animate),
        "asset-base-url": "/models/",
      }}
    />
  );
}
