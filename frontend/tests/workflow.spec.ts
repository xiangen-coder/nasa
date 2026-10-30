import { test, expect } from "@playwright/test";

test("real API → simulator → comparison → report and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".system-state")).toContainText("SPICE online");
  await expect(
    page.getByRole("heading", { name: "Find your next horizon." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze site", exact: true }).click();
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Simultaneous visibility" })
      .locator("strong"),
  ).toHaveText("88.1%");
  await page
    .getByRole("button", { name: "Horizon simulator", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Sun and Earth elevation against azimuth and terrain horizon",
    }),
  ).toBeVisible();
  const slider = page.getByRole("slider", { name: "Simulation time" });
  await slider.fill("50");
  await expect(slider).toHaveValue("50");
  await page.getByRole("button", { name: "Play animation" }).click();
  await expect.poll(() => slider.inputValue()).not.toBe("50");
  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(
    page.getByText("Terrain obstruction: unknown", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Terrain analysis", exact: true })
    .click();
  await expect(
    page.getByText("No LOLA raster configured.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Site comparison", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare sites", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page
    .getByRole("slider", { name: "sunlight weight", exact: true })
    .fill("5");
  await expect(page.getByRole("table")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Compare sites", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mission report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Data, assumptions & limitations" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "lunar-analysis.json",
  );
  await page.screenshot({
    path: "test-results/mission-report.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("coordinate and date edits invalidate results; API errors remain visible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Analyze site", exact: true }).click();
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Simultaneous visibility" })
      .locator("strong"),
  ).toHaveText("88.1%");
  await page
    .getByRole("spinbutton", { name: "Latitude", exact: true })
    .fill("-88");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Simultaneous visibility" })
      .locator("strong"),
  ).toHaveCount(0);
  await page.getByLabel("End date", { exact: true }).fill("2027-01-01");
  await page.getByRole("button", { name: "Analyze site", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "at most 31 days" }),
  ).toContainText("at most 31 days");
});

test("precomputed real-data example works with backend unavailable", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load a verified precomputed example" })
    .click();
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Simultaneous visibility" })
      .locator("strong"),
  ).toHaveText("88.1%");
  await expect(
    page.getByRole("status").filter({ hasText: "Precomputed NASA/JPL DE421" }),
  ).toContainText("Precomputed NASA/JPL DE421");
});

test("mobile map selection, navigation, and layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: "Select de Gerlache vicinity",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select de Gerlache vicinity", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("spinbutton", { name: "Latitude", exact: true }),
  ).toHaveValue("-88.48");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset map", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-explorer.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mission report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your mission, documented." }),
  ).toBeVisible();
});

test("all three reference sites have distinct offline NASA-derived examples", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  for (const [name, expected] of [
    ["Shackleton vicinity", "88.1%"],
    ["de Gerlache vicinity", "83.3%"],
    ["South pole ridge reference", "89.9%"],
  ]) {
    await page
      .getByRole("button", { name: `Select ${name}`, exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Load a verified precomputed example" })
      .click();
    await expect(
      page
        .locator(".metric")
        .filter({ hasText: "Simultaneous visibility" })
        .locator("strong"),
    ).toHaveText(expected);
  }
});
