"use client";
import { useEffect, useState } from "react";
import type { Mission, Site } from "../../app/types";
import {
  validSite,
  type ExperienceMode,
  type Weights,
} from "./useMissionSession";
import { normalizeLearningNotes, type LearningNotes } from "./learning-notes";
export type Investigation = {
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  mission: Mission;
  locations: Site[];
  weights: Weights;
  experience: ExperienceMode;
  notes: LearningNotes;
  scenarios?: ScenarioSnapshot;
};
import { validSnapshot, type ScenarioSnapshot } from "./useMissionSession";
const KEY = "lunar-investigations-v1";
function valid(x: unknown): x is Investigation {
  if (!x || typeof x !== "object") return false;
  const s = x as Investigation;
  return (
    s.version === 1 &&
    (s.scenarios === undefined || validSnapshot(s.scenarios)) &&
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    s.name.length <= 80 &&
    validSite(s.mission) &&
    Number.isFinite(Date.parse(s.mission.start)) &&
    Number.isFinite(Date.parse(s.mission.end)) &&
    Date.parse(s.mission.end) > Date.parse(s.mission.start) &&
    s.mission.interval_minutes >= 5 &&
    s.mission.interval_minutes <= 1440 &&
    s.mission.clearance_deg >= 0 &&
    s.mission.clearance_deg <= 20 &&
    Array.isArray(s.locations) &&
    s.locations.length >= 1 &&
    s.locations.length <= 3 &&
    s.locations.every(validSite) &&
    !!s.weights &&
    [s.weights.sunlight, s.weights.earth, s.weights.simultaneous].every(
      (w) => Number.isFinite(w) && w >= 0 && w <= 10,
    ) &&
    Object.values(s.weights).some((w) => w > 0) &&
    (s.experience === "professional" || s.experience === "education") &&
    !!s.notes &&
    typeof s.notes.question === "string" &&
    typeof s.notes.prediction === "string" &&
    s.notes.prediction.length <= 2000 &&
    typeof s.notes.reflection === "string" &&
    s.notes.reflection.length <= 4000 &&
    (s.notes.noticed === undefined ||
      (typeof s.notes.noticed === "string" &&
        s.notes.noticed.length <= 4000)) &&
    (s.notes.evidence === undefined ||
      (typeof s.notes.evidence === "string" &&
        s.notes.evidence.length <= 2000)) &&
    (s.notes.unknowns === undefined ||
      (typeof s.notes.unknowns === "string" && s.notes.unknowns.length <= 2000))
  );
}
export default function InvestigationLibrary({
  current,
  onRestore,
}: {
  current: Omit<Investigation, "id" | "version" | "name" | "savedAt">;
  onRestore: (s: Investigation) => void;
}) {
  const [saved, setSaved] = useState<Investigation[]>([]),
    [name, setName] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(data))
        setSaved(
          data
            .filter(valid)
            .slice(0, 20)
            .map((item) => ({
              ...item,
              notes: normalizeLearningNotes(item.notes),
            })),
        );
    } catch {
      setMessage(
        "Saved investigations could not be read. Existing data was not overwritten.",
      );
    }
  }, []);
  const persist = (next: Investigation[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setSaved(next);
      return true;
    } catch {
      setMessage(
        "Browser storage is unavailable. This investigation was not saved.",
      );
      return false;
    }
  };
  return (
    <section
      className="investigation-library panel"
      aria-label="Saved investigations"
    >
      <h2>6. Save investigation</h2>
      <p>
        Stores all selected locations, mission settings, priorities, mode and
        learning notes in this browser. Scientific result arrays are not
        persisted; recalculate after restoring in a new session. Existing
        vehicle plans remain available below or in Mission planner.
      </p>
      <div className="action-row">
        <label>
          Investigation name
          <input
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="button primary"
          onClick={() => {
            if (!name.trim()) {
              setMessage("Enter an investigation name.");
              return;
            }
            if (saved.length >= 20) {
              setMessage("Remove an investigation before saving more than 20.");
              return;
            }
            const item: Investigation = {
              ...current,
              version: 1,
              id: crypto.randomUUID(),
              name: name.trim(),
              savedAt: new Date().toISOString(),
            };
            if (!valid(item)) {
              setMessage(
                "Complete valid mission settings and locations before saving.",
              );
              return;
            }
            if (persist([...saved, item]))
              setMessage(
                "Investigation saved in this browser. Calculated scientific results are not stored.",
              );
          }}
        >
          Save investigation
        </button>
      </div>
      {message && (
        <p className="info" role="status">
          {message}
        </p>
      )}
      {saved.map((item) => (
        <article className="saved-plan" key={item.id}>
          <div>
            <h3>{item.name}</h3>
            <p>
              {item.locations.length} locations · {item.mission.start} →{" "}
              {item.mission.end} · {item.experience}
            </p>
          </div>
          <button
            className="button subtle"
            onClick={() => {
              onRestore(item);
              setMessage(
                "Investigation restored. Recalculate to generate results not already cached in this session.",
              );
            }}
          >
            Restore investigation
          </button>
          <button
            className="button subtle"
            aria-label={`Delete investigation ${item.name}`}
            onClick={() => {
              if (persist(saved.filter((s) => s.id !== item.id)))
                setMessage("Investigation removed from this browser.");
            }}
          >
            Delete
          </button>
        </article>
      ))}
    </section>
  );
}
