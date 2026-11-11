"use client";
import { useEffect, useState } from "react";
import type { Site } from "../../app/types";
import type { MissionSession, Weights } from "./useMissionSession";
import LocationPicker from "./LocationPicker";
export type SearchProps = {
  selected: Site;
  onSelected: (s: Site) => void;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  onStart: (s: string) => void;
  onEnd: (s: string) => void;
  onStartTime: (s: string) => void;
  onEndTime: (s: string) => void;
  interval: number;
  onInterval: (n: number) => void;
  clearance: number;
  onClearance: (n: number) => void;
  priority: string;
  onPriority: (s: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onMap: () => void;
  session: MissionSession;
  sites: Site[];
  weights: Weights;
  onWeights: (w: Weights) => void;
};
export function MissionConfiguration(p: SearchProps & { education?: boolean }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const duration =
    (Date.parse(`${p.end}T${p.endTime}:00Z`) -
      Date.parse(`${p.start}T${p.startTime}:00Z`)) /
    3600000;
  return (
    <section className="mission-configuration" aria-label="Configure Mission">
      <h2>{p.education ? "Your exploration dates" : "1. Configure Mission"}</h2>
      <p>Configure the primary mission here. Compare alternate locations or landing dates in Compare.</p>
      <div className="mission-field-grid">
        <label>
          Start date
          <input
            type="date"
            required
            min="1901-01-01"
            max="2052-12-30"
            value={p.start}
            onChange={(e) => p.onStart(e.target.value)}
          />
        </label>
        <label>
          Start time (UTC)
          <input
            type="time"
            required
            value={p.startTime}
            onChange={(e) => p.onStartTime(e.target.value)}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            required
            min={p.start}
            max="2052-12-31"
            value={p.end}
            onChange={(e) => p.onEnd(e.target.value)}
          />
        </label>
        <label>
          End time (UTC)
          <input
            type="time"
            required
            value={p.endTime}
            onChange={(e) => p.onEndTime(e.target.value)}
          />
        </label>
        <label>
          Comparison priority
          <select
            value={p.priority}
            onChange={(e) => p.onPriority(e.target.value)}
          >
            <option value="balanced">Balanced visibility</option>
            <option value="sunlight">Sunlight availability</option>
            <option value="earth">Earth communication</option>
            <option value="custom">Custom weights</option>
            <option value="terrain" disabled>
              Terrain safety — not scored
            </option>
          </select>
        </label>
        <p className="duration-readout">
          Mission duration:{" "}
          <strong>
            {Number.isFinite(duration) && duration > 0
              ? `${duration.toFixed(2)} hours`
              : "Choose a valid time window"}
          </strong>
        </p>
      </div>
      <details
        className="advanced-mission"
        open={advancedOpen || p.priority === "custom"}
      >
        <summary
          onClick={(e) => {
            e.preventDefault();
            setAdvancedOpen((v) => !v);
          }}
        >
          Advanced Settings · {p.interval}-minute sampling · {p.clearance}°
          Earth clearance
        </summary>
        <div className="mission-field-grid">
          <label>
            Sampling interval
            <select
              aria-label="Sampling interval"
              value={p.interval}
              onChange={(e) => p.onInterval(Number(e.target.value))}
            >
              {[5, 15, 30, 60, 180, 360, 1440].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            Earth-clearance angle (°)
            <input
              type="number"
              required
              min="0"
              max="20"
              step="0.1"
              aria-label="Earth-clearance angle (°)"
              value={p.clearance}
              onChange={(e) => p.onClearance(Number(e.target.value))}
            />
          </label>
          {Object.entries(p.weights).map(([k, v]) => (
            <label key={k}>
              {k} weight
              <input
                aria-label={`${k} weight`}
                type="number"
                min="0"
                max="10"
                step="any"
                value={v}
                onChange={(e) =>
                  p.onWeights({ ...p.weights, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <p>
          Earth-center angle above the reference or measured horizon. Windows
          must span more than zero and at most 31 days, with no more than 2,000
          intervals. Priorities affect comparison scores, not the underlying
          visibility percentages.
        </p>
      </details>
    </section>
  );
}
export default function LandingSearch(p: SearchProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <form
      className="landing-search glass professional-setup"
      aria-label="Lunar landing search"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <fieldset
        disabled={!ready}
        className="search-ready"
        aria-label="Mission parameters"
      >
        <MissionConfiguration {...p} />
        <section
          className="location-configuration"
          aria-label="Select Landing Locations"
        >
          <h2>2. Select Landing Locations</h2>
          <p>
            Choose one primary location and up to two alternatives. Location
            names identify coordinates; this is not a lunar place-name geocoder.
          </p>
          <div className="mission-field-grid">
            <label>
              Primary location name
              <input
                required
                maxLength={100}
                value={p.selected.name}
                onChange={(e) =>
                  p.onSelected({ ...p.selected, name: e.target.value })
                }
              />
            </label>
            <label>
              Latitude (° N)
              <input
                aria-label="Latitude"
                type="number"
                required
                min="-90"
                max="90"
                step="any"
                value={
                  Number.isFinite(p.selected.latitude)
                    ? p.selected.latitude
                    : ""
                }
                onChange={(e) =>
                  p.onSelected({
                    ...p.selected,
                    latitude:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Longitude (° E)
              <input
                aria-label="Longitude"
                type="number"
                required
                min="-180"
                max="180"
                step="any"
                value={
                  Number.isFinite(p.selected.longitude)
                    ? p.selected.longitude
                    : ""
                }
                onChange={(e) =>
                  p.onSelected({
                    ...p.selected,
                    longitude:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <LocationPicker
            session={p.session}
            sites={p.sites}
            primary={p.selected}
            onPrimary={p.onSelected}
            onMap={p.onMap}
          />
        </section>
        <div className="setup-action">
          <div>
            <h2>3. Review Preliminary Comparison</h2>
            <p>
              All selected locations use the same scientific engine and mission
              settings.
            </p>
          </div>
          <button
            className="button primary search-go"
            disabled={p.busy || Object.values(p.weights).every((w) => w === 0)}
          >
            {p.busy ? "Calculating…" : "Assess this site"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
