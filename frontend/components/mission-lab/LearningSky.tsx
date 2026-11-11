"use client";
import { useEffect, useId, useState } from "react";
import type { Analysis, Row } from "../../app/types";
/** Plot returned angular coordinates only; no astronomy or visibility calculation is performed here. */
export default function LearningSky({
  analysis,
  sample,
  index,
}: {
  analysis: Analysis;
  sample: Row;
  index: number;
}) {
  const [compact, setCompact] = useState(false);
  const pattern = useId().replaceAll(":", "");
  useEffect(() => {
    const q = window.matchMedia("(max-width:600px)");
    const update = () => setCompact(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  const width = compact ? 360 : 900,
    height = compact ? 240 : 280,
    left = compact ? 38 : 54,
    right = width - left;
  const x = (az: number) => left + (az / 360) * (right - left),
    y = (el: number) => 28 + ((90 - el) / 180) * (height - 76);
  const terrain =
    analysis.terrain.available && analysis.terrain.horizon?.length
      ? analysis.terrain.horizon
      : null;
  const line = (clearance: number) =>
    terrain
      ? [...terrain, { ...terrain[0], azimuth: 360 }]
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${x(p.azimuth)},${y(p.elevation + clearance)}`,
          )
          .join(" ")
      : `M${left},${y(clearance)} L${right},${y(clearance)}`;
  const start = Date.parse(analysis.series[0].time),
    duration =
      Date.parse(analysis.series[analysis.series.length - 1].time) - start;
  const tracks = [
    { key: "sun_visible", label: "Sun" },
    { key: "earth_visible", label: "Earth" },
    { key: "simultaneous", label: "Both" },
  ] as const;
  return (
    <div className="learning-sky">
      <svg
        className="angular-sky"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Calculated local sky: Sun elevation ${sample.sun_elevation.toFixed(1)} degrees, Earth elevation ${sample.earth_elevation.toFixed(1)} degrees. Horizontal positions show azimuth.`}
      >
        <rect
          x={left}
          y="28"
          width={right - left}
          height={height - 76}
          rx="12"
          fill="#edf5fa"
        />
        {[-90, 0, 90].map((el) => (
          <g key={el}>
            <line x1={left} x2={right} y1={y(el)} y2={y(el)} stroke="#c6d5dd" />
            <text x={left - 8} y={y(el) + 5} textAnchor="end">
              {el}°
            </text>
          </g>
        ))}
        <path
          d={line(0)}
          stroke="#667085"
          strokeWidth="2"
          fill="none"
          strokeDasharray={terrain ? undefined : "7 5"}
        />
        {analysis.mission.clearance_deg > 0 && (
          <path
            d={line(analysis.mission.clearance_deg)}
            stroke="#146b73"
            strokeWidth="2"
            strokeDasharray="3 5"
            fill="none"
          />
        )}
        <g
          transform={`translate(${x(sample.sun_azimuth)},${y(sample.sun_elevation)})`}
        >
          <circle r="14" fill="#f4c95d" stroke="#7a4e00" strokeWidth="2" />
          <text x="0" y="-22" textAnchor="middle">
            Sun
          </text>
        </g>
        <g
          transform={`translate(${x(sample.earth_azimuth)},${y(sample.earth_elevation)})`}
        >
          <circle r="13" fill="#68b7e3" stroke="#17324d" strokeWidth="2" />
          <path
            d="M-8,-5 L-1,-9 L6,-3 L1,3 L5,8 L-3,10 L-5,2Z"
            fill="#146b73"
          />
          <text x="0" y="-21" textAnchor="middle">
            Earth
          </text>
        </g>
        {[
          [0, "N"],
          [90, "E"],
          [180, "S"],
          [270, "W"],
          [360, "N"],
        ].map(([az, label]) => (
          <text
            key={az}
            x={x(az as number)}
            y={height - 23}
            textAnchor="middle"
          >
            {label} · {az}°
          </text>
        ))}
      </svg>
      <p className="sky-key">
        {terrain
          ? "Solid line: sampled terrain horizon."
          : "Dashed line: reference plane; terrain is not measured."}
        {analysis.mission.clearance_deg > 0
          ? ` Teal dotted line includes ${analysis.mission.clearance_deg}° Earth clearance.`
          : ""}
      </p>
      <div className="learning-tracks">
        {tracks.map((track) => (
          <div className="learning-track" key={track.key}>
            <span>{track.label}</span>
            <svg
              viewBox="0 0 1000 26"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${track.label} visibility during the selected stay: filled when visible, striped when below threshold.`}
            >
              <defs>
                <pattern
                  id={`${pattern}-${track.key}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="#e8edf0" />
                  <path d="M0,6 L6,0" stroke="#b8c5ce" />
                </pattern>
              </defs>
              {analysis.series.slice(0, -1).map((row, i) => (
                <rect
                  key={row.time}
                  x={((Date.parse(row.time) - start) / duration) * 1000}
                  y="0"
                  width={
                    ((Date.parse(analysis.series[i + 1].time) -
                      Date.parse(row.time)) /
                      duration) *
                    1000
                  }
                  height="26"
                  fill={
                    row[track.key] ? "#146b73" : `url(#${pattern}-${track.key})`
                  }
                />
              ))}
              <line
                x1={
                  ((Date.parse(analysis.series[index].time) - start) /
                    duration) *
                  1000
                }
                x2={
                  ((Date.parse(analysis.series[index].time) - start) /
                    duration) *
                  1000
                }
                y1="0"
                y2="26"
                stroke="#17324d"
                strokeWidth="4"
              />
            </svg>
          </div>
        ))}
      </div>
      <p className="sky-key">
        Filled = visible · striped = below threshold · marker = your selected
        moment.
      </p>
    </div>
  );
}
