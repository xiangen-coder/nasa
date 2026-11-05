"use client";
import { ArrowUpRight } from "lucide-react";
import type { Mission, Site } from "../app/types";
import type { Research, ResearchComparison } from "./LandingResearch";
const key = (s: Site) => `${s.latitude},${s.longitude}`;
const score = (r: Research | undefined, k: string) =>
  r?.factors[k]?.score == null
    ? "Unavailable"
    : `${r.factors[k].score!.toFixed(1)}${k === "S" || k === "C" ? "%" : " / 100"}`;
export default function PreliminaryComparison({
  mission,
  sites,
  state,
  onCompare,
  onInspect,
  onSearch,
  onCancel,
}: {
  mission: Mission;
  sites: Site[];
  state: ResearchComparison | null;
  onCompare: () => void;
  onInspect: (r: Research) => void;
  onSearch: () => void;
  onCancel: () => void;
}) {
  const planned = state?.candidates.length
    ? state.candidates
    : [mission, ...sites]
        .filter((s, i, a) => a.findIndex((p) => key(p) === key(s)) === i)
        .slice(0, 3);
  const selected = state?.results.find((r) => key(r.mission) === key(mission));
  return (
    <section
      className="preliminary-comparison"
      aria-label="Preliminary site comparison"
    >
      <div className="preliminary-intro">
        <div>
          <span className="eyebrow">PRELIMINARY ASSESSMENT</span>
          <p>
            Compare your selected location with up to two saved or reference
            points, using the same mission window and research limits.
          </p>
          <small>
            {mission.start.replace("T", " ")} → {mission.end.replace("T", " ")}{" "}
            · {mission.interval_minutes}-minute samples
          </small>
        </div>
        <div className="preliminary-controls">
          <button className="button subtle" onClick={onSearch}>
            Back to Search
          </button>
          <button
            className="button primary"
            disabled={state?.busy}
            onClick={onCompare}
          >
            {state?.busy ? "Comparing…" : "Compare these points"}
          </button>
          {state?.busy && (
            <button className="button subtle" onClick={onCancel}>
              Stop comparison
            </button>
          )}
        </div>
      </div>
      {state?.busy && (
        <p role="status" className="info">
          {state.progress || "Preparing the comparison…"} Cards update as each
          real assessment finishes.
        </p>
      )}
      {state?.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <div className="pre-result-grid">
        {planned.map((site, i) => {
          const r = state?.results.find(
              (value) => key(value.mission) === key(site),
            ),
            failure = state?.failures[key(site)],
            isSelected = key(site) === key(mission);
          const comparable = !!(
            selected &&
            r &&
            selected.available_weight === r.available_weight &&
            selected.missing.join() === r.missing.join() &&
            selected.geometry.mode === r.geometry.mode
          );
          const delta =
            comparable && r?.score != null && selected?.score != null
              ? r.score - selected.score
              : null;
          return (
            <article
              className="pre-result-card glass"
              key={key(site)}
              aria-label={`Pre-result ${i + 1}: ${site.name}`}
            >
              <h2>Pre-Result {i + 1}</h2>
              <div className="pre-point">
                <span className="eyebrow">
                  {isSelected
                    ? "SELECTED LANDING LOCATION"
                    : "COMPARISON LOCATION"}
                </span>
                <strong>{site.name}</strong>
                <span>
                  {site.latitude.toFixed(4)}° N, {site.longitude.toFixed(4)}° E
                </span>
              </div>
              <div className="pre-score">
                <strong>{r?.score == null ? "—" : r.score.toFixed(1)}</strong>
                <span>/ 100</span>
              </div>
              <dl>
                <div>
                  <dt>RESEARCH SCORE STATUS</dt>
                  <dd>
                    {r
                      ? r.provisional
                        ? "Provisional · incomplete evidence"
                        : "Research assessment"
                      : failure
                        ? "Assessment unavailable"
                        : state?.busy
                          ? "Awaiting assessment"
                          : "Not assessed yet"}
                  </dd>
                  {r && (
                    <dd>
                      {(r.available_weight * 100).toFixed(0)}% nominal evidence
                      · Missing: {r.missing.join(", ") || "none"}
                    </dd>
                  )}
                </div>
                <div>
                  <dt>TERRAIN SAFETY</dt>
                  <dd>
                    {score(r, "T")}
                    {r?.terrain.slope_p95_deg != null
                      ? ` · ${r.terrain.slope_p95_deg.toFixed(1)}° p95 slope`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>SUNLIGHT AVAILABILITY</dt>
                  <dd>{score(r, "S")}</dd>
                </div>
                <div>
                  <dt>EARTH COMMUNICATION</dt>
                  <dd>
                    {score(r, "C")}{" "}
                    {r?.factors.C.score != null ? "geometric visibility" : ""}
                  </dd>
                </div>
                <div>
                  <dt>TEMPERATURE / ICE POTENTIAL</dt>
                  <dd>
                    {score(r, "H")} / {score(r, "I")}
                  </dd>
                </div>
                <div>
                  <dt>ENVIRONMENT & LIMITS</dt>
                  <dd>
                    {failure ||
                      (!r
                        ? "Real data will appear after assessment."
                        : r.constraints_failed.length
                          ? r.constraints_failed.join(" ")
                          : "Landing safety is not established.")}
                  </dd>
                  {r && <dd>{r.warnings.slice(0, 2).join(" ")}</dd>}
                </div>
              </dl>
              {!isSelected && r && selected && (
                <p className="pre-comparison-note">
                  {r.constraints_failed.length
                    ? "Exceeds configured limits; not an eligible backup recommendation."
                    : !comparable
                      ? "Evidence coverage differs; scores cannot establish a better landing site."
                      : delta == null
                        ? "Insufficient score data for comparison."
                        : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} research points versus your selection. This does not establish safety or diversion reachability.`}
                </p>
              )}
              <div className="pre-result-actions">
                <button
                  className="button subtle"
                  disabled={!r}
                  onClick={() => r && onInspect(r)}
                >
                  More info <ArrowUpRight size={13} />
                </button>
                <button className="button subtle" onClick={onSearch}>
                  Back to Search
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="preliminary-disclosure">
        Scores are research screening results, not landing-success
        probabilities. Comparison points are selected from saved points and
        geographic references; they are not verified safe, reachable or
        optimized landing alternatives. Use More info for source data, Apollo LM
        assumptions and backup terrain screening.
      </p>
    </section>
  );
}
