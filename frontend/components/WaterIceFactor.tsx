import type { Research } from "./LandingResearch";

export default function WaterIceFactor({ result }: { result?: Research }) {
  const factor = result?.factors.I;
  const ice = result?.ice;
  return (
    <div>
      <dt>Water ice potential</dt>
      <dd>{!result ? "—" : factor?.score == null ? "Unavailable" : `${factor.score.toFixed(1)} / 100`}
        {factor && ` · ${Math.round(factor.weight * 100)}% nominal weight`}
      </dd>
      {ice?.available && ice.radius_m && ice.value != null && (
        <dd>{(ice.value * 100).toFixed(1)}% within {ice.radius_m.toLocaleString("en-GB")} m · mapped permanent shadow</dd>
      )}
      {(factor?.score == null || factor.quality === "psr_pixel") && factor?.explanation && <dd>{factor.explanation}</dd>}
      {result && <dd>Water ice presence and abundance are unconfirmed.</dd>}
    </div>
  );
}
