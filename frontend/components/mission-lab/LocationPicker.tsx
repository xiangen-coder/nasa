"use client";
import { useState } from "react";
import type { Site } from "../../app/types";
import { pointKey, type MissionSession } from "./useMissionSession";
type Props = {
  session: MissionSession;
  sites: Site[];
  primary: Site;
  onPrimary: (s: Site) => void;
  onMap: () => void;
  compact?: boolean;
};
export default function LocationPicker({
  session,
  sites,
  primary,
  onPrimary,
  onMap,
  compact = false,
}: Props) {
  const [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState("");
  return (
    <section
      className={`location-picker ${compact ? "compact" : ""}`}
      aria-label="Selected landing locations"
    >
      <div className="selection-list">
        {session.locations.map((s, i) => (
          <div className="selection-chip" key={s.id || pointKey(s)}>
            <span>
              <small>{i === 0 ? "PRIMARY" : "ALTERNATIVE"}</small>
              <strong>{s.name}</strong>
              {s.latitude.toFixed(4)}° N / {s.longitude.toFixed(4)}° E
            </span>
            {i > 0 && (
              <button
                type="button"
                className="button subtle"
                onClick={() => session.remove(s)}
              >
                Remove {s.name}
              </button>
            )}
          </div>
        ))}
      </div>
      <label>
        Search reference locations
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by location name"
        />
      </label>
      <div className="reference-list">
        {sites
          .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
          .map((s) => (
            <article key={s.id || pointKey(s)}>
              <h3>{s.name}</h3>
              <p>
                {s.latitude.toFixed(2)}° N / {s.longitude.toFixed(2)}° E
              </p>
              <div className="action-row">
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => {
                    onPrimary(s);
                    session.setMessage("");
                  }}
                >
                  Use as primary
                </button>
                <button
                  type="button"
                  className="button subtle"
                  disabled={
                    session.locations.length >= 3 ||
                    session.locations.some((p) => pointKey(p) === pointKey(s))
                  }
                  onClick={() => session.add(s)}
                >
                  Add comparison
                </button>
              </div>
            </article>
          ))}
      </div>
      <button type="button" className="button subtle" onClick={onMap}>
        Choose primary location on map
      </button>
      <details className="manual-alternative">
        <summary>Add alternative coordinates</summary>
        <div className="manual-fields">
          <label>
            Alternative name
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Alternative latitude (° N)
            <input
              type="number"
              min="-90"
              max="90"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label>
            Alternative longitude (° E)
            <input
              type="number"
              min="-180"
              max="180"
              step="any"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button subtle"
            disabled={session.locations.length >= 3}
            onClick={() => {
              if (!lat.trim() || !lon.trim()) {
                session.setMessage("Enter both alternative coordinates.");
                return;
              }
              if (
                session.add({
                  name: name.trim() || `Comparison ${session.locations.length}`,
                  latitude: Number(lat),
                  longitude: Number(lon),
                })
              ) {
                setName("");
                setLat("");
                setLon("");
              }
            }}
          >
            Add to selection
          </button>
        </div>
      </details>
      {session.message && (
        <p role="alert" className="info">
          {session.message}
        </p>
      )}
      <p className="muted">
        {session.locations.length} / 3 locations. References are exploratory
        coordinates, not certified landing sites. Primary: {primary.name}.
      </p>
    </section>
  );
}
