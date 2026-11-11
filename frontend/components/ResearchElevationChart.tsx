"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Research } from "./LandingResearch";
const curves = [
  { key: "sun_elevation", label: "Sun elevation", stroke: "var(--elevation-sun, #eacb89)" },
  { key: "earth_elevation", label: "Earth elevation", stroke: "var(--elevation-earth, #9ecff2)" },
  { key: "sun_horizon_deg", label: "Sun terrain horizon", stroke: "var(--elevation-sun, #eacb89)", dash: "4 5" },
  { key: "earth_horizon_deg", label: "Earth horizon + clearance", stroke: "var(--elevation-earth, #9ecff2)", dash: "4 5" },
] as const;
export const formatVisibilityTime = (value: string | number) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ResearchElevationChart({
  result,
  selectedTime,
}: {
  result: Research;
  selectedTime?: string;
}) {
  const [isolated, setIsolated] = useState<string | null>(null);
  const rows = result.geometry.available ? (result.geometry.series ?? []) : [];
  if (!rows.length)
    return <p>Elevation graph unavailable. {result.geometry.reason}</p>;
  const plotRows = rows.map((row) => ({ ...row, epoch: Date.parse(row.time) }));
  const available = curves.filter(({ key }) => rows.some((row) => typeof row[key] === "number"));
  const active = available.find(({ key }) => key === isolated);
  return (
    <div className="research-elevation-chart">
      <div
        className="outlook-chart"
        role="img"
        aria-label="Sun and Earth elevations and terrain horizons over the selected mission window in UTC"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 640, height: 250 }}
        >
          <LineChart
            data={plotRows}
            margin={{ top: 14, right: 14, bottom: 0, left: -12 }}
          >
            <CartesianGrid
              stroke="var(--elevation-grid, #dce9ff16)"
              vertical={false}
            />
            <XAxis
              dataKey="epoch"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) =>
                new Date(v).toLocaleString("en-GB", {
                  timeZone: "UTC",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }
              minTickGap={50}
              tick={{ fill: "var(--elevation-axis, #a8bfdc)", fontSize: 14 }}
            />
            <YAxis
              unit="°"
              tick={{ fill: "var(--elevation-axis, #a8bfdc)", fontSize: 14 }}
            />
            <Tooltip
              labelFormatter={(v) => `${formatVisibilityTime(Number(v))} UTC`}
              formatter={(v: number) => `${v.toFixed(2)}°`}
              contentStyle={{
                background: "#101e35",
                border: "1px solid #c5d9f644",
                borderRadius: 12,
                color: "#edf2f8",
              }}
            />
            {selectedTime && (
              <ReferenceLine
                x={Date.parse(selectedTime)}
                stroke="#e7edf8"
                strokeDasharray="3 4"
              />
            )}
            {(active ? [active] : available).map((curve) => (
              <Line key={curve.key} type="linear" dataKey={curve.key} name={curve.label}
                stroke={curve.stroke} strokeDasharray={"dash" in curve ? curve.dash : undefined}
                strokeWidth={"dash" in curve ? 1 : 2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="elevation-series" role="group" aria-label="Graph series">
        {available.map((curve) => (
          <button key={curve.key} type="button" className="button subtle" aria-pressed={active?.key === curve.key}
            onClick={() => setIsolated(active?.key === curve.key ? null : curve.key)}>
            <span className="elevation-swatch" aria-hidden="true" style={{
              borderColor: curve.stroke, borderTopStyle: "dash" in curve ? "dashed" : "solid",
            }} />
            {curve.label}
          </button>
        ))}
        {active && <button type="button" className="button subtle elevation-show-all" onClick={() => setIsolated(null)}>Show all curves</button>}
      </div>
      {!result.horizon.available && <p className="muted">Terrain horizon unavailable · reference geometry</p>}
    </div>
  );
}
