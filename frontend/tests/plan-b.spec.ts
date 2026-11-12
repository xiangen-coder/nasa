import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Mission } from "../app/types";
import { calendarEnd, searchDates } from "../lib/plan-b";

const start = "2026-10-01T00:00:00Z";
const end = "2026-10-02T00:00:00Z";
const limits = { max_slope_deg: 13 };

function evidence(mission: Mission, score = 80, original = false) {
  return {
    mission, limits, score, available_weight: original ? 0.8 : 0.95,
    missing: original ? ["H"] : [], provisional: true, constraints_failed: [], safety_status: "not_established",
    warnings: [], limitations: [], terrain: { available: true, resolution_m: 5, radius_m: 100, grid: [],
      slope_max_deg: 5, roughness_m: 1, relief_m: 4 },
    horizon: { available: true }, temperature: { available: !original },
    ice: { available: true, value: 0, radius_m: 100 },
    factors: Object.fromEntries(["T", "S", "C", "H", "I"].map((key) => [key, {
      score: key === "I" ? 0 : original && key === "H" ? null : score,
      weight: key === "I" ? 0.05 : 0.2, quality: "Fixture", explanation: "Fixture",
    }])),
    geometry: {
      available: true, mode: "terrain_screened", sunlight_hours: original ? 12 : 24,
      metrics: { sun_visible_pct: 100, earth_visible_pct: 100, simultaneous_pct: 100,
        longest_darkness_hours: 0, longest_blackout_hours: 0 },
      series: [mission.start, mission.end].map((time) => ({
        time, sun_visible: true, earth_visible: true, simultaneous: true,
        sun_elevation: 5, earth_elevation: 5, sun_azimuth: 12, earth_azimuth: 42,
      })),
    },
  };
}

async function openCompare(page: Page) {
  await page.route("**/api/research/datasets", (route) => route.fulfill({
    json: { datasets: [], reference_points: [], regions: [] },
  }));
  await page.route("**/api/research/evaluate", async (route) => {
    const { mission } = route.request().postDataJSON();
    await route.fulfill({ json: evidence(mission, 70, true) });
  });
  await page.goto("/#search", { waitUntil: "domcontentloaded" });
  const configure = page.locator("#landing-search-form");
  await configure.getByLabel("Start date", { exact: true }).fill(start.slice(0, 10));
  await configure.getByLabel("End date", { exact: true }).fill(end.slice(0, 10));
  await configure.getByRole("button", { name: "Go", exact: true }).click();
  const plan = page.getByRole("article", { name: "What IF" });
  await expect(plan.getByRole("button", { name: "Run What IF" })).toBeVisible();
  return plan;
}

function expectMissionSettings(missions: Mission[]) {
  for (const mission of missions) {
    expect(Date.parse(mission.end) - Date.parse(mission.start)).toBe(86_400_000);
    expect(mission.interval_minutes).toBe(60);
    expect(mission.clearance_deg).toBe(0);
  }
}

