"use client";
import type { SolarSettings } from "./scenario-science";
export default function EquipmentControls({
  value: s,
  onChange,
  compact = false,
}: {
  value: SolarSettings;
  onChange: (s: SolarSettings) => void;
  compact?: boolean;
}) {
  const number = (
    key: keyof SolarSettings,
    label: string,
    min: number,
    max: number,
    step: number = 1,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(s[key])}
        onChange={(e) => {
          if (e.target.value === "") return;
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max)
            onChange({ ...s, [key]: n });
        }}
      />
    </label>
  );
  return (
    <div className="equipment-controls">
      <div className="scenario-fields">
        {number("area_m2", "Panel area (m²)", 0.01, 10000, 0.1)}
        <label>
          Panel direction
          <select
            value={s.tracking ? "tracking" : "fixed"}
            onChange={(e) =>
              onChange({ ...s, tracking: e.target.value === "tracking" })
            }
          >
            <option value="tracking">Ideal Sun tracking</option>
            <option value="fixed">Fixed panel</option>
          </select>
        </label>
        {!s.tracking && (
          <>
            {number("tilt_deg", "Tilt from horizontal (°)", 0, 180)}
            {number("azimuth_deg", "Panel direction east of north (°)", 0, 360)}
          </>
        )}
        <label>
          Equipment and battery
          <select
            value={s.demand_enabled ? "on" : "off"}
            onChange={(e) =>
              onChange({ ...s, demand_enabled: e.target.value === "on" })
            }
          >
            <option value="off">Solar estimate only</option>
            <option value="on">Model demand and battery</option>
          </select>
        </label>
        {s.demand_enabled && (
          <>
            {number("demand_w", "Constant equipment demand (W)", 0, 1000000)}
            {number(
              "battery_kwh",
              "Usable battery capacity (kWh)",
              0,
              100000,
              0.5,
            )}
          </>
        )}
      </div>
      <details
        className="learning-disclosure"
        open={compact ? undefined : true}
      >
        <summary>Efficiency, losses and advanced assumptions</summary>
        <div className="scenario-fields">
          {number(
            "efficiency_pct",
            "Panel conversion efficiency (%)",
            0.1,
            100,
            0.1,
          )}
          {number(
            "irradiance_wm2",
            "Assumed normal irradiance (W/m²)",
            1,
            2000,
          )}
          {number("loss_pct", "Assumed system losses (%)", 0, 100)}
          {s.demand_enabled && (
            <>
              {number("initial_soc_pct", "Initial battery charge (%)", 0, 100)}
              {number(
                "charge_efficiency_pct",
                "Charge efficiency (%)",
                0.1,
                100,
                0.1,
              )}
              {number(
                "discharge_efficiency_pct",
                "Discharge efficiency (%)",
                0.1,
                100,
                0.1,
              )}
            </>
          )}
        </div>
      </details>
      <p className="muted">
        Idealised estimate. Tracking assumes the panel always faces the visible
        Sun. No temperature, degradation or dust model; losses are your
        assumption.
      </p>
    </div>
  );
}
