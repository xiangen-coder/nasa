"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { downloadReport } from "../lib/download-report";
import { formatCoordinates } from "../lib/format-coordinates";
import { optionalLimits, powerFields, simulatePower, smallLander, type Activity, type LabSource, type PowerInputs, type PowerKey, type PowerRun } from "../lib/mission-power";

const fields = Object.keys(powerFields) as PowerKey[];
const utc = (time: string) => new Date(time).toISOString().slice(0, 19).replace("T", " ") + " UTC";
const shortTime = (time: string) => new Intl.DateTimeFormat("en-GB", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
}).format(new Date(time));
type Draft = {
  brief: { name: string; objective: string; payload: string; notes: string };
  power: PowerInputs;
  activities: Activity[];
  reportNotes: string;
};
const initialDraft: Draft = { brief: { name: "", objective: "", payload: "", notes: "" }, power: smallLander, activities: [], reportNotes: "" };
const briefLabels = { name: "Mission name", objective: "Mission objective", payload: "Payload & equipment", notes: "Mission notes" } as const;
const durationMs = 3600000;

export default function PowerMissionLab({ source, onResult, onConfigure, sourceError, openSavedReport = false }: {
  source: LabSource | null; onResult: () => void; onConfigure: () => void; sourceError?: string; openSavedReport?: boolean;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [run, setRun] = useState<PowerRun | null>(null);
  const [variant, setVariant] = useState<{ power: PowerInputs; run: PowerRun } | null>(null);
  const [change, setChange] = useState<PowerKey>("battery");
  const [variantInput, setVariantInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const storageKey = source ? "lunar-power-lab:v1:" + source.key : "";

  useEffect(() => {
    if (!storageKey) return;
    try {
      const report = JSON.parse(localStorage.getItem(storageKey + ":report") ?? "null");
      const saved = openSavedReport ? report?.setup : JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && fields.every((field) => typeof saved.power?.[field] === "string") &&
          Object.keys(briefLabels).every((key) => typeof saved.brief?.[key] === "string") &&
          Array.isArray(saved.activities) && saved.activities.every((a: Activity) => typeof a?.name === "string") &&
          typeof saved.reportNotes === "string") {
        setDraft(saved);
        if (source && report?.setup && JSON.stringify(report.setup) === JSON.stringify(saved)) {
          try {
            setRun(simulatePower(source, saved.power, saved.activities));
            if (report.variant?.power) setVariant({ power: report.variant.power, run: simulatePower(source, report.variant.power, saved.activities) });
          } catch { setNotice("Review saved inputs before running the simulation."); }
        }
      }
    } catch { setNotice("The stored draft could not be opened."); }
  }, [source, storageKey, openSavedReport]);

  function updateSetup(next: Draft) {
    setDraft(next);
    setRun(null);
    setVariant(null);
    setNotice("");
    setError("");
  }

  function calculate(testVariant = false) {
    if (!source) return;
    setError("");
    try {
      if (testVariant) {
        const power = { ...draft.power, [change]: variantInput };
        setVariant({ power, run: simulatePower(source, power, draft.activities) });
      } else {
        setRun(simulatePower(source, draft.power, draft.activities));
        setVariant(null);
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Simulation failed.");
    }
  }

  function save(report: boolean) {
    if (!source) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      localStorage.setItem("lunar-power-lab:last-source", JSON.stringify(source));
      if (report) localStorage.setItem(storageKey + ":report", JSON.stringify({ ...exportPayload(), savedAt: new Date().toISOString() }));
      setNotice(report ? "Mission report saved on this device." : "Draft saved on this device.");
    } catch { setNotice("Browser storage could not save this mission."); }
  }

  function exportPayload() {
    return { source, setup: draft, simulation: run, variant, irradianceModel: "User-entered effective panel-plane irradiance during sunlit intervals" };
  }

  function powerInput(key: PowerKey) {
    const [label, unit, min, max] = powerFields[key];
    return <label key={key}>{label} ({unit})
      <input type="number" min={min} max={max} step="any" value={draft.power[key]}
        placeholder={optionalLimits.includes(key) ? "Unlimited" : undefined}
        onChange={(e) => updateSetup({ ...draft, power: { ...draft.power, [key]: e.target.value } })} />
    </label>;
  }

  return <section className="power-lab" aria-label="Mission Lab">
    <header className="power-lab-title">
      <div><h1>Mission Lab.</h1><p>Can my lander keep operating through this mission window?</p></div>
      <div className="account-actions">
        <button className="button subtle" onClick={onResult}>Back to Result</button>
        {source && <button className="button subtle" onClick={() => save(false)}>Save draft</button>}
      </div>
    </header>
    {source ? <>
      <article className="power-lab-panel power-lab-source">
        <div className="power-lab-title"><strong>Imported from your Result</strong><button className="text-button" onClick={onResult}>View source Result ↗</button></div>
        <dl>
          <div><dt>Research area name</dt><dd>{source.researchArea.name?.trim() || "Custom location"}</dd></div>
          <div><dt>Research area coordinates</dt><dd>{formatCoordinates(source.researchArea.latitude, source.researchArea.longitude)}</dd></div>
          <div><dt>Mission window</dt><dd>{utc(source.site.start)} → {utc(source.site.end)}</dd></div>
          <div><dt>Duration</dt><dd>{((source.end - source.start) / durationMs).toFixed(1)} h</dd></div>
        </dl>
        <p>Landing point {source.site.name} · {formatCoordinates(source.site.latitude, source.site.longitude)}</p>
        <p>{source.complete ? "Sunlight timeline available" : "Sunlight timeline incomplete"} · {source.assessment.geometry.series?.some((row) => typeof row.earth_visible === "boolean") ? "Earth visibility available" : "Earth visibility unavailable"} · {source.assessment.horizon.available ? "Terrain skyline available" : "Terrain skyline unavailable"} · {source.assessment.temperature.available ? "Historical temperatures available" : "Historical temperatures unavailable"} · {source.site.interval_minutes}-minute sampling</p>
        {source.coordinateMetadata.frame && <p>Coordinate frame · {source.coordinateMetadata.frame}{source.coordinateMetadata.datum && ` · ${source.coordinateMetadata.datum}`}</p>}
        {source.assessedAt && Number.isFinite(Date.parse(source.assessedAt)) && <p>Assessment timestamp · {utc(source.assessedAt)}</p>}
        {source.resultId && <p>Result ID · {source.resultId}</p>}
        <button className="text-button" onClick={onConfigure}>Change site or dates</button>
      </article>
      <section className="power-lab-panel" id="power-lab-step-0" tabIndex={-1}>
        <h2>1. Mission brief</h2>
        <div className="power-lab-form">
          {Object.entries(briefLabels).map(([key, label]) => <label key={key}>{label}<input value={draft.brief[key as keyof Draft["brief"]]}
            onChange={(e) => { setDraft({ ...draft, brief: { ...draft.brief, [key]: e.target.value } }); setNotice(""); }} /></label>)}
        </div>
      </section>
      <div className="power-lab-columns">
        <section className="power-lab-panel" id="power-lab-step-1" tabIndex={-1}>
          <h2>2. Lander &amp; operations</h2>
          <button className="button subtle" onClick={() => updateSetup({ ...draft, power: { ...smallLander } })}>Apply Small lander preset</button>
          <p>Editable example equipment values.</p>
          <div className="power-lab-form">{fields.slice(0, 6).map(powerInput)}</div>
          <h3>Daily operating plan · UTC</h3>
          <p>Repeats daily. Activity loads replace standby and should include heaters and communications.</p>
          {draft.activities.map((activity, index) => <div className="power-lab-activity" key={index}>
            {([["name", "Activity"], ["start", "Start hour"], ["end", "End hour"], ["watts", "Load (W)"]] as const).map(([key, label]) => <label key={key}>{label}
              <input type={key === "name" ? "text" : "number"} step="any" value={Number.isNaN(activity[key]) ? "" : activity[key]} onChange={(e) => updateSetup({ ...draft, activities: draft.activities.map((item, i) => i === index ? { ...item, [key]: key === "name" ? e.target.value : e.target.valueAsNumber } : item) })} />
            </label>)}
            <button className="text-button" aria-label={"Remove activity " + (index + 1)} onClick={() => updateSetup({ ...draft, activities: draft.activities.filter((_, i) => i !== index) })}>Remove</button>
          </div>)}
          <button className="text-button" onClick={() => updateSetup({ ...draft, activities: [...draft.activities, { name: "Science", start: 6, end: 18, watts: 90 }] })}>+ Add activity</button>
          <details open={draft.power.irradiance === "" || undefined}>
            <summary>Advanced power assumptions</summary>
            <p>Enter effective irradiance at the panel surface during sunlit intervals. Include any assumed orientation effect in that value. Blank power limits are unlimited and apply at the electrical bus.</p>
            <div className="power-lab-form">{fields.slice(6).map(powerInput)}</div>
          </details>
          <button className="button primary" onClick={() => calculate()}>Run power simulation</button>
        </section>
        <section className="power-lab-panel" id="power-lab-step-2" tabIndex={-1}>
          <h2>3. Power simulation</h2><p>Simplified estimate · effective panel-plane irradiance</p>
          {run ? <>
            <dl className="power-lab-metrics">
              <div><dt>First below reserve</dt><dd>{run.firstBelow == null ? "Never" : run.firstBelow.toFixed(1) + " h"}</dd></div>
              <div><dt>Minimum charge</dt><dd>{run.minimumPct.toFixed(1)}%</dd></div>
              <div><dt>Below reserve</dt><dd>{run.belowHours.toFixed(1)} h</dd></div>
            </dl>
            <div className="power-lab-chart" role="img" aria-label="Solar generation, demand, and battery charge over the mission">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={run.timeline.map((sample) => ({ ...sample, timestamp: Date.parse(sample.time) }))}>
                  <CartesianGrid stroke="#8198bb40" />
                  <XAxis dataKey="timestamp" type="number" scale="time" domain={[source.start, source.end]} tickFormatter={(time) => shortTime(new Date(time).toISOString())} minTickGap={45} tick={{ fill: "#bed0e8", fontSize: 11 }} />
                  <YAxis yAxisId="watts" unit=" W" tick={{ fill: "#bed0e8", fontSize: 11 }} />
                  <YAxis yAxisId="soc" orientation="right" domain={[0, 100]} unit="%" tick={{ fill: "#bed0e8", fontSize: 11 }} />
                  <Tooltip labelFormatter={(time) => utc(new Date(Number(time)).toISOString())} contentStyle={{ background: "#14223a" }} /><Legend />
                  <ReferenceLine yAxisId="soc" y={Number(draft.power.reserve)} stroke="#ffce67" strokeDasharray="4 4" />
                  <Line yAxisId="watts" type="stepAfter" dataKey="solar" name="Solar generation (W)" stroke="#54e7ed" dot={false} isAnimationActive={false} />
                  <Line yAxisId="watts" type="stepAfter" dataKey="demand" name="Demand (W)" stroke="#edf3ff" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  <Line yAxisId="soc" dataKey="charge" name="Battery charge (%)" stroke="#bc99fa" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p>Generated energy · {run.generated.toFixed(2)} kWh</p>
            {(["sunlight", "earth"] as const).map((key) => <div className="power-lab-lane" key={key}><span>{key === "sunlight" ? "Sunlight" : "Earth visibility"}</span>
              <div aria-hidden="true">{run.timeline.slice(0, -1).map((sample, i) => <i key={sample.time} data-visible={String(sample[key])}
                style={{ flexGrow: Date.parse(run.timeline[i + 1].time) - Date.parse(sample.time) }} />)}</div>
            </div>)}
            <p>Bright segments indicate visibility. Hatched segments indicate unavailable evidence.</p>
            <p className="power-lab-outcome" data-alert={run.unmet > 1e-8 || run.belowHours > 0}>
              {run.unmet > 1e-8 ? "Demand exceeds available electrical supply" : run.belowHours > 0 ? "Battery falls below reserve" : "Demand met and battery stays at or above reserve"} · {run.unmet.toFixed(3)} kWh unmet
            </p>
          </> : <p>Enter your power assumptions and run the simulation to see results.</p>}

          <details><summary>Model assumptions &amp; limitations</summary>
            <p>Sunlit power equals effective incident irradiance × panel area × panel efficiency × retained system fraction. Darkness produces zero solar power. The assumed irradiance is already at the panel plane. Each visibility sample holds until the next timestamp.</p>
            <p>Battery charge and discharge apply efficiency and power limits. Reserve is a reporting threshold. Earth visibility is geometric. The model excludes thermal behaviour, degradation and radio link performance.</p>
            {(source.assessment.limitations ?? []).map((item) => <p key={item}>{item}</p>)}
          </details>
        </section>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <section className="power-lab-panel">
        <h2>Compare one change</h2><p>Uses the same site, mission window and operating plan.</p>
        <div className="power-lab-actions">
          <label>Change<select value={change} onChange={(e) => { setChange(e.target.value as PowerKey); setVariant(null); setVariantInput(""); }}>
            {fields.map((key) => <option value={key} key={key}>{powerFields[key][0]}</option>)}
          </select></label>
          <span>Baseline {draft.power[change] || "—"} {powerFields[change][1]}</span>
          <label>Variant ({powerFields[change][1]})<input type="number" step="any" value={variantInput} onChange={(e) => { setVariantInput(e.target.value); setVariant(null); }} /></label>
          <button className="button subtle" disabled={!run} onClick={() => calculate(true)}>Test change</button>
        </div>
        {run && variant && <><div className="table-scroll"><table><thead><tr><th>Scenario</th><th>Minimum charge</th><th>Below reserve</th><th>Unmet energy</th></tr></thead>
          <tbody>{[["Baseline", run], ["Variant", variant.run]].map(([label, simulation]) => {
            const result = simulation as PowerRun;
            return <tr key={String(label)}><th scope="row">{String(label)}</th><td>{result.minimumPct.toFixed(1)}%</td><td>{result.belowHours.toFixed(1)} h</td><td>{result.unmet.toFixed(3)} kWh</td></tr>;
          })}</tbody></table></div>
          <button className="button subtle" onClick={() => { setDraft({ ...draft, power: variant.power }); setRun(variant.run); setVariant(null); setNotice(""); }}>Use this setup</button></>}
      </section>
      <section className="power-lab-panel" id="power-lab-step-3" tabIndex={-1}>
        <h2>4. Mission report</h2>
        <p>Includes the selected Result, assumptions, operations, and calculated power timeline.</p>
        {source.assessment.missing?.length > 0 && <p>Missing source factors · {source.assessment.missing.join(", ")}</p>}
        {[...new Set([...(source.assessment.warnings ?? []), ...(source.assessment.constraints_failed ?? [])])].map((warning) => <p key={warning}>{warning}</p>)}
        {Object.entries(source.assessment.geometry.sources ?? {}).map(([body, metadata]) =>
          <p key={body}>{body === "sun" ? "Sun" : "Earth"} · {metadata.ephemeris} · {metadata.orientation}</p>)}
        {[source.assessment.terrain.source, source.assessment.horizon.source, source.assessment.temperature.source]
          .map((metadata, index) => metadata?.source_url && <p key={index}><a href={metadata.source_url}>{metadata.name || "Source dataset"}</a></p>)}
        <label>Report notes<textarea value={draft.reportNotes} onChange={(e) => { setDraft({ ...draft, reportNotes: e.target.value }); setNotice(""); }} /></label>
        <div className="account-actions">
          <button className="button primary" disabled={!run} onClick={() => save(true)}>Save mission report</button>
          <button className="button subtle" disabled={!run} onClick={(event) => {
            const disclosures = Array.from(event.currentTarget.closest(".power-lab")?.querySelectorAll<HTMLDetailsElement>("details:not([open])") ?? []);
            disclosures.forEach((item) => { item.open = true; });
            try { window.print(); }
            finally { disclosures.forEach((item) => { item.open = false; }); }
          }}>Export PDF</button>
          <button className="button subtle" disabled={!run} onClick={() => downloadReport(JSON.stringify(exportPayload(), null, 2), "json", "lunar-power-report")}>Export data</button>
        </div>
        {notice && <p role="status">{notice}</p>}
      </section>
    </> : <article className="power-lab-panel"><h2>Open a site assessment</h2><p>{sourceError || "Open Mission Lab from a completed Result to use its site and mission timeline."}</p><button className="button primary" onClick={onConfigure}>Configure a search</button></article>}
  </section>;
}
