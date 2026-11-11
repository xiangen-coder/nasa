"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, MapPin, SlidersHorizontal } from "lucide-react";
import type { MissionCatalogEntry, Site } from "../app/types";
import { referenceSites } from "../lib/reference-sites";
import LandingAtlas from "./LandingAtlas";

export default function LandingSearch({
  selected,
  missionSites,
  onSelected,
  start,
  end,
  startTime,
  endTime,
  onStart,
  onEnd,
  onStartTime,
  onEndTime,
  interval,
  onInterval,
  clearance,
  onClearance,
  priority,
  onPriority,
  busy,
  onSubmit,
  onMap,
}: {
  selected: Site;
  missionSites: MissionCatalogEntry[];
  onSelected: (site: Site) => void;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
  interval: number;
  onInterval: (value: number) => void;
  clearance: number;
  onClearance: (value: number) => void;
  priority: string;
  onPriority: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onMap: () => void;
}) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const missionPoints = missionSites.flatMap((site) =>
    site.latitude == null || site.longitude == null ? [] : [{ ...site, latitude: site.latitude, longitude: site.longitude }],
  );
  const points = [...referenceSites, ...missionPoints];
  const reference = points.findIndex((site) =>
    site.name === selected.name && site.latitude === selected.latitude && site.longitude === selected.longitude);
  const custom = reference < 0;
  const missionSite = points[reference];
  // Prevent edits to the server-rendered form from being lost before React binds it.
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <form
      id="landing-search-form"
      className="landing-search glass"
      aria-label="Lunar landing search"
      tabIndex={-1}
      onSubmit={(e) => {
        e.preventDefault();
        const a = Date.parse(`${start}T${startTime}:00Z`),
          b = Date.parse(`${end}T${endTime}:00Z`);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
          setError("End date and time must be later than the start.");
          return;
        }
        if ((b - a) / 86400000 > 31 || (b - a) / 60000 / interval > 400) {
          setError("Shorten the mission window or increase the time step. Research allows up to 31 days and 400 intervals.");
          return;
        }
        setError("");
        onSubmit();
      }}
    >
      <fieldset
        className="search-ready"
        disabled={!ready}
        aria-label="Mission parameters"
      >
        <div className="search-group-title">
          <span>Mission window</span>
        </div>
        <div className="search-fields timeline-fields">
          <label className="search-field">
            Start date
            <input
              type="date"
              required
              min="1901-01-01"
              max="2052-12-30"
              value={start}
              onChange={(e) => onStart(e.target.value)}
            />
          </label>
          <label className="search-field">
            Start time (UTC)
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => onStartTime(e.target.value)}
            />
          </label>
          <label className="search-field">
            End date
            <input
              type="date"
              required
              min={start}
              max="2052-12-31"
              value={end}
              onChange={(e) => onEnd(e.target.value)}
            />
          </label>
          <label className="search-field">
            End time (UTC)
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => onEndTime(e.target.value)}
            />
          </label>
          <label className="search-field priority-field">
            Assessment focus
            <select
              value={priority}
              onChange={(e) => onPriority(e.target.value)}
            >
              <option value="overall">Overall consideration</option>
              <option value="T">Terrain safety</option>
              <option value="S">Sunlight availability</option>
              <option value="C">Earth communication</option>
            </select>
          </label>
        </div>
        <div className="search-group-title">
          <span>Landing location</span>
          {custom && <button type="button" className="search-map-link" onClick={onMap}>
            <MapPin size={13} /> Choose on map <ArrowUpRight size={13} />
          </button>}
        </div>
        <div className="search-fields coordinate-fields">
          <label className="search-field location-field">
            Location name
            <select value={custom ? "custom" : String(reference)} onChange={(event) => {
              const value = event.target.value;
              onSelected(value === "custom"
                ? { name: "Custom location", latitude: selected.latitude, longitude: selected.longitude }
                : points[Number(value)]);
            }}>
              {referenceSites.map((site, index) => <option key={site.name} value={index}>{site.name}</option>)}
              {missionPoints.length > 0 && <optgroup label="Published mission locations">
                {missionPoints.map((site, index) => <option key={site.id} value={referenceSites.length + index}>{site.name} · {site.site_name}</option>)}
              </optgroup>}
              {missionSites.some((site) => site.latitude == null) && <optgroup label="Mission records without a selectable coordinate">
                {missionSites.filter((site) => site.latitude == null).map((site) => (
                  <option key={site.id} value={site.id} disabled>{site.name} · {site.site_name}</option>
                ))}
              </optgroup>}
              <option value="custom">Custom location</option>
            </select>
          </label>
          {custom && <label className="search-field custom-location-name">
            Custom location name
            <input
              type="text"
              required
              maxLength={100}
              value={selected.name}
              onChange={(e) =>
                onSelected({ ...selected, name: e.target.value })
              }
            />
          </label>}
          <label className="search-field">
            Latitude <span className="field-unit">° N</span>
            <input
              aria-label="Latitude"
              type="number"
              required
              min="-90"
              max="90"
              step="any"
              value={
                Number.isFinite(selected.latitude) ? selected.latitude : ""
              }
              onChange={(e) =>
                onSelected({
                  ...selected,
                  name: custom ? selected.name : "Custom location",
                  latitude:
                    e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="search-field">
            Longitude <span className="field-unit">° E</span>
            <input
              aria-label="Longitude"
              type="number"
              required
              min="-180"
              max="180"
              step="any"
              value={
                Number.isFinite(selected.longitude) ? selected.longitude : ""
              }
              onChange={(e) =>
                onSelected({
                  ...selected,
                  name: custom ? selected.name : "Custom location",
                  longitude:
                    e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
          <button type="submit" className="search-go" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Calculating…
              </>
            ) : (
              <>
                Go <ArrowUpRight size={19} />
              </>
            )}
          </button>
        </div>
        {missionSite && "classification" in missionSite && (
          <p>
            {missionSite.status}{missionSite.event_date ? ` · ${missionSite.event_date}` : ""}. {missionSite.coordinate_note}{" "}
            {missionSite.relay && `${missionSite.relay} `}
            <a href={missionSite.source_url} target="_blank" rel="noreferrer">Mission source</a>
          </p>
        )}
        <LandingAtlas selected={selected} onSelect={onSelected} />
        <div className="search-form-footer">
          <details className="search-advanced">
            <summary>
              <SlidersHorizontal size={13} /> Sampling & link settings
            </summary>
            <div className="advanced-fields">
              <label>
                Time step
                <select
                  value={interval}
                  onChange={(e) => onInterval(Number(e.target.value))}
                >
                  {[5, 15, 30, 60, 180, 360].map((n) => (
                    <option value={n} key={n}>
                      {n < 60
                        ? `${n} minutes`
                        : `${n / 60} hour${n > 60 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Link clearance (°)
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={clearance}
                  onChange={(e) => onClearance(Number(e.target.value))}
                />
              </label>
              <p>Up to 31 days and 400 research intervals.</p>
            </div>
          </details>
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
