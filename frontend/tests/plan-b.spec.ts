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
    warnings: [], limitations: [
      "Research ranking only; never a NASA landing certification or a safe-site recommendation.",
      "Visibility is not a power model. Finite body disks and eclipses are excluded.",
      "Sampling uses left endpoints. Before 1962 Horizons UT is UT1; future leap seconds are unknown.",
      "DEM and observation frame alignment must be checked. Finite horizon rays exclude distant and subpixel obstruction.",
    ], terrain: { available: true, resolution_m: 5, radius_m: 100, grid: [],
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

async function openCompare(page: Page, withAlternatives = false) {
  await page.route("**/api/research/datasets", (route) => route.fulfill({
    json: { datasets: [], reference_points: [], regions: [] },
  }));
  await page.route("**/api/research/evaluate", async (route) => {
    const { mission } = route.request().postDataJSON();
    await route.fulfill({ json: evidence(mission, 70, true) });
  });
  await page.route("**/api/research/research-area", async (route) => {
    const { mission, radius_m } = route.request().postDataJSON();
    expect(radius_m).toBe(5000);
    await route.fulfill({ json: {
      results: withAlternatives ? [
        evidence({ ...mission, name: "Recommended ridge", latitude: mission.latitude + 0.14 }),
        ...[75, 70, 65, 60].map((score, index) =>
          evidence({ ...mission, name: `Ranked ridge ${index + 2}`, latitude: mission.latitude - 0.02 * (index + 1) }, score)),

      ] : [evidence(mission, 70, true)], recommended: true, sampled: 17,
      counts: { evaluated: 1, limits: 0, missing: 16, unavailable: 0, focus_missing: 0 }, reasons: [],
    } });
  });
  await page.goto("/#search", { waitUntil: "domcontentloaded" });
  const configure = page.locator("#landing-search-form");
  await configure.getByLabel("Start date", { exact: true }).fill(start.slice(0, 10));
  await configure.getByLabel("End date", { exact: true }).fill(end.slice(0, 10));
  await configure.getByLabel("Search radius (km)").fill("5");
  await expect(configure.getByText(/cyan ring marks the 5 km search radius/)).toBeVisible();
  await configure.getByRole("button", { name: "Find landing point", exact: true }).click();
  await expect(page.locator(".research-centre-summary")).toContainText("5 km");
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
  await page.getByRole("article", { name: /Recommended landing point:/ }).getByRole("button", { name: "More details" }).click();
  await page.evaluate(() => {
    window.print = () => {
      const report = document.querySelector(".assessment-print-report");
      if (report?.querySelector("#research-report-title")?.textContent === "Landing site assessment report" &&
          report.querySelectorAll("details:not([open])").length === 0) {
        document.body.setAttribute("data-test-print", "called");
      }
    };
  });
  await page.getByRole("button", { name: "Save as PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-test-print", "called");
  const summary = page.locator("#result-summary");
  await expect(summary).toContainText("70.00 / 100");
  await expect(summary).toContainText("80% of nominal weight");
  await expect(summary).toContainText("Missing Temperature");
  await expect(summary).toContainText("12.0 h of sunlight");
  await expect(page.getByRole("region", { name: "NASA landing research" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open map for research thresholds/ })).toHaveCount(0);
  const factors = page.locator("#result-score").getByRole("table", { name: "Research score factors" });
  await expect(factors.getByRole("row", { name: /Water ice evidence/ })).toContainText("5.0%");
  const limitations = page.locator(".result-limitation-grid");
  await expect(limitations.locator("article").nth(1)).toContainText("eclipses are excluded");
  await expect(limitations.locator("article").nth(2)).toContainText("UT1");
  await expect(limitations.locator("article").nth(3)).toContainText("subpixel obstruction");
  const navigation = page.getByRole("navigation", { name: "Results sections" });
  await navigation.getByRole("link", { name: "Score calculation" }).click();
  await expect(navigation.getByRole("link", { name: "Score calculation" })).toHaveAttribute("aria-current", "location");
  const details = factors.getByText("View details", { exact: true }).first();
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(factors.locator("details[open] p")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 850 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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

test("delay search samples then refines, ranks by score and preserves the original", async ({ page }) => {
  const candidates: Mission[] = [];
  await page.route("**/api/research/plan-b", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.limits).toEqual(limits);
    candidates.push(body.mission);
    await route.fulfill({ json: { status: "evaluated", result: evidence(body.mission, candidates.length) } });
  });
  const plan = await openCompare(page);
  const original = page.getByRole("article", { name: /Recommended landing point:/ });
  const criteria = original.getByRole("region", { name: "Criteria at a glance" });
  await expect(criteria.getByRole("meter", { name: "Water ice potential" })).toHaveCount(0);
  await expect(criteria.getByRole("meter", { name: "Temperature" })).toHaveCount(0);
  await original.getByText("Environment & limits", { exact: true }).click();
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
  await plan.getByRole("button", { name: /^Details for/ }).first().click();
  expect(await original.innerText()).toBe(originalText);
  await page.setViewportSize({ width: 390, height: 850 });
  await plan.scrollIntoViewIfNeeded();
  const mobile = await plan.boundingBox();
  expect(mobile!.x).toBeGreaterThanOrEqual(0);
  expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
});

test("location and combined searches keep the baseline and enforce the selected radius", async ({ page }) => {
  const candidates: Mission[] = [];
  const longName = "Near B · " + "SouthPolarRidge".repeat(8);
  await page.route("**/api/reliability/plan-b-sites", async (route) => {
    const { mission, search_radius_m } = route.request().postDataJSON();
    expect(search_radius_m).toBe(5000);
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
  await expect(plan).toContainText("The original search returned no other locations");
  expect(candidates).toHaveLength(0);
  await plan.getByText("Change both", { exact: true }).click();
  await expect(plan.getByText("Choose alternative sites")).toBeHidden();
  await expect(plan).toContainText("Research centre: Shackleton vicinity");
  await plan.getByLabel("Search window").selectOption("custom");
  await plan.getByLabel("Search end date (UTC)").fill("2028-12-01");
  await plan.getByLabel("Alternate UTC touchdown time").fill("12:30");
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await expect(plan.getByRole("heading", { name: /Choose (dates|locations|options) to compare/ })).toBeVisible();
  expect(candidates.every((mission) => Date.parse(mission.start) > Date.parse(start) && mission.start.includes("T12:30:00"))).toBeTruthy();
  expect(candidates.some((mission) => mission.start.startsWith("2028-12-01"))).toBeTruthy();
  expect(candidates.some((mission) => mission.name === "Far")).toBeFalsy();
  expectMissionSettings(candidates);
  const original = page.getByRole("article", { name: /Recommended landing point:/ });
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
  await expect(original).toBeVisible();
  await expect(page.locator(".research-centre-summary")).toContainText("5 km");
  await page.getByRole("checkbox", { name: "Show differences only" }).check();
  await expect(cards.getByRole("meter", { name: "Water ice potential" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to options" }).click();
  await expect(plan.getByRole("table", { name: "Suggested plans" })).toBeVisible();
  await expect(choices.nth(0)).toBeChecked();
  await expect(choices.nth(1)).toBeChecked();
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
  await plan.getByRole("button", { name: "Suggest points within 5 km" }).click();
  const suggested = plan.getByRole("region", { name: "Nearby comparison points" });
  await expect(suggested).toContainText("Terrain evidence is incomplete");
  await suggested.getByRole("button", { name: "Add for comparison" }).click();
  const added = page.getByRole("article", { name: "Alternative 1: Nearby comparison point" });
  await expect(added).toBeVisible();
  await suggested.getByRole("button", { name: "Remove from Compare" }).click();
  await expect(added).toHaveCount(0);
});

test("missing scores and cancelled searches remain visible", async ({ page }) => {
  await page.route("**/api/research/plan-b", route => route.fulfill({
    json: { status: "unavailable", reasons: ["Visibility is unavailable."] },
  }));
  const plan = await openCompare(page);
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await expect(plan.getByText("No landing-point scores were available for this search.")).toBeVisible();
  await expect(plan.getByText("Search incomplete", { exact: false })).toBeVisible();
  await page.unroute("**/api/research/plan-b");
  await page.route("**/api/research/plan-b", () => {});
  await plan.getByRole("button", { name: "Edit search" }).click();
  const request = page.waitForRequest("**/api/research/plan-b");
  await plan.getByRole("button", { name: "Run What IF" }).click();
  await request;
  await plan.getByRole("button", { name: "Cancel search" }).click();
  await expect(plan.getByRole("status")).toContainText("Search incomplete · cancelled");
});

test("saved mission opens its completed result without a new analysis", async ({ page }) => {
  let saved: { payload: unknown; snapshot: unknown } | undefined;
  let saves = 0;
  let analysisCount = 0;
  await page.route("**/api/account", (route) => route.fulfill({ json: {
    configured: true, user: { id: "fixture", username: "Xiang En", email: "test@example.com" },
  } }));
  await page.route(/\/api\/account\/history(?:\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      saves++;
      saved = route.request().postDataJSON();

      return route.fulfill({ status: 201, json: { id: "fixture" } });
    }
    if (new URL(route.request().url()).searchParams.has("id"))
      return route.fulfill({ json: { record: saved?.payload, snapshot: saved?.snapshot } });
    return route.fulfill({ json: { records: saved ? [{
      id: "fixture", name: "Stored mission", payload: saved.payload, has_snapshot: true, created_at: start,
    }] : [] } });
  });
  await openCompare(page);
  await page.getByRole("article", { name: /Recommended landing point:/ }).getByRole("button", { name: "More details" }).click();
  await page.route("**/api/research/evaluate", (route) => {
    analysisCount++;
    const { mission } = route.request().postDataJSON();
    return route.fulfill({ json: evidence(mission, 85) });
  });
  await page.locator("#result-save").getByRole("button", { name: "Save mission" }).click();
  await expect.poll(() => saved?.snapshot).toMatchObject({ version: 1, assessment: { score: 70 }, equipment: { area_m2: 4 } });
  await expect(page.getByText("Mission saved to your account.")).toBeVisible();
  await expect(page).toHaveURL(/#result$/);
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "Go to saved searches" }).click();
  await expect(page).toHaveURL(/#account$/);
  await page.getByRole("button", { name: "Open result" }).click();
  await expect(page).toHaveURL(/#result$/);
  await expect(page.locator("#result-summary")).toContainText("70.00 / 100");
  await expect(page.locator("#result-visibility").getByRole("img", { name: /Sun and Earth elevations/ })).toBeVisible();
  expect(analysisCount).toBe(0);
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(page.locator("#result-summary")).toContainText("85.00 / 100");
  expect(analysisCount).toBe(1);
});

test("Change location reveals the initial ranked list two at a time", async ({ page }) => {
  const extraRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(reliability\/plan-b-sites|research\/plan-b)$/.test(request.url()))
      extraRequests.push(request.url());
  });
  const plan = await openCompare(page, true);
  await expect(page.getByText(/We sample the centre and 8 evenly spaced points per ring/)).toBeVisible();
  await plan.getByRole("radio", { name: "Change location" }).check();
  const rows = plan.getByRole("table", { name: "Suggested plans" }).getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("#1 · Recommended ridge");
  await expect(rows.nth(2)).toContainText("#2 · Ranked ridge 2");
  await expect(rows.nth(3)).toContainText("#3 · Ranked ridge 3");

  await plan.getByRole("button", { name: "Search more locations" }).click();
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(4)).toContainText("#4 · Ranked ridge 4");
  await expect(rows.nth(5)).toContainText("#5 · Ranked ridge 5");
  await expect(plan.getByRole("button", { name: "Search more locations" })).toHaveCount(0);
  const choices = plan.getByRole("checkbox", { name: /^Select / });
  await choices.nth(0).check();
  await choices.nth(3).check();
  await expect(choices.nth(1)).toBeDisabled();
  await expect(plan.getByRole("button", { name: "Compare selected (3)" })).toBeEnabled();
  expect(extraRequests).toEqual([]);
});


test("retired map explorer bookmarks open Configure", async ({ page }) => {
  await page.goto("/#map-explorer");
  await expect(page).toHaveURL(/#search$/);
  await expect(page.getByRole("button", { name: "Find landing point", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find your next horizon." })).toHaveCount(0);
});

test("Mission Lab imports the Result and models a battery change", async ({ page }) => {
  test.setTimeout(90000);
  await openCompare(page);
  await page.route("**/api/research/research-area", async (route) => {
    const { mission } = route.request().postDataJSON();
    const result = evidence(mission, 70, true);
    result.geometry.series = Array.from({ length: 25 }, (_, hour) => ({
      ...result.geometry.series[0],
      time: new Date(Date.parse(mission.start) + hour * 3600000).toISOString(),
    }));
    await route.fulfill({ json: { results: [result], recommended: true, sampled: 1, reasons: [],
      counts: { evaluated: 1, limits: 0, missing: 0, unavailable: 0, focus_missing: 0 } } });
  });
  await page.getByRole("button", { name: "Back to Search", exact: true }).first().click();
  await page.getByRole("button", { name: "Find landing point", exact: true }).click();
  await page.getByRole("article", { name: /Recommended landing point:/ }).getByRole("button", { name: "More details" }).click();
  let analysisRequests = 0;
  page.on("request", (request) => {
    if (/\/api\/research\/(evaluate|research-area)$/.test(request.url())) analysisRequests++;
  });
  await page.getByRole("button", { name: "Open in Mission Lab" }).click();
  await expect(page.getByText("Imported from your Result")).toBeVisible();
  await page.getByRole("button", { name: "Run power simulation" }).click();
  await expect(page.getByRole("region", { name: "Mission Lab" }).getByRole("alert")).toContainText("Effective incident irradiance");
  await page.getByRole("spinbutton", { name: "Effective incident irradiance" }).fill("1000");
  await page.getByRole("button", { name: "Run power simulation" }).click();
  await expect(page.getByText("Generated energy · 9.07 kWh")).toBeVisible();
  await page.getByLabel("Variant (kWh)").fill("3");
  await page.getByRole("button", { name: "Test change" }).click();
  await expect(page.getByRole("rowheader", { name: "Variant" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved on this device.")).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  const download = await downloadEvent;
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.simulation.generated).toBeCloseTo(9.072);
  expect(report.variant.power.battery).toBe("3");
  await page.getByRole("button", { name: "Back to Result" }).click();
  await expect(page.locator("#result-summary")).toBeVisible();
  expect(analysisRequests).toBe(0);
});
