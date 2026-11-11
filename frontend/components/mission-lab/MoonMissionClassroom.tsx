"use client";
import { useEffect, useState } from "react";
import {
  BatteryCharging,
  Earth,
  FlaskConical,
  Radio,
  Rocket,
  Sun,
} from "lucide-react";
import type { SearchProps } from "./LandingSearch";
import EquipmentControls from "./EquipmentControls";
import LearningSky from "./LearningSky";
import { defaultSolar } from "./scenario-science";
import type { MissionSession } from "./useMissionSession";
import {
  defaultNotes,
  normalizeLearningNotes,
  type LearningNotes,
} from "./learning-notes";
export function TeacherGuide({
  onReset,
  presentation,
  onPresentation,
}: {
  onReset?: () => void;
  presentation: boolean;
  onPresentation: () => void;
}) {
  return (
    <details className="learning-disclosure teacher-guide">
      <summary>Teacher guide & presentation controls</summary>
      <button
        className="button subtle"
        aria-pressed={presentation}
        onClick={onPresentation}
      >
        {presentation ? "Leave presentation view" : "Presentation view"}
      </button>
      {onReset && (
        <button className="button subtle" onClick={onReset}>
          Reset learning activity
        </button>
      )}
      <h3>A 15-minute Moon mission</h3>
      <ol>
        <li>
          Choose a task (2 min): what needs power and why might Earth visibility
          matter?
        </li>
        <li>
          Choose a place and a stay (3 min): predict which option works better.
        </li>
        <li>
          Test a small panel and battery (5 min): observe light, stored energy
          and line of sight.
        </li>
        <li>
          Change one variable (3 min): does your evidence support your
          prediction?
        </li>
        <li>
          Brief the class (2 min): justify your choice and name something still
          unknown.
        </li>
      </ol>
      <p>
        Learning goals: distinguish sunlight from electricity, recognise the
        role of storage, compare dates fairly, and explain the limits of
        visibility data.
      </p>
      <p>
        Discussion prompts: Could a mission have enough total energy but still
        run out during darkness? Does seeing Earth guarantee a radio connection?
        What evidence would be needed to assess landing hazards?
      </p>
      <p>
        Suggested explanations: timing matters as well as totals; battery
        capacity limits stored energy; radio performance needs equipment and a
        link budget; terrain and touchdown hazards need measured data.
      </p>
    </details>
  );
}
export function MoonMissionSetup({
  p,
  notes,
  onNotes,
}: {
  p: SearchProps;
  notes: LearningNotes;
  onNotes: (n: LearningNotes) => void;
}) {
  const [step, setStep] = useState(0),
    [presentation, setPresentation] = useState(false);
  const duration =
    (Date.parse(`${p.end}T${p.endTime}:00Z`) -
      Date.parse(`${p.start}T${p.startTime}:00Z`)) /
    86400000;
  const setStay = (date: string, days: number) => {
    const t = Date.parse(`${date}T${p.startTime}:00Z`);
    if (Number.isFinite(t) && days > 0 && days <= 31) {
      p.onStart(date);
      p.onEnd(new Date(t + days * 86400000).toISOString().slice(0, 10));
      p.onEndTime(p.startTime);
    }
  };
  const reset = () => {
    p.session.restore([p.selected]);
    onNotes({ ...defaultNotes });
    setStep(0);
  };
  const preset = (kind: "explorer" | "station") => {
    p.session.restore([p.selected]);
    p.session.setEquipment("primary", {
      ...defaultSolar,
      demand_enabled: true,
      demand_w: kind === "explorer" ? 150 : 500,
      area_m2: kind === "explorer" ? 2 : 6,
      battery_kwh: kind === "explorer" ? 1 : 4,
    });
    onNotes({ ...notes, question: kind === "explorer" ? "sunlight" : "both" });
    setStep(1);
  };
  return (
    <section
      className={`moon-mission-setup scenario-workspace ${presentation ? "classroom-presentation" : ""}`}
      aria-label="Guided lunar exploration"
    >
      <span className="eyebrow">EDUCATION MODE · YOU ARE THE ASTRONAUT</span>
      <h2>Plan Your Moon Mission</h2>
      <p className="mission-question">
        Can your crew stay powered and connected?
      </p>
      <TeacherGuide
        onReset={reset}
        presentation={presentation}
        onPresentation={() => setPresentation(!presentation)}
      />
      <nav className="learning-steps" aria-label="Mission learning steps">
        {[
          "Choose your mission",
          "Where & when",
          "Prepare equipment",
          "Predict & test",
        ].map((label, i) => (
          <button
            className={`button ${step === i ? "primary" : "subtle"}`}
            key={label}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>
      {step === 0 && (
        <div className="mission-task-cards">
          <article className="learning-mission">
            <Rocket size={64} />
            <h3>Exploration crew</h3>
            <p>Power a small science kit while your crew explores.</p>
            <button
              className="button primary"
              onClick={() => preset("explorer")}
            >
              Choose exploration mission
            </button>
          </article>
          <article className="learning-mission">
            <FlaskConical size={64} />
            <h3>Science station</h3>
            <p>Keep a larger experiment running through your stay.</p>
            <button
              className="button primary"
              onClick={() => preset("station")}
            >
              Choose science station
            </button>
          </article>
        </div>
      )}
      {step === 1 && (
        <div className="learning-panel">
          <h3>Choose where and when to land</h3>
          <div className="scenario-fields">
            <label>
              Landing area
              <select
                value={
                  p.sites.find(
                    (s) =>
                      s.latitude === p.selected.latitude &&
                      s.longitude === p.selected.longitude,
                  )?.id || "custom"
                }
                onChange={(e) => {
                  const site = p.sites.find((s) => s.id === e.target.value);
                  if (site) p.onSelected(site);
                }}
              >
                <option value="custom">{p.selected.name}</option>
                {p.sites.map((s) => (
                  <option key={s.id || s.name} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Landing date (UTC)
              <input
                type="date"
                min="1901-01-01"
                max="2052-12-01"
                value={p.start}
                onChange={(e) =>
                  setStay(
                    e.target.value,
                    Number.isFinite(duration) && duration > 0 ? duration : 7,
                  )
                }
              />
            </label>
            <label>
              Stay duration:{" "}
              {Number.isFinite(duration) ? duration.toFixed(1) : "—"} days
              <input
                type="range"
                min={1}
                max={14}
                value={
                  Number.isFinite(duration)
                    ? Math.min(14, Math.max(1, duration))
                    : 7
                }
                onChange={(e) => setStay(p.start, Number(e.target.value))}
              />
            </label>
          </div>
          <div className="action-row">
            <button className="button subtle" onClick={p.onMap}>
              Choose a point on the lunar map
            </button>
            <button className="button primary" onClick={() => setStep(2)}>
              Prepare equipment →
            </button>
          </div>
          <p>
            Changing the date can change sunlight and Earth visibility. Ground
            safety still needs separate evidence.
          </p>
        </div>
      )}
      {step === 2 && (
        <div className="learning-panel">
          <h3>What will keep your mission running?</h3>
          <p>
            <Sun size={18} /> Panels collect energy.{" "}
            <BatteryCharging size={18} /> Batteries store it for later. Bigger
            equipment needs more power.
          </p>
          <EquipmentControls
            value={p.session.solar}
            onChange={(v) => p.session.setEquipment("primary", v)}
            compact
          />
          <button className="button primary" onClick={() => setStep(3)}>
            Make a prediction →
          </button>
        </div>
      )}
      {step === 3 && (
        <div className="learning-panel">
          <h3>Predict, test, improve</h3>
          <label>
            Your prediction
            <textarea
              maxLength={2000}
              aria-label="Your prediction"
              value={notes.prediction}
              placeholder="Will our panels and battery keep the science kit running? Why?"
              onChange={(e) =>
                onNotes({ ...notes, prediction: e.target.value })
              }
            />
          </label>
          <p>Your prediction does not change the scientific calculation.</p>
          <button
            className="button primary"
            disabled={p.busy}
            onClick={p.onSubmit}
          >
            Test my mission
          </button>
          <details className="learning-disclosure">
            <summary>Advanced timing & visibility settings</summary>
            <div className="scenario-fields">
              <label>
                Start time (UTC)
                <input
                  type="time"
                  value={p.startTime}
                  onChange={(e) => p.onStartTime(e.target.value)}
                />
              </label>
              <label>
                Sampling minutes
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={p.interval}
                  onChange={(e) => p.onInterval(Number(e.target.value))}
                />
              </label>
              <label>
                Earth clearance (°)
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={p.clearance}
                  onChange={(e) => p.onClearance(Number(e.target.value))}
                />
              </label>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
export function MoonMissionActivity({
  session: s,
  id,
  notes,
  onNotes,
  onCompare,
}: {
  session: MissionSession;
  id: string;
  notes: LearningNotes;
  onNotes: (n: LearningNotes) => void;
  onCompare: () => void;
}) {
  const entry = s.entries.find((e) => e.id === id) || s.entries[0],
    a = entry.analysis,
    energy = entry.energy;
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [reduced, setReduced] = useState(false),
    [presentation, setPresentation] = useState(false),
    [experiment, setExperiment] = useState("");
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(q.matches);
      if (q.matches) setPlaying(false);
    };
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [entry.key]);
  useEffect(() => {
    if (!playing || reduced || !a) return;
    const timer = window.setInterval(
      () =>
        setIndex((i) => {
          if (i >= a.series.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      450,
    );
    return () => clearInterval(timer);
  }, [playing, reduced, a]);
  if (!a || !energy || !a.series.length) return null;
  const n = Math.min(index, a.series.length - 1),
    r = a.series[n],
    power = energy.samples[n];
  const experimentAction = () => {
    if (experiment === "battery")
      s.setEquipment(id, {
        ...entry.solar,
        demand_enabled: true,
        battery_kwh: Math.min(100000, entry.solar.battery_kwh + 2),
      });
    if (experiment === "panels")
      s.setEquipment(id, { ...entry.solar, tracking: !entry.solar.tracking });
    if (experiment === "date") {
      s.setMode("dates");
      s.addDate();
      onCompare();
    }
    if (experiment === "location") {
      s.setMode("options");
      onCompare();
    }
    setExperiment("");
  };
  const notebook = normalizeLearningNotes(notes);
  return (
    <section
      className={`moon-mission-activity ${presentation ? "classroom-presentation" : ""}`}
      aria-label="Test your Moon mission"
    >
      <span className="eyebrow">YOUR LUNAR BASE · TEST & IMPROVE</span>
      <h2>Can your crew stay powered and connected?</h2>
      <TeacherGuide
        presentation={presentation}
        onPresentation={() => setPresentation(!presentation)}
        onReset={() => {
          setIndex(0);
          setPlaying(false);
          setExperiment("");
          s.setEquipment(id, { ...defaultSolar, demand_enabled: true });
          onNotes({ ...defaultNotes });
        }}
      />
      <div
        className="lunar-base-scene"
        data-powered={power.power_w > 0}
        aria-label="Illustrative lunar base with calculated equipment status"
      >
        <div className="base-status">
          <span>
            <Sun /> {r.sun_visible ? "Sun above horizon" : "Sun unavailable"}
          </span>
          <span>
            <Radio />{" "}
            {r.earth_visible ? "Earth in sight" : "Earth out of sight"}
          </span>
        </div>
        <svg
          viewBox="0 0 700 170"
          role="img"
          aria-label={`Illustrative lander and solar panels. ${power.power_w > 0 ? "Panels generating" : "No solar generation"}.`}
        >
          <path d="M0 155 Q180 110 350 148 T700 135 V170 H0Z" fill="#c2c1d2" />
          <path
            d="M285 110 L305 55 H365 L385 110Z"
            fill="#f6e6b8"
            stroke="#6f6b81"
            strokeWidth="3"
          />
          <circle cx="335" cy="79" r="12" fill="#647c96" />
          <path
            d="M300 110 L280 145 M370 110 L390 145 M307 55 L290 32 M360 55 L380 32"
            stroke="#6f6b81"
            strokeWidth="6"
          />
          <rect
            x="435"
            y="72"
            width="115"
            height="48"
            rx="3"
            fill={power.power_w > 0 ? "#41689b" : "#535468"}
            stroke="#f0c44c"
            strokeWidth="3"
          />
          {[460, 490, 520].map((x) => (
            <path key={x} d={`M${x} 72 V120`} stroke="#b8cbdf" />
          ))}
          <path
            d="M435 96 H550 M492 120 V148"
            stroke="#b8cbdf"
            strokeWidth="3"
          />
          <path
            d="M230 138 Q200 110 172 138"
            stroke="#8c859c"
            fill="none"
            strokeWidth="4"
          />
        </svg>
        <p>
          Illustrative scene; use the calculated local sky below for actual
          directions.
        </p>
      </div>
      <div className="mission-status-cards">
        <article>
          <Sun />
          <h3>
            {power.power_w > 0
              ? "Panels are generating"
              : "Panels are not generating"}
          </h3>
          <p>
            {r.sun_visible
              ? "Output also depends on panel direction and your assumptions."
              : "The model has no direct solar generation in this interval."}
          </p>
        </article>
        <article>
          <BatteryCharging />
          <h3>
            {entry.solar.demand_enabled
              ? power.soc_pct == null
                ? "No battery storage"
                : power.soc_pct <= 0.01
                  ? "Battery is empty"
                  : "Stored energy available"
              : "Choose equipment demand to test storage"}
          </h3>
          <meter
            min={0}
            max={100}
            value={power.soc_pct ?? 0}
            aria-label="Battery state of charge"
          />
          <p>
            {entry.solar.demand_enabled
              ? (energy.unmet_kwh ?? 0) > 1e-8
                ? "Your plan leaves some equipment demand unmet during the stay."
                : "Modelled demand is met over the sampled stay."
              : "Sunlight alone does not tell us whether equipment stays powered."}
          </p>
        </article>
        <article>
          <Earth />
          <h3>
            {r.earth_visible
              ? "Earth is in sight"
              : "Earth is below the threshold"}
          </h3>
          <p>
            Direct line of sight only. A working radio connection also needs
            suitable equipment.
          </p>
        </article>
      </div>
      <p className="info">
        {a.terrain.available
          ? "Terrain-screened geometry; touchdown hazards remain unassessed."
          : "Terrain safety has not been assessed. Local terrain shadows are unmodelled."}
      </p>
      <div className="mission-playback">
        <button
          className="button primary"
          disabled={reduced}
          onClick={() => {
            if (n === a.series.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause mission" : "Play my stay"}
        </button>
        <button
          className="button subtle"
          disabled={n === 0}
          onClick={() => {
            setPlaying(false);
            setIndex(n - 1);
          }}
        >
          Previous sample
        </button>
        <button
          className="button subtle"
          disabled={n === a.series.length - 1}
          onClick={() => {
            setPlaying(false);
            setIndex(n + 1);
          }}
        >
          Next sample
        </button>
        <label>
          Mission timeline
          <input
            type="range"
            min={0}
            max={a.series.length - 1}
            value={n}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
          />
        </label>
        <output>
          {r.time} · sample {n + 1} / {a.series.length}
        </output>
        {reduced && (
          <p>Reduced motion enabled. Move through the mission manually.</p>
        )}
      </div>
      <LearningSky analysis={a} sample={r} index={n} />
      <div className="scenario-toolbar" aria-label="Mission experiments">
        {[
          ["battery", "Try a larger battery"],
          ["panels", "Adjust the panels"],
          ["date", "Change the landing date"],
          ["location", "Compare another location"],
        ].map(([key, label]) => (
          <button
            className="button subtle"
            key={key}
            onClick={() => {
              setPlaying(false);
              setExperiment(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {experiment && (
        <div
          className="prediction-panel"
          role="region"
          aria-label="Predict your experiment"
        >
          <h3>Before you try: what will change?</h3>
          <label>
            Your experiment prediction
            <textarea
              maxLength={2000}
              aria-label="Your experiment prediction"
              value={notes.prediction}
              onChange={(e) =>
                onNotes({ ...notes, prediction: e.target.value })
              }
            />
          </label>
          <button
            className="button primary"
            disabled={!notes.prediction.trim()}
            onClick={experimentAction}
          >
            Try my prediction
          </button>
          <button className="button subtle" onClick={() => setExperiment("")}>
            Cancel experiment
          </button>
        </div>
      )}
      <details className="learning-disclosure">
        <summary>Show the evidence & equipment</summary>
        <EquipmentControls
          value={entry.solar}
          onChange={(v) => s.setEquipment(id, v)}
          compact
        />
        <p>
          At this sample: Sun {r.sun_elevation.toFixed(2)}° elevation /{" "}
          {r.sun_azimuth.toFixed(2)}° azimuth; Earth{" "}
          {r.earth_elevation.toFixed(2)}° / {r.earth_azimuth.toFixed(2)}°. Solar
          power {power.power_w.toFixed(1)} W. Battery{" "}
          {power.battery_kwh?.toFixed(3) ?? "not configured"} kWh.
        </p>
        <p>
          Total unserved demand:{" "}
          {energy.unmet_kwh?.toFixed(3) ?? "not configured"} kWh.
        </p>
      </details>
      <section className="mission-briefing">
        <h3>Your mission briefing</h3>
        <p>
          Choose an option, explain its evidence, and identify what still needs
          investigation.
        </p>
        {(
          [
            ["noticed", "We chose this plan because…"],
            ["evidence", "Our evidence is…"],
            ["unknowns", "We still need to investigate…"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              aria-label={label}
              value={notebook[key] || ""}
              maxLength={key === "noticed" ? 4000 : 2000}
              onChange={(e) => onNotes({ ...notes, [key]: e.target.value })}
            />
          </label>
        ))}
        {notebook.noticed?.trim() &&
          notebook.evidence?.trim() &&
          notebook.unknowns?.trim() && (
            <p className="info">
              Mission briefing completed. You have recorded reasoning, evidence
              and unknowns. This does not establish landing safety.
            </p>
          )}
      </section>
    </section>
  );
}
