import { ArrowUpRight, Earth, Radio, Sun } from "lucide-react";
import type {Comparison} from "../app/types";

export function AlternativeCards({
  comparison,
  onInspect,
}: {
  comparison: Comparison;
  onInspect: (analysis: Comparison["ranking"][number]) => void;
}) {
  return (
    <div className="alternative-cards">
      {comparison.ranking.map((result, index) => (
        <article className="alternative-card glass" key={result.mission.name}>
          <div className="alternative-top">
            <span className="eyebrow">REFERENCE SITE / 0{index + 1}</span>
            <span className="rank">0{index + 1}</span>
          </div>
          <h3>{result.mission.name}</h3>
          <p className="alternative-coordinates">
            {result.mission.latitude.toFixed(2)}° N /{" "}
            {result.mission.longitude.toFixed(2)}° E
          </p>
          <div className="alternative-score">
            {result.score.toFixed(1)}
            <small>/ 100</small>
          </div>
          <p className="card-label">Weighted visibility score</p>
          <dl>
            <div>
              <dt>
                <Sun size={13} />
                Sunlight
              </dt>
              <dd>{result.metrics.sun_visible_pct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>
                <Earth size={13} />
                Earth visibility
              </dt>
              <dd>{result.metrics.earth_visible_pct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>
                <Radio size={13} />
                Both visible
              </dt>
              <dd>{result.metrics.simultaneous_pct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Slope</dt>
              <dd>
                {result.slope_deg === null
                  ? "Unknown"
                  : `${result.slope_deg.toFixed(1)}°`}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Geographic reference, not a certified safe landing site. Hazards are
            not scored.
          </p>
          <button className="button subtle" onClick={() => onInspect(result)}>
            Inspect this location <ArrowUpRight size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}
