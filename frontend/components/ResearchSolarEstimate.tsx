import type { Research } from "./LandingResearch";
import { defaultSolar, solarEnergy, type SolarSettings } from "./mission-lab/scenario-science";

const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export default function ResearchSolarEstimate({ result, equipment = defaultSolar }: { result: Research; equipment?: SolarSettings }) {
  const rows = result.geometry.available ? result.geometry.series : undefined;
  const estimate = rows && rows.length > 1 && rows.every((row) => typeof row.sun_visible === "boolean")
    ? solarEnergy({ mission: result.mission, series: rows }, equipment)
    : null;

  return (
    <section className="research-solar" aria-label="Estimated solar generation">
      <h3>Estimated solar generation</h3>
      {estimate ? (
        <>
          <dl className="research-report-settings">
            <div><dt>Mission energy</dt><dd>{number(estimate.total_kwh)} kWh</dd></div>
            <div><dt>Average power</dt><dd>{number(estimate.daily_kwh * 1000 / 24)} W</dd></div>
            <div><dt>Peak sampled power</dt><dd>{number(Math.max(...estimate.samples.map((sample) => sample.power_w)))} W</dd></div>
          </dl>
          <p>Assumes a {equipment.area_m2} m² {equipment.tracking ? "Sun-tracking array" : `fixed array tilted ${equipment.tilt_deg}° at azimuth ${equipment.azimuth_deg}°`}, {equipment.efficiency_pct}% efficiency, {equipment.irradiance_wm2} W/m² irradiance and {equipment.loss_pct}% losses.</p>
          <p>{result.geometry.mode === "broad_terrain_screened" ? "Uses sunlight screened against broad terrain. Smaller shadows are unresolved." : result.geometry.mode === "terrain_screened" ? "Uses sampled terrain-screened sunlight." : "Uses reference geometry. Local terrain shadows are unknown."} Estimate covers panel output before storage and spacecraft loads.</p>
        </>
      ) : <p>Sunlight samples are unavailable for this estimate.</p>}
    </section>
  );
}
