"use client";
import { useState } from "react";
import { calculationKey } from "./useMissionSession";
import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { MissionSession } from "./useMissionSession";
import { explainDifference } from "./scenario-science";
import type { Highlight } from "./ScenarioCharts";
export default function ScenarioComparison({
  session: s,
  onInspect,
  onEvidence,
}: {
  session: MissionSession;
  onInspect?: (id: string) => void;
  onEvidence?: (id: string, h: Highlight) => void;
}) {
  const base = s.entries.find((e) => e.id === s.baseline) || s.entries[0];
  const [metric, setMetric] = useState<"sun_elevation" | "earth_elevation">(
    "sun_elevation",
  );
  const [timeAxis, setTimeAxis] = useState("elapsed");
  const delta = (n: number, b: number, unit: string) =>
    `${n - b >= 0 ? "+" : ""}${(n - b).toFixed(1)} ${unit}`;
  const complete = s.complete;
  const plot = complete
    .flatMap((e, i) =>
      e.analysis.series.map((r) => ({
        x:
          timeAxis === "elapsed"
            ? (Date.parse(r.time) - Date.parse(e.mission.start)) / 3600000
            : Date.parse(r.time),
        [`option${i}`]: r[metric],
        utc: r.time,
        scenario: e.id,
      })),
    )
    .sort((a, b) => a.x - b.x);
  return (
    <div className="scenario-comparison">
      <div className="scenario-section-heading">
        <h3>Scenario measurements</h3>
        <label>
          Baseline scenario
          <select
            value={base.id}
            onChange={(e) => s.setBaseline(e.target.value)}
          >
            {s.entries.map((e, i) => (
              <option value={e.id} key={e.id}>
                {String.fromCharCode(65 + i)} — {e.site.name} ·{" "}
                {e.mission.start.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <caption>
            Raw measurements and differences from the selected baseline;
            visibility differences use percentage points.
          </caption>
          <thead>
            <tr>
              <th>Scenario / dates</th>
              <th>Sunlight</th>
              <th>Earth</th>
              <th>Both</th>
              <th>Longest darkness</th>
              <th>Longest Earth outage</th>
              <th>Solar kWh</th>
              <th>kWh/day</th>
              <th>Unmet demand kWh</th>
              <th>Visibility score /100</th>
            </tr>
          </thead>
          <tbody>
            {s.entries.map((e, i) => {
              const m = e.analysis?.metrics,
                b = base.analysis?.metrics,
                score = s.ranking?.ranking.find(
                  (r) =>
                    calculationKey(r.mission) === calculationKey(e.mission),
                )?.score;
              return (
                <tr key={e.id}>
                  <th>
                    <button
                      className="text-button"
                      disabled={!m}
                      onClick={() => onInspect?.(e.id)}
                    >
                      {String.fromCharCode(65 + i)} — {e.site.name}
                    </button>
                    <small className="scenario-block">
                      {e.mission.start} → {e.mission.end}
                    </small>
                    <small>
                      {(
                        (Date.parse(e.mission.end) -
                          Date.parse(e.mission.start)) /
                        86400000
                      ).toFixed(2)}{" "}
                      days {e.id === base.id ? "· Baseline" : ""}
                    </small>
                  </th>
                  {(
                    [
                      "sun_visible_pct",
                      "earth_visible_pct",
                      "simultaneous_pct",
                    ] as const
                  ).map((k) => (
                    <td key={k}>
                      {m ? `${m[k].toFixed(1)}%` : "Pending"}
                      {m && b && e.id !== base.id && (
                        <small className="scenario-block">
                          {delta(m[k], b[k], "pp")}
                        </small>
                      )}
                    </td>
                  ))}
                  {(
                    [
                      "longest_darkness_hours",
                      "longest_blackout_hours",
                    ] as const
                  ).map((k) => (
                    <td key={k}>
                      {m ? `${m[k].toFixed(2)} h` : "Pending"}
                      {m && b && e.id !== base.id && (
                        <small className="scenario-block">
                          {delta(m[k], b[k], "h")}
                        </small>
                      )}
                    </td>
                  ))}
                  <td>
                    {e.energy?.total_kwh.toFixed(2) ?? "Pending"}
                    {e.energy && base.energy && e.id !== base.id && (
                      <small className="scenario-block">
                        {delta(
                          e.energy.total_kwh,
                          base.energy.total_kwh,
                          "kWh",
                        )}
                      </small>
                    )}
                  </td>
                  <td>{e.energy?.daily_kwh.toFixed(2) ?? "Pending"}</td>
                  <td>{e.energy?.unmet_kwh?.toFixed(2) ?? "Not configured"}</td>
                  <td>{score?.toFixed(1) ?? "Unavailable"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s.ranking && <p>{s.ranking.explanation}</p>}
      {s.rankingError && <p className="info">{s.rankingError}</p>}
      <p>
        Equipment differences also affect energy. Unequal durations and sampling
        steps are shown explicitly. Percentages measure geometric availability,
        not landing-success probability.
      </p>
      {complete.length > 1 && (
        <details className="learning-disclosure">
          <summary>Overlay scenario elevation graphs</summary>
          <div className="scenario-fields">
            <label>
              Body
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as typeof metric)}
              >
                <option value="sun_elevation">Sun elevation</option>
                <option value="earth_elevation">Earth elevation</option>
              </select>
            </label>
            <label>
              Compare time by
              <select
                value={timeAxis}
                onChange={(e) => setTimeAxis(e.target.value)}
              >
                <option value="elapsed">Mission elapsed hours</option>
                <option value="utc">UTC calendar time</option>
              </select>
            </label>
          </div>
          <div className="scenario-plot">
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={plot} accessibilityLayer>
                <CartesianGrid opacity={0.2} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(n) =>
                    timeAxis === "elapsed"
                      ? `${n} h`
                      : new Date(n).toISOString().slice(5, 10)
                  }
                />
                <YAxis unit="°" />
                <Tooltip
                  contentStyle={{ background: "#172336", color: "white" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="scenario-tooltip">
                        {payload
                          .filter((p) => p.value != null)
                          .map((p) => (
                            <p key={String(p.dataKey)}>
                              {p.name}: {Number(p.value).toFixed(2)}°<br />
                              UTC {p.payload.utc}
                            </p>
                          ))}
                      </div>
                    ) : null
                  }
                />
                {complete.map((e, i) => (
                  <Line
                    key={e.id}
                    dataKey={`option${i}`}
                    name={`${String.fromCharCode(65 + s.entries.findIndex((x) => x.id === e.id))}: ${e.site.name}`}
                    stroke={["#d99a2a", "#4b9de6", "#b080d0"][i]}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </details>
      )}
      <h3>Why did the result change?</h3>
      {!base.analysis && <p>Calculate the baseline to explain differences.</p>}
      {base.analysis &&
        s.entries
          .filter((e) => e.id !== base.id && e.analysis)
          .map((e) => {
            const explanation = explainDifference(base.analysis!, e.analysis!);
            return (
              <article className="scenario-explanation" key={e.id}>
                <h4>
                  {e.site.name} · {e.mission.start.slice(0, 10)} against
                  baseline
                </h4>
                <ul>
                  {explanation.changes.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                  {JSON.stringify(base.solar) !== JSON.stringify(e.solar) && (
                    <li>
                      Panel, demand or battery assumptions differ; energy
                      changes also reflect those inputs.
                    </li>
                  )}
                  {explanation.statements.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                {explanation.evidence.map((h) => (
                  <button
                    className="button subtle"
                    key={h.body}
                    onClick={() => onEvidence?.(e.id, h)}
                  >
                    {h.text} Highlight on graph
                  </button>
                ))}
                <button
                  className="button subtle"
                  disabled={s.pending.includes(e.key)}
                  onClick={() => s.finer(e.id)}
                >
                  Check with a finer time step
                </button>
              </article>
            );
          })}
      {s.entries.length === 1 && (
        <p>
          Add a date or location to compare its evidence against the baseline.
        </p>
      )}
    </div>
  );
}
