"use client";

import { useState } from "react";
import type { Mission } from "../../app/types";
import {
  useMissionSession,
  calculationKey,
  type ExperienceMode,
  type Weights,
} from "./useMissionSession";
import { MissionConfiguration, type SearchProps } from "./LandingSearch";
import { MoonMissionSetup } from "./MoonMissionClassroom";
import PreResultWorkflow from "./PreResultWorkflow";
import CompleteResults from "./CompleteResults";
import InvestigationLibrary from "./InvestigationLibrary";
import MissionPlanner from "./MissionPlanner";
import { defaultNotes } from "./learning-notes";
import { downloadScenario } from "./scenario-export";
import type { Highlight } from "./ScenarioCharts";

type Props = Pick<
  SearchProps,
  | "start"
  | "end"
  | "startTime"
  | "endTime"
  | "onStart"
  | "onEnd"
  | "onStartTime"
  | "onEndTime"
  | "onInterval"
  | "onClearance"
  | "selected"
  | "onSelected"
  | "sites"
  | "onMap"
> & {
  mission: Mission;
  mode: ExperienceMode;
  linkedTool?: 8 | 14;
  onModeChange: (mode: ExperienceMode) => void;
  onRestore: (m: Mission) => void;
};

export default function MissionLab({
  mission,
  mode,
  linkedTool,
  onModeChange,
  onRestore,
  ...inputs
}: Props) {
  const [tabs, setTabs] = useState({ professional: 7, education: 7 });
  const tab = linkedTool ?? tabs[mode];
  const setTab = (next: number, targetMode = mode) => {
    setTabs((previous) => ({ ...previous, [targetMode]: next }));
    if (linkedTool !== undefined) onModeChange(targetMode);
  };
  const [weights, setWeights] = useState<Weights>({
    sunlight: 1,
    earth: 1,
    simultaneous: 2,
  });
  const [priority, setPriority] = useState("balanced");
  const [notes, setNotes] = useState(defaultNotes);
  const [selectedId, setSelectedId] = useState("primary");
  const [evidence, setEvidence] = useState<{
    id: string;
    interval: Highlight;
  } | null>(null);
  const session = useMissionSession(mission, weights);
  const entry = session.complete.find((e) => e.id === selectedId);
  const p: SearchProps = {
    ...inputs,
    interval: mission.interval_minutes,
    clearance: mission.clearance_deg,
    priority,
    onPriority: (value) => {
      setPriority(value);
      if (value === "balanced")
        setWeights({ sunlight: 1, earth: 1, simultaneous: 2 });
      if (value === "sunlight")
        setWeights({ sunlight: 3, earth: 1, simultaneous: 1 });
      if (value === "earth")
        setWeights({ sunlight: 1, earth: 3, simultaneous: 1 });
    },
    weights,
    onWeights: setWeights,
    session,
    busy: session.busy,
    onSubmit: () => {
      setTab(12);
      void session.calculate();
    },
  };
  return (
    <section
      className="mission-lab"
      data-theme={mode}
      aria-label="Mission lab"
    >
      <div className="panel mission-lab-intro">
        <p>
          Explore how location, dates and equipment change visibility and power.
          The lab uses the SPICE visibility model. The main Result view uses the
          separate NASA research assessment.
        </p>
        <div className="account-actions" aria-label="Mission lab tools">
          {[
            [7, "Configure"],
            [12, "Compare scenarios"],
            [8, "Scenario evidence"],
            [13, "Investigation library"],
            [14, "Vehicle worksheet"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`button ${tab === id ? "primary" : "subtle"}`}
              aria-pressed={tab === id}
              onClick={() => setTab(Number(id))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 7 &&
        (mode === "education" ? (
          <>
            <MoonMissionSetup p={p} notes={notes} onNotes={setNotes} />
          </>
        ) : (
          <section className="panel mission-lab-config">
            <MissionConfiguration {...p} />
            <p>
              Primary point: <strong>{mission.name}</strong> ·{" "}
              {mission.latitude.toFixed(4)}°, {mission.longitude.toFixed(4)}°
            </p>
            <div className="account-actions">
              <button className="button subtle" onClick={inputs.onMap}>
                Choose on map
              </button>
              <button className="button primary" onClick={() => setTab(12)}>
                Choose scenarios
              </button>
            </div>
          </section>
        ))}
      {tab === 12 && (
        <PreResultWorkflow
          session={session}
          sites={inputs.sites}
          experience={mode}
          view={12}
          onNavigate={setTab}
          weights={weights}
          onWeights={setWeights}
          onInspect={(a) => {
            setEvidence(null);
            setSelectedId(
              session.entries.find((e) => e.key === calculationKey(a.mission))
                ?.id ?? "primary",
            );
          }}
          onEvidence={(a, interval) => {
            const id =
              session.entries.find((e) => e.key === calculationKey(a.mission))
                ?.id ?? "primary";
            setSelectedId(id);
            setEvidence({ id, interval });
            setTab(8);
          }}
        />
      )}
      {tab === 8 && (
        <>
          <CompleteResults
            session={session}
            selectedId={selectedId}
            experience={mode}
            notes={notes}
            onNotes={setNotes}
            onSelect={setSelectedId}
            onNavigate={setTab}
            initialEvidence={evidence}
          />
          {entry && (
            <div className="account-actions">
              {(["csv", "json"] as const).map((format) => (
                <button
                  key={format}
                  className="button subtle"
                  onClick={() =>
                    downloadScenario(
                      entry,
                      session.snapshot,
                      notes,
                      weights,
                      format,
                    )
                  }
                >
                  Download {format.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 13 && (
        <InvestigationLibrary
          current={{
            mission,
            locations: session.locations,
            weights,
            experience: mode,
            notes,
            scenarios: session.snapshot,
          }}
          onRestore={(record) => {
            onRestore(record.mission);
            session.restore(record.locations, record.scenarios);
            onModeChange(record.experience);
            setNotes(record.notes);
            setWeights(record.weights);
            setPriority("custom");
            setTab(12, record.experience);
          }}
        />
      )}
      {tab === 14 && (
        <MissionPlanner
          mission={mission}
          onRestore={(m) => {
            onRestore(m);
            setTab(7);
          }}
        />
      )}
    </section>
  );
}