test("shows the assessed site's summary, methods, Lunar Journey and Water/Ice Evidence in Results", async ({ page }) => {
  await page.route("**/api/research/water-evidence?*", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("latitude")).toBe("-89.54");
    expect(url.searchParams.get("longitude")).toBe("0");
    const unavailable = { status: "unavailable", value: null, source_url: "https://pgda.gsfc.nasa.gov/products/69" };
    await route.fulfill({ json: { layers: {
      shadow: { ...unavailable, status: "available", value: 0, units: "fraction" },
      illumination: { ...unavailable, status: "available", value: 0.2752, units: "fraction" },
      temperature_min: unavailable,
      temperature_max: unavailable,
      surface_ice: unavailable,
      hydrogen: unavailable,
    } } });
  });
  await openCompare(page);
  await page.getByRole("article", { name: /Pre-result 1:/ }).getByRole("button", { name: "More details" }).click();
  const summary = page.locator("#result-summary");
  await expect(summary).toContainText("70.00 / 100");
  await expect(summary).toContainText("80% of nominal weight");
  await expect(summary).toContainText("Missing Temperature");
  await expect(summary).toContainText("12.0 h of sunlight");
  await expect(page.getByRole("region", { name: "NASA landing research" })).toHaveCount(0);
  const factors = page.locator("#result-methods").getByRole("table", { name: "Research score factors" });
  await expect(factors.getByRole("row", { name: /Water ice evidence/ })).toContainText("5.0%");
  const journey = page.locator("#result-summary + #result-journey");
  await expect(journey.getByRole("heading", { name: "Earth to your lunar landing point" })).toBeVisible();
  await expect(journey.locator("lunar-journey")).toHaveAttribute("latitude", "-89.54");
  await expect(page.locator("#result-journey + #result-visibility")).toBeVisible();
  const environment = page.locator("#result-environment");
  await expect(environment.getByText("Water/Ice Evidence", { exact: true })).toBeVisible();
  await expect(environment.getByText("27.5%", { exact: true })).toBeVisible();
  await environment.getByLabel("Local evidence map").selectOption("illumination");
  await expect(environment.getByRole("img", { name: /Long-term solar illumination around/ })).toHaveAttribute("src", /map\/illumination/);
});

test("calendar windows clamp month ends, handle leap dates and allow longer searches", () => {
  expect(calendarEnd(Date.parse("2026-01-31T13:00:00Z"), "month")).toBe("2026-02-28");
  expect(calendarEnd(Date.parse("2028-02-29T13:00:00Z"), "year")).toBe("2029-02-28");
  const mission = { name: "Original", latitude: -89, longitude: 0, start, end, interval_minutes: 60, clearance_deg: 0 };
  const range = searchDates(mission, "custom", "2029-10-01", "12:00");
  expect(range.first).toBe(Date.parse("2026-10-01T12:00:00Z"));
  expect(range.count).toBeGreaterThan(1000);
  expect(searchDates(mission, "month", "", "").count).toBe(31);
  expect(searchDates(mission, "year", "", "").count).toBe(365);
});

test("delay search samples then refines, ranks by earliest and preserves the original", async ({ page }) => {
  const candidates: Mission[] = [];
  await page.route("**/api/research/plan-b", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.limits).toEqual(limits);
    candidates.push(body.mission);
    await route.fulfill({ json: { status: "evaluated", result: evidence(body.mission, candidates.length) } });
  });
  const plan = await openCompare(page);
  const original = page.getByRole("article", { name: /Pre-result 1:/ });
  const criteria = original.getByRole("region", { name: "Criteria at a glance" });
  await expect(criteria.getByRole("meter", { name: "Water ice potential" })).toHaveAttribute("value", "0");
  await expect(criteria.getByRole("meter", { name: "Temperature" })).toHaveCount(0);
  await expect(criteria.getByText("Unavailable")).toBeVisible();
  await original.getByText("Environment & limits", { exact: true }).click();
  await expect(original.getByText("0.0% within 100 m · mapped permanent shadow")).toBeVisible();
  await expect(original.getByText("Water ice presence and abundance are unconfirmed.")).toBeVisible();
  await expect(original.getByText("0.0 / 100 · 5% nominal weight")).toBeVisible();
  const originalText = await original.innerText();
  await expect(plan.getByRole("radio", { name: "Change date" })).toBeChecked();
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await expect(plan.getByRole("heading", { name: /Choose (dates|locations|options) to compare/ })).toBeVisible();
  expect(candidates.length).toBeGreaterThan(10);
  expect(candidates[0].start).toBe("2026-10-02T00:00:00.000Z");
  expect(candidates.some((mission) => mission.start.startsWith("2026-11-01"))).toBeTruthy();
  expectMissionSettings(candidates);
  await expect(plan.getByRole("table").first()).toContainText("2026-10-02 00:00:00 UTC");
  await plan.getByRole("button", { name: /Details for.*2026-10-02/ }).click();
  await expect(plan.getByText("Scores are incomparable because evidence coverage differs.").first()).toBeVisible();
  await plan.getByText("Mission, terrain and ice details", { exact: true }).first().click();
  await expect(plan.getByText("Water ice potential", { exact: true }).first()).toBeVisible();
  await plan.getByRole("button", { name: /^Details for/ }).first().click();
  expect(await original.innerText()).toBe(originalText);
  await page.setViewportSize({ width: 390, height: 850 });
  await plan.scrollIntoViewIfNeeded();
  const mobile = await plan.boundingBox();
  expect(mobile!.x).toBeGreaterThanOrEqual(0);
  expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
});

