"use client";
import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Analysis } from "../../app/types";
import { threshold, unavailableWindows, type Energy } from "./scenario-science";
export type Highlight = { start: string; end: string; body: "sun" | "earth" };
const colors = { sun: "#c98c14", earth: "#468fd9" };
export default function ScenarioCharts({
  analysis: a,
  energy,
  highlight,
}: {
  analysis: Analysis;
  energy?: Energy;
  highlight?: Highlight | null;
}) {
  const [body, setBody] = useState<"both" | "sun" | "earth">("both"),
    [axis, setAxis] = useState<"elapsed" | "utc">("elapsed");
  const id = useId();
  const start = Date.parse(a.mission.start),
    end = Date.parse(a.mission.end);
  const data = useMemo(
    () =>
      a.series.map((r, i) => ({
        ...r,
        x: Date.parse(r.time),
        elapsed: (Date.parse(r.time) - start) / 3600000,
        sun_threshold: threshold(a, r, "sun"),
        earth_threshold: threshold(a, r, "earth"),
        sun_status: r.sun_visible ? 1 : 0,
        earth_status: r.earth_visible ? 1 : 0,
        ...energy?.samples[i],
      })),
    [a, energy, start],
  );
  const extent = [
    Math.min(
      -2,
      ...data.flatMap((r) => [
        r.sun_elevation,
        r.earth_elevation,
        r.sun_threshold,
        r.earth_threshold,
      ]),
    ),
    Math.max(
      2,
      ...data.flatMap((r) => [
        r.sun_elevation,
        r.earth_elevation,
        r.sun_threshold,
        r.earth_threshold,
      ]),
    ),
  ];
  const shown = (["sun", "earth"] as const).filter(
    (b) => body === "both" || body === b,
  );
  const tick = (value: number) =>
    axis === "elapsed"
      ? `${((value - start) / 3600000).toFixed(0)} h`
      : new Date(value).toISOString().slice(5, 16).replace("T", " ");
  const xAxis = (
    <XAxis
      dataKey="x"
      type="number"
      domain={[start, end]}
      tickFormatter={tick}
      minTickGap={45}
      tick={{ fontSize: 12 }}
    />
  );
  const tooltip = (
    <Tooltip
      labelFormatter={(v) =>
        `${new Date(Number(v)).toISOString()} · ${((Number(v) - start) / 3600000).toFixed(2)} h elapsed`
      }
      contentStyle={{
        background: "#172336",
        color: "#fff",
        border: "1px solid #687487",
      }}
    />
  );
  return (
    <div className="scenario-charts">
      <div className="scenario-chart-controls">
        <div role="group" aria-label="Visible celestial bodies">
          {(
            [
              ["both", "Both"],
              ["sun", "Sun only"],
              ["earth", "Earth only"],
            ] as const
          ).map(([v, label]) => (
            <button
              type="button"
              className={`button ${body === v ? "primary" : "subtle"}`}
              aria-pressed={body === v}
              onClick={() => setBody(v)}
              key={v}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Time axis
          <select
            value={axis}
            onChange={(e) => setAxis(e.target.value as typeof axis)}
          >
            <option value="elapsed">Mission elapsed time</option>
            <option value="utc">UTC calendar time</option>
          </select>
        </label>
      </div>
      <h3>Elevation and applicable horizon (°)</h3>
      <div
        className="scenario-plot"
        role="img"
        aria-label={`Elevation graph: ${body}. Shading marks unavailable intervals. Numeric data available below.`}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={data}
            margin={{ right: 20, left: 0, bottom: 8 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            {xAxis}
            <YAxis domain={extent} unit="°" width={55} />
            {tooltip}
            {shown.flatMap((b) =>
              unavailableWindows(a, b).map((w) => (
                <ReferenceArea
                  key={`${b}-${w.start}`}
                  x1={Date.parse(w.start)}
                  x2={Date.parse(w.end)}
                  fill={colors[b]}
                  fillOpacity={0.1}
                  strokeOpacity={0}
                />
              )),
            )}
            {highlight && (
              <ReferenceArea
                x1={Date.parse(highlight.start)}
                x2={Date.parse(highlight.end)}
                stroke="#bd69ee"
                strokeWidth={2}
                fill="#bd69ee"
                fillOpacity={0.15}
              />
            )}
            {shown.map((b) => (
              <Line
                key={`${b}-threshold`}
                dataKey={`${b}_threshold`}
                name={`${b === "sun" ? "Sun" : "Earth"} horizon / clearance (°)`}
                stroke={colors[b]}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            ))}
            {shown.map((b) => (
              <Line
                key={b}
                dataKey={`${b}_elevation`}
                name={`${b === "sun" ? "Sun" : "Earth"} elevation (°)`}
                stroke={colors[b]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p>
        Read across the mission in elapsed hours or UTC. Each solid line shows
        how high the Sun or Earth is above the reference horizon, in degrees.
        At each sample, the body is visible when its solid line is above its
        matching dashed threshold. Earth’s threshold includes {a.mission.clearance_deg}°
        of clearance.{" "}
        {a.terrain.available
          ? "The terrain horizon varies with azimuth."
          : "Reference-sphere horizon only; local terrain shadows are unmodelled."}{" "}
        Shading marks sampled nonvisibility. The vertical scale stays fixed when
        isolating a body.
      </p>
      <h3>Visibility status</h3>
      <div
        className="scenario-plot"
        aria-label={`Visibility status graph: ${body}`}
      >
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={data} accessibilityLayer>
            {xAxis}
            <YAxis
              ticks={[0, 1]}
              domain={[0, 1]}
              tickFormatter={(v) => (v ? "Visible" : "Hidden")}
              width={65}
            />
            {tooltip}
            {shown.map((b) => (
              <Line
                key={b}
                type="stepAfter"
                dataKey={`${b}_status`}
                name={`${b} visibility (1 visible / 0 hidden)`}
                stroke={colors[b]}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            {shown.flatMap((b) =>
              a.series
                .slice(1)
                .filter(
                  (r, i) => r[`${b}_visible`] !== a.series[i][`${b}_visible`],
                )
                .map((r) => (
                  <ReferenceLine
                    key={`${b}${r.time}`}
                    x={Date.parse(r.time)}
                    stroke={colors[b]}
                    strokeDasharray="2 5"
                  />
                )),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p>
        The upper step means the body is visible and the lower step means it is hidden.
        Vertical markers show the first sample after a change. The crossing can occur
        up to one {a.mission.interval_minutes}-minute step earlier.
        A visible Earth gives a direct line of sight. Radio contact also depends on the link and ground station.
      </p>
      {energy && (
        <>
          <h3>Estimated solar power and equipment demand (W)</h3>
          <div className="scenario-plot">
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={data} accessibilityLayer>
                {xAxis}
                <YAxis width={65} unit=" W" />
                {tooltip}
                <CartesianGrid opacity={0.2} />
                <Line
                  dataKey="power_w"
                  name="Solar power (W)"
                  stroke={colors.sun}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="demand_w"
                  name="Equipment demand (W)"
                  stroke="#b477d9"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {energy.samples.some((s) => s.soc_pct !== null) && (
            <>
              <h3>Battery state of charge (%)</h3>
              <div className="scenario-plot">
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={data} accessibilityLayer>
                    {xAxis}
                    <YAxis domain={[0, 100]} unit="%" width={65} />
                    {tooltip}
                    <Line
                      dataKey="soc_pct"
                      name="Battery state of charge (%)"
                      stroke="#27a396"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
          <p>
            Idealised output from your panel assumptions. Power is held constant
            over each sampled interval; battery state is shown at each
            timestamp.
          </p>
        </>
      )}
      <details className="learning-disclosure">
        <summary>Accessible graph data</summary>
        <div className="table-scroll">
          <table id={id}>
            <caption>
              UTC time, elapsed hours, elevation, thresholds, status and energy
            </caption>
            <thead>
              <tr>
                <th>UTC</th>
                <th>Elapsed h</th>
                <th>Sun elevation / threshold °</th>
                <th>Earth elevation / threshold °</th>
                <th>Sun / Earth visible</th>
                {energy && (
                  <>
                    <th>Power W</th>
                    <th>Battery %</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.time}>
                  <td>{r.time}</td>
                  <td>{r.elapsed.toFixed(2)}</td>
                  <td>
                    {r.sun_elevation.toFixed(2)} / {r.sun_threshold.toFixed(2)}
                  </td>
                  <td>
                    {r.earth_elevation.toFixed(2)} /{" "}
                    {r.earth_threshold.toFixed(2)}
                  </td>
                  <td>
                    {r.sun_visible ? "Yes" : "No"} /{" "}
                    {r.earth_visible ? "Yes" : "No"}
                  </td>
                  {energy && (
                    <>
                      <td>{r.power_w?.toFixed(2)}</td>
                      <td>{r.soc_pct?.toFixed(1) ?? "Not configured"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
