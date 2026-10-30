"use client";
import { useEffect, useState } from "react";
import { Bookmark, CloudSun, Download, Rocket, Trash2 } from "lucide-react";
import type { Mission } from "../app/types";

type Vehicle = {
  diameter: string;
  margin: string;
  mass: string;
  power: string;
  panel: string;
  reserve: string;
  transit: string;
  tolerance: string;
};
type Plan = {
  id: string;
  version: 1;
  name: string;
  mission: Mission;
  launch: string;
  pad: string;
  vehicle: Vehicle;
  saved_at: string;
};
type Forecast = {
  status: string;
  message: string;
  fetched_at: string | null;
  hours: {
    time: string;
    temperature_2m: number | null;
    precipitation_probability: number | null;
    wind_speed_10m: number | null;
    cloud_cover: number | null;
  }[];
  source?: string;
};
const KEY = "lunar-navigator-plans-v1";
const initialVehicle: Vehicle = {
  diameter: "",
  margin: "",
  mass: "",
  power: "",
  panel: "",
  reserve: "",
  transit: "",
  tolerance: "",
};
const fields: [keyof Vehicle, string, string][] = [
  [
    "diameter",
    "Lander footprint diameter (m)",
    "Contact footprint, not rocket height",
  ],
  ["margin", "Clearance on each side (m)", "User-selected planning margin"],
  [
    "mass",
    "Landed mass (kg)",
    "User input; structural capacity is not assessed",
  ],
  ["power", "Required electrical power (W)", "User-specified load"],
  [
    "panel",
    "Usable output per solar panel (W)",
    "Derated output, not nameplate peak",
  ],
  ["reserve", "Power design margin (%)", "User-selected extra capacity"],
  [
    "transit",
    "Transit duration (hours)",
    "Mission-specific input; not a predicted trajectory",
  ],
  [
    "tolerance",
    "Transit tolerance ± (hours)",
    "User-estimated timing uncertainty",
  ],
];
function numeric(s: string) {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : null;
}
function validPlan(p: unknown): p is Plan {
  if (!p || typeof p !== "object") return false;
  const x = p as Plan;
  return (
    x.version === 1 &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    x.name.length <= 80 &&
    !!x.mission &&
    Number.isFinite(x.mission.latitude) &&
    Math.abs(x.mission.latitude) <= 90 &&
    Number.isFinite(x.mission.longitude) &&
    Math.abs(x.mission.longitude) <= 180 &&
    typeof x.mission.name === "string" &&
    Number.isFinite(Date.parse(x.mission.start)) &&
    Number.isFinite(Date.parse(x.mission.end)) &&
    x.mission.interval_minutes >= 5 &&
    x.mission.interval_minutes <= 1440 &&
    x.mission.clearance_deg >= 0 &&
    x.mission.clearance_deg <= 20 &&
    typeof x.launch === "string" &&
    typeof x.pad === "string" &&
    !!x.vehicle &&
    fields.every(
      ([k]) => typeof x.vehicle[k] === "string" && x.vehicle[k].length < 40,
    ) &&
    typeof x.saved_at === "string"
  );
}
export default function MissionPlanner({
  mission,
  onRestore,
}: {
  mission: Mission;
  onRestore: (m: Mission) => void;
}) {
  const [vehicle, setVehicle] = useState<Vehicle>(initialVehicle),
    [name, setName] = useState(""),
    [launch, setLaunch] = useState(""),
    [pad, setPad] = useState("kennedy"),
    [plans, setPlans] = useState<Plan[]>([]),
    [message, setMessage] = useState(""),
    [weather, setWeather] = useState<Forecast | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(data)) setPlans(data.filter(validPlan).slice(0, 20));
    } catch {
      setMessage(
        "Saved plans could not be read. Existing storage was not overwritten.",
      );
    }
  }, []);
  useEffect(() => {
    setWeather(null);
  }, [launch, pad]);
  const diameter = numeric(vehicle.diameter),
    margin = numeric(vehicle.margin),
    power = numeric(vehicle.power),
    panel = numeric(vehicle.panel),
    reserve = numeric(vehicle.reserve),
    transit = numeric(vehicle.transit),
    tolerance = numeric(vehicle.tolerance);
  const platform =
    diameter !== null && diameter > 0 && margin !== null
      ? diameter + margin * 2
      : null;
  const panels =
    power !== null &&
    power > 0 &&
    panel !== null &&
    panel > 0 &&
    reserve !== null
      ? Math.ceil((power * (1 + reserve / 100)) / panel)
      : null;
  const eta =
    launch &&
    transit !== null &&
    transit > 0 &&
    tolerance !== null &&
    tolerance <= transit &&
    Number.isFinite(Date.parse(launch + "Z"))
      ? [
          new Date(
            Date.parse(launch + "Z") + (transit - tolerance) * 3600000,
          ).toISOString(),
          new Date(
            Date.parse(launch + "Z") + (transit + tolerance) * 3600000,
          ).toISOString(),
        ]
      : null;
  const persist = (next: Plan[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setPlans(next);
      return true;
    } catch {
      setMessage(
        "Browser storage is unavailable or full. Your plan was not saved.",
      );
      return false;
    }
  };
  const save = () => {
    if (!name.trim()) {
      setMessage("Enter a name for your plan.");
      return;
    }
    if (plans.length >= 20) {
      setMessage("You can store 20 plans; remove one before saving.");
      return;
    }
    const plan: Plan = {
      id: crypto.randomUUID(),
      version: 1,
      name: name.trim(),
      mission,
      launch,
      pad,
      vehicle,
      saved_at: new Date().toISOString(),
    };
    if (!validPlan(plan)) {
      setMessage(
        "Complete a valid mission date range and coordinates before saving.",
      );
      return;
    }
    if (persist([...plans, plan]))
      setMessage("Plan saved in this browser. It is not synced to an account.");
  };
  const forecast = async () => {
    if (!launch) {
      setMessage("Choose an Earth launch date/time first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/weather?pad=${encodeURIComponent(pad)}&date=${encodeURIComponent(launch.slice(0, 10))}`,
      );
      if (!response.ok) throw Error("Weather request failed.");
      setWeather(await response.json());
    } catch {
      setWeather({
        status: "unavailable",
        hours: [],
        fetched_at: null,
        message: "Weather service unavailable. No forecast was substituted.",
      });
    } finally {
      setBusy(false);
    }
  };
  const exportPlan = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            mission,
            launch,
            pad,
            vehicle,
            derived: {
              minimum_circular_platform_diameter_m: platform,
              minimum_circular_platform_area_m2:
                platform === null ? null : Math.PI * (platform / 2) ** 2,
              solar_panel_count: panels,
              estimated_arrival_window_utc: eta,
            },
            assumptions: [
              "All vehicle and transit values are user inputs, not verified rocket specifications.",
              "Platform assumes a circular footprint and clearance margin; terrain and structural feasibility are not evaluated.",
              "Panel count uses user-specified usable output; storage, illumination, incidence and degradation are not modeled.",
              "ETA is launch plus entered duration ± entered tolerance, not a computed flight trajectory.",
            ],
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mission-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="planner">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Rocket size={17} /> Mission & vehicle worksheet
            </h2>
            <p>
              Explicit assumptions, not an automatic rocket or launch
              certification.
            </p>
          </div>
          <button className="button subtle" onClick={exportPlan}>
            <Download size={14} /> Export plan
          </button>
        </div>
        <div className="planner-body">
          <div className="info">
            The Moon has no Earth-like weather forecast. Below is Earth
            launch-area weather only. Space weather, lunar surface temperature,
            rocket performance and trajectories remain unmodeled.
          </div>
          <div className="planner-inputs">
            {fields.map(([key, label, help]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="any"
                  value={vehicle[key]}
                  placeholder="Enter your specification"
                  onChange={(e) =>
                    setVehicle({ ...vehicle, [key]: e.target.value })
                  }
                />
                <small>{help}</small>
              </label>
            ))}
          </div>
          <div className="worksheet-results">
            <div>
              <span>Minimum circular platform</span>
              <strong>
                {platform === null
                  ? "Needs inputs"
                  : `${platform.toFixed(2)} m diameter`}
              </strong>
              <small>
                {platform === null
                  ? "Enter footprint + clearance"
                  : `${(Math.PI * (platform / 2) ** 2).toFixed(2)} m² · geometric footprint only`}
              </small>
            </div>
            <div>
              <span>Solar panel count</span>
              <strong>
                {panels === null ? "Needs inputs" : panels.toLocaleString()}
              </strong>
              <small>
                ceil(load × (1 + margin / 100) / usable panel output)
              </small>
            </div>
            <div>
              <span>Arrival window · UTC</span>
              <strong>
                {eta
                  ? new Date(eta[0]).toUTCString()
                  : "Needs launch + transit inputs"}
              </strong>
              {eta && <small>through {new Date(eta[1]).toUTCString()}</small>}
            </div>
          </div>
          <p className="muted">
            No values are prefilled from unverified rocket specifications.
            Footprint, power and ETA estimates do not establish landing safety
            or a feasible transfer.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <CloudSun size={17} /> Earth launch-area weather
            </h2>
            <p>Short-range modeled forecast · Open-Meteo · UTC</p>
          </div>
        </div>
        <div className="planner-body">
          <div className="launch-controls">
            <label>
              Launch area
              <select value={pad} onChange={(e) => setPad(e.target.value)}>
                <option value="kennedy">Kennedy Space Center area</option>
                <option value="vandenberg">
                  Vandenberg Space Force Base area
                </option>
              </select>
            </label>
            <label>
              Earth launch date/time (UTC)
              <input
                type="datetime-local"
                value={launch}
                min="1901-01-01T00:00"
                max="2052-12-31T23:59"
                onChange={(e) => setLaunch(e.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !launch}
              onClick={forecast}
            >
              {busy ? "Retrieving…" : "Check weather"}
            </button>
          </div>
          <p className="muted">
            Launch-area coordinates represent a broad area, not an exact launch
            pad. Forecasts are available for today and up to 15 days ahead; they
            cannot assess lunar landing suitability.
          </p>
          {weather && (
            <div
              className="forecast-result"
              role="region"
              aria-label="Launch weather result"
            >
              <p className="info">{weather.message}</p>
              {weather.fetched_at && (
                <p className="muted">
                  Retrieved {new Date(weather.fetched_at).toUTCString()} ·{" "}
                  {weather.status === "stale"
                    ? "STALE cached forecast"
                    : weather.status}
                </p>
              )}
              {weather.hours?.length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>UTC</th>
                        <th>Temperature</th>
                        <th>Precip. probability</th>
                        <th>10 m wind</th>
                        <th>Cloud cover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weather.hours.map((hour) => (
                        <tr key={hour.time}>
                          <td>
                            {new Date(hour.time).toLocaleTimeString("en-GB", {
                              timeZone: "UTC",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td>
                            {hour.temperature_2m === null
                              ? "Unknown"
                              : `${hour.temperature_2m} °C`}
                          </td>
                          <td>
                            {hour.precipitation_probability === null
                              ? "Unknown"
                              : `${hour.precipitation_probability} %`}
                          </td>
                          <td>
                            {hour.wind_speed_10m === null
                              ? "Unknown"
                              : `${hour.wind_speed_10m} km/h`}
                          </td>
                          <td>
                            {hour.cloud_cover === null
                              ? "Unknown"
                              : `${hour.cloud_cover} %`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <a
                className="text-button"
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
              >
                Weather data by Open-Meteo
              </a>
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Bookmark size={17} /> Saved mission plans
            </h2>
            <p>Browser-local itineraries · no account or cross-device sync</p>
          </div>
          <span className="tag">{plans.length} / 20</span>
        </div>
        <div className="planner-body">
          <div className="save-controls">
            <label>
              Plan name
              <input
                value={name}
                maxLength={80}
                placeholder="e.g. South pole investigation"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="button primary" onClick={save}>
              Save current plan
            </button>
          </div>
          <p className="muted">
            Saves {mission.name}, lunar mission dates, cadence, clearance, Earth
            launch inputs and your vehicle worksheet. Analysis is recalculated
            when a plan is restored.
          </p>
          {message && (
            <p className="info" role="status" aria-label="Plan notification">
              {message}
            </p>
          )}
          <div className="saved-plans">
            {plans.map((plan) => (
              <div className="saved-plan" key={plan.id}>
                <div>
                  <h3>{plan.name}</h3>
                  <p>
                    {plan.mission.name} · {plan.mission.start.slice(0, 10)} —{" "}
                    {plan.mission.end.slice(0, 10)}
                  </p>
                  <small>
                    {plan.launch
                      ? `Earth launch: ${plan.launch.replace("T", " ")} UTC`
                      : "No Earth launch time set"}
                  </small>
                </div>
                <button
                  className="button subtle"
                  onClick={() => {
                    setVehicle(plan.vehicle);
                    setLaunch(plan.launch);
                    setPad(plan.pad);
                    setName(plan.name);
                    onRestore(plan.mission);
                    setMessage(
                      "Plan restored. Run Analyze site to calculate new results.",
                    );
                  }}
                >
                  Restore
                </button>
                <button
                  aria-label={`Delete ${plan.name}`}
                  onClick={() => {
                    if (persist(plans.filter((p) => p.id !== plan.id)))
                      setMessage("Plan removed from this browser.");
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