test("location and combined searches keep the baseline and enforce the 20 km limit", async ({ page }) => {
  const candidates: Mission[] = [];
  const longName = "Near B · " + "SouthPolarRidge".repeat(8);
  await page.route("**/api/reliability/plan-b-sites", async (route) => {
    const { mission } = route.request().postDataJSON();
    await route.fulfill({ json: { searched: 3, overlap_excluded: 0, outside_or_missing: 0,
      failed_limits: 0, passing_terrain_candidates: 3,
      candidates: [
        { location: { name: "Near A", latitude: mission.latitude + 0.01, longitude: mission.longitude } },
        { location: { name: longName, latitude: mission.latitude + 0.02, longitude: mission.longitude } },
        { location: { name: "Far", latitude: 0, longitude: 0 } },
      ] } });
  });
  await page.route("**/api/research/plan-b", async (route) => {
    const { mission } = route.request().postDataJSON();
    candidates.push(mission);
    await route.fulfill({ json: { status: "evaluated", result: evidence(mission, mission.name === longName ? 95 : 80) } });
  });
  const plan = await openCompare(page);
  await plan.getByText("Change location", { exact: true }).click();
  await expect(plan.getByText("Custom coordinates and terrain suggestions")).toBeVisible();
  await expect(plan.getByLabel("Search window")).toHaveCount(0);
  await plan.getByRole("button", { name: "Suggest nearby points" }).click();
  await expect(plan.getByRole("heading", { name: /Choose (dates|locations|options) to compare/ })).toBeVisible();
  await expect(plan.getByRole("table").first()).toContainText(longName);
  expect(candidates).toHaveLength(2);
  expect(candidates.every((mission) => Date.parse(mission.start) === Date.parse(start))).toBeTruthy();
  await plan.getByText("Change both", { exact: true }).click();
  await expect(plan.getByText("Choose alternative sites")).toBeHidden();
  await expect(plan).toContainText("Search centre: Shackleton vicinity");
  await plan.getByLabel("Search window").selectOption("custom");
  await plan.getByLabel("Search end date (UTC)").fill("2028-12-01");
  await plan.getByLabel("Alternate UTC touchdown time").fill("12:30");
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await expect(plan.getByRole("heading", { name: /Choose (dates|locations|options) to compare/ })).toBeVisible();
  expect(candidates.slice(2).every((mission) => Date.parse(mission.start) > Date.parse(start) && mission.start.includes("T12:30:00"))).toBeTruthy();
  expect(candidates.some((mission) => mission.start.startsWith("2028-12-01"))).toBeTruthy();
  expect(candidates.some((mission) => mission.name === "Far")).toBeFalsy();
  expectMissionSettings(candidates);
  const original = page.getByRole("article", { name: /Pre-result 1:/ });
  const originalBox = await original.boundingBox();
  const planBox = await plan.boundingBox();
  expect(planBox!.x).toBeGreaterThanOrEqual(originalBox!.x + originalBox!.width);
  expect(planBox!.y).toBeCloseTo(originalBox!.y, 0);
  await page.setViewportSize({ width: 320, height: 850 });
  await plan.getByRole("button", { name: /^Details for/ }).first().click();
  await expect(plan.getByRole("table").nth(1)).toBeVisible();
  await expect.poll(() => plan.evaluate((card) => card.scrollWidth <= card.clientWidth)).toBe(true);
  const choices = plan.getByRole("checkbox", { name: /^Select / });
  await choices.nth(0).check();
  await choices.nth(1).check();
  await expect(plan.getByText("2 alternatives selected")).toBeVisible();
  await plan.getByRole("button", { name: "Compare selected (3)" }).click();
  const cards = page.getByRole("region", { name: "Comparison cards" });
  await expect(cards.getByRole("article")).toHaveCount(3);
  await page.getByRole("checkbox", { name: "Show differences only" }).check();
  await expect(cards.getByRole("meter", { name: "Water ice potential" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to options" }).click();
  await expect(plan.getByRole("table", { name: "Suggested plans" })).toBeVisible();
  await expect(choices.nth(0)).toBeChecked();
  await expect(choices.nth(1)).toBeChecked();
});

test("nominal terrain candidates get a forecast for the original window", async ({ page }) => {
  const point = { name: "Unverified ridge", latitude: -89.52, longitude: 0 };
  await page.route("**/api/reliability/plan-b-sites", (route) => route.fulfill({
    json: { candidates: [], exploration_candidates: [{ location: point }], searched: 1,
      outside_or_missing: 1, failed_limits: 0, overlap_excluded: 0, passing_terrain_candidates: 0 },
  }));
  const plan = await openCompare(page);
  await plan.getByText("Change location", { exact: true }).click();
  await plan.getByRole("button", { name: "Suggest nearby points" }).click();
  const forecast = plan.getByRole("region", { name: "Suggested comparison options" });
  await expect(forecast).toContainText("Unverified ridge");
  await expect(forecast).toContainText("2026-10-01 00:00:00 UTC");
  await forecast.getByRole("button", { name: /Details for Unverified ridge/ }).click();
  await expect(forecast).toContainText("Footprint and uncertainty evidence is incomplete.");
  await expect(plan.getByText(/No backup passed the checks/)).toBeVisible();
});

test("suggests comparison points around the first selected site when terrain is missing", async ({ page }) => {
  const point = { name: "Nearby comparison point", latitude: -89.52, longitude: 0 };
  await page.route("**/api/reliability/plan-b-sites", (route) => {
    expect(route.request().postDataJSON().mission).toMatchObject({ latitude: -89.54, longitude: 0 });
    return route.fulfill({
      json: { candidates: [], comparison_candidates: [{ location: point, distance_m: 606 }],
        searched: 48, outside_or_missing: 48, failed_limits: 0, overlap_excluded: 0, passing_terrain_candidates: 0 },
    });
  });
  const plan = await openCompare(page);
  await plan.getByText("Change location", { exact: true }).click();
  await expect(plan.getByLabel("Reference point")).toHaveCount(0);
  await plan.getByText("Custom coordinates and terrain suggestions", { exact: true }).click();
  await plan.getByRole("button", { name: "Suggest points within 20 km" }).click();
  const suggested = plan.getByRole("region", { name: "Nearby comparison points" });
  await expect(suggested).toContainText("Terrain evidence is incomplete");
  await suggested.getByRole("button", { name: "Add for comparison" }).click();
  const added = page.getByRole("article", { name: "Pre-result 2: Nearby comparison point" });
  await expect(added).toBeVisible();
  await suggested.getByRole("button", { name: "Remove from Compare" }).click();
  await expect(added).toHaveCount(0);
});

test("missing evidence blocks recommendations, and cancellation marks a search incomplete", async ({ page }) => {
  await page.route("**/api/research/plan-b", (route) => route.fulfill({
    json: { status: "missing", reasons: ["Mapped hazard fraction is unavailable."] },
  }));
  const plan = await openCompare(page);
  await plan.getByLabel("Search window").selectOption("year");
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await expect(plan.getByText(/No backup passed the checks/)).toBeVisible();
  await expect(plan.getByRole("status")).toContainText("1 option evaluated");
  const forecasts = plan.getByRole("region", { name: "Suggested comparison options" });
  await expect(forecasts).toContainText("2026-10-02");
  await expect(forecasts).toContainText("2027-10-01");
  await forecasts.getByRole("button", { name: /Details for.*2026-10-02/ }).click();
  await expect(forecasts).toContainText("Estimated solar energy");
  await expect(plan).toContainText("1 lacked required evidence");
  await expect(plan.getByText("Assessment notes")).toBeVisible();
  await expect(plan).toContainText("Mapped hazard fraction is unavailable.");
  await forecasts.getByRole("checkbox", { name: /Select.*2026-10-02/ }).check();
  await forecasts.getByRole("button", { name: "Compare selected (2)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compare selected plans" })).toBeVisible();
  const pinned = page.getByRole("article", { name: /Pre-result 2:/ });
  await expect(pinned).toContainText("WHAT IF FORECAST");
  await expect(pinned).toContainText("0.0 / 100 · 5% nominal weight");
  await expect(pinned).toContainText("2026-10-02 00:00:00 UTC");
  await expect(page.locator(".pre-result-grid > article").last()).toHaveAttribute("aria-label", "What IF");
  await expect(page.getByRole("article", { name: /Pre-result 1:/ })).toContainText("2026-10-01 00:00:00 UTC");
  await expect(pinned.getByRole("button", { name: "Remove from Compare" })).toBeVisible();
  const table = page.getByRole("table", { name: "Side-by-side research comparison" });
  await expect(table.getByRole("columnheader", { name: /Shackleton vicinity · 2026-10-02/ })).toBeVisible();
  await expect(table.getByRole("row", { name: "Assessment status" })).toContainText("What IF forecast");
  const inspect = page.getByLabel("Site to inspect");
  await inspect.selectOption({ label: "Shackleton vicinity · 2026-10-02 00:00:00 UTC" });
  await expect(page.getByRole("heading", { name: "Mission evidence · Shackleton vicinity · 2026-10-02 00:00:00 UTC" })).toBeVisible();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export research JSON" }).click();
  const exported = JSON.parse(await readFile(await (await jsonDownload).path(), "utf8"));
  expect(exported.sites).toHaveLength(2);
  expect(exported.sites.map(({ mission }: { mission: Mission }) => Date.parse(mission.start))).toEqual([
    Date.parse(start), Date.parse("2026-10-02T00:00:00Z"),
  ]);
  expect(exported.sites[1].what_if.reasons).toContain("Mapped hazard fraction is unavailable.");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison CSV" }).click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  expect(csv).toContain('"Touchdown (UTC)","2026-10-01 00:00:00 UTC","2026-10-02 00:00:00 UTC"');
  expect(csv).toContain("Mapped hazard fraction is unavailable.");
  await pinned.getByRole("button", { name: "Remove from Compare" }).click();
  await page.getByRole("button", { name: "Back to options", exact: true }).click();
  await expect(forecasts.getByRole("checkbox", { name: /Select.*2026-10-02/ })).not.toBeChecked();
  await expect(pinned).toHaveCount(0);
  await expect(table.getByRole("columnheader")).toHaveCount(2);
  await page.unroute("**/api/research/plan-b");
  await page.route("**/api/research/plan-b", () => {});
  await plan.getByRole("button", { name: "Edit search" }).click();
  await plan.getByLabel("Alternate UTC touchdown time").fill("18:00");
  const request = page.waitForRequest("**/api/research/plan-b");
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await request;
  await plan.getByRole("button", { name: "Cancel search" }).click();
  await expect(plan.getByRole("status")).toContainText("Search incomplete · cancelled");
});
