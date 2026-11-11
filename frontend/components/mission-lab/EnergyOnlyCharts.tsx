"use client";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Analysis } from "../../app/types";
import type { Energy } from "./scenario-science";
export default function EnergyOnlyCharts({
  analysis,
  energy,
}: {
  analysis: Analysis;
  energy: Energy;
}) {
  const start = Date.parse(analysis.mission.start),
    data = energy.samples.map((s) => ({
      ...s,
      hours: (Date.parse(s.time) - start) / 3600000,
    }));
  return (
    <>
      <h3>Power generation and demand (W)</h3>
      <div className="scenario-plot">
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data} accessibilityLayer>
            <CartesianGrid opacity={0.2} />
            <XAxis
              dataKey="hours"
              type="number"
              domain={[0, "dataMax"]}
              unit=" h"
            />
            <YAxis unit=" W" width={70} />
            <Tooltip
              labelFormatter={(n) =>
                `${new Date(start + Number(n) * 3600000).toISOString()} · ${Number(n).toFixed(2)} h elapsed`
              }
              contentStyle={{ background: "#172336", color: "white" }}
            />
            <Line
              type="stepAfter"
              dataKey="power_w"
              name="Solar power (W)"
              stroke="#d49b24"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="demand_w"
              name="Equipment demand (W)"
              stroke="#a66dc1"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p>
        The horizontal axis shows hours since touchdown. Gold shows estimated
        solar output and purple shows equipment demand, both in watts. When
        output falls below demand, the battery supplies the shortfall if storage
        is configured and charge remains.
      </p>
      {energy.samples.some((s) => s.battery_kwh !== null) && (
        <>
          <h3>Battery charge (%)</h3>
          {energy.samples.some((s) => s.soc_pct !== null) ? (
            <>
              <div className="scenario-plot">
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data} accessibilityLayer>
                    <XAxis
                      dataKey="hours"
                      type="number"
                      domain={[0, "dataMax"]}
                      unit=" h"
                    />
                    <YAxis domain={[0, 100]} unit="%" width={70} />
                    <Tooltip
                      labelFormatter={(n) =>
                        `${new Date(start + Number(n) * 3600000).toISOString()}`
                      }
                      contentStyle={{ background: "#172336", color: "white" }}
                    />
                    <Line
                      dataKey="soc_pct"
                      name="State of charge (%)"
                      stroke="#23a190"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p>
                The teal line shows the share of usable battery capacity
                remaining. A falling line means the battery is discharging. A
                reading of 0% means the model has exhausted the usable charge.
              </p>
            </>
          ) : (
            <p>
              No storage capacity configured; deficits are immediately recorded
              as unmet demand.
            </p>
          )}
        </>
      )}
      <p>
        The model holds power constant between samples and calculates battery
        charge at each timestamp. Estimates depend on the selected equipment and
        model assumptions.
      </p>
      <details className="learning-disclosure">
        <summary>Accessible energy data</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>UTC</th>
                <th>Power W</th>
                <th>Demand W</th>
                <th>Battery kWh</th>
                <th>Charge %</th>
                <th>Cumulative unmet kWh</th>
              </tr>
            </thead>
            <tbody>
              {energy.samples.map((r) => (
                <tr key={r.time}>
                  <td>{r.time}</td>
                  <td>{r.power_w.toFixed(2)}</td>
                  <td>{r.demand_w}</td>
                  <td>{r.battery_kwh?.toFixed(3) ?? "Not configured"}</td>
                  <td>{r.soc_pct?.toFixed(1) ?? "Not configured"}</td>
                  <td>{r.unmet_kwh.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
