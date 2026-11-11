"use client";

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
  const rows = result.geometry.available ? (result.geometry.series ?? []) : [];
  if (!rows.length)
    return <p>Elevation graph unavailable. {result.geometry.reason}</p>;
  const plotRows = rows.map((row) => ({ ...row, epoch: Date.parse(row.time) }));
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
              tick={{ fill: "var(--elevation-axis, #a8bfdc)", fontSize: 10 }}
            />
            <YAxis
              unit="°"
              tick={{ fill: "var(--elevation-axis, #a8bfdc)", fontSize: 10 }}
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
            <Line
              type="linear"
              dataKey="sun_elevation"
              name="Sun elevation"
              stroke="var(--elevation-sun, #eacb89)"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="earth_elevation"
              name="Earth elevation"
              stroke="var(--elevation-earth, #9ecff2)"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="sun_horizon_deg"
              name="Sun skyline"
              stroke="var(--elevation-sun, #eacb89)"
              strokeDasharray="4 5"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="earth_horizon_deg"
              name="Earth skyline incl. clearance"
              stroke="var(--elevation-earth, #9ecff2)"
              strokeDasharray="4 5"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="outlook-legend">
        <span>
          <i />
          Sun
        </span>
        <span>
          <i />
          Earth
        </span>
        <span>
          {result?.horizon.available
            ? "Dashed curves: terrain thresholds"
            : "Terrain horizon unavailable · reference geometry"}
        </span>
      </div>
    </div>
  );
}
