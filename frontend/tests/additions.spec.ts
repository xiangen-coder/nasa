import { test, expect } from "@playwright/test";
const newsFixture = {
  status: "live",
  fetched_at: "2026-10-30T00:00:00Z",
  message: "Test-only NASA RSS fixture",
  articles: [
    {
      title: "Lunar exploration test story",
      summary: "This is a deterministic test excerpt, not a live headline.",
      source: "NASA",
      published_at: "2026-10-29T12:00:00Z",
      url: "https://www.nasa.gov/test-lunar-story/",
    },
  ],
};
const nav = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("menuitem", { name: new RegExp(name) });

test("news sidebar displays source, date, excerpt and external article link", async ({
  page,
}) => {
  await page.route("**/api/news", (route) =>
    route.fulfill({ json: newsFixture }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "Lunar exploration news" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Lunar Dispatch", exact: true })
    .click();
  const sidebar = page.getByRole("complementary", {
    name: "Lunar exploration news",
  });
  await expect(
    sidebar.getByText("Lunar exploration test story", { exact: true }),
  ).toBeVisible();
  await sidebar.getByRole("button", { name: "Read summary →" }).click();
  await expect(
    sidebar.getByRole("region", { name: "Article summary" }),
  ).toContainText(newsFixture.articles[0].summary);
  await expect(
    sidebar.getByRole("link", { name: "Read full story at NASA" }),
  ).toHaveAttribute("href", newsFixture.articles[0].url);
  await sidebar.getByRole("button", { name: "Close article summary" }).click();
  await expect(
    sidebar.getByRole("region", { name: "Article summary" }),
  ).toHaveCount(0);
});

test("unavailable and stale news are explicitly labeled", async ({ page }) => {
  await page.route("**/api/news", (route) =>
    route.fulfill({
      json: {
        status: "unavailable",
        articles: [],
        fetched_at: null,
        message: "Feed unavailable. No substitute headlines.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Lunar Dispatch", exact: true })
    .click();
  const side = page.getByRole("complementary", {
    name: "Lunar exploration news",
  });
  await expect(side).toContainText("No substitute headlines");
  await page.unroute("**/api/news");
  await page.route("**/api/news", (route) =>
    route.fulfill({ json: { ...newsFixture, status: "stale" } }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Open Lunar Dispatch", exact: true })
    .click();
  await expect(side).toContainText("Cached headlines");
  await expect(side).toContainText("STALE");
});

test("observatory opens Lunar Journey and keeps the NASA simulation available", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(nav(page, "Map explorer")).toHaveCount(0);
  await expect(nav(page, "Mission planner")).toBeVisible();
  await expect(nav(page, "Lunar surface route")).toHaveCount(0);
  const modelAssets = ["earth.glb", "sun.glb", "moon-texture.jpg"].map((asset) =>
    page.waitForResponse((response) => response.url().endsWith("/models/" + asset)),
  );
  await nav(page, "3D observatory").click();
  await expect(page.getByRole("button", { name: "Lunar Journey", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  const journey = page.locator("lunar-journey");
  await expect(journey.getByRole("heading", { name: "Earth to your lunar landing point" })).toBeVisible();
  await expect(journey.getByText("Shackleton vicinity", { exact: true })).toBeVisible();
  for (const response of await Promise.all(modelAssets)) expect(response.ok()).toBe(true);
  const timeline = journey.getByRole("slider", { name: "Educational journey progress" });
  await journey.getByRole("button", { name: "Play educational journey" }).click();
  await expect(timeline).not.toHaveValue("0");
  await journey.getByRole("button", { name: "Pause educational journey" }).click();
  await timeline.fill("700");
  await expect(timeline).toHaveValue("700");
  await journey.getByRole("button", { name: "Restart journey" }).click();
  await expect(timeline).toHaveValue("0");
  await page.getByRole("button", { name: "Sun–Earth–Moon simulation", exact: true }).click();
  await expect(page.getByLabel("Astronomy date", { exact: true })).toBeVisible();
  await expect(journey).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mission archive uses the site palette and keeps its trajectory controls", async ({ page }) => {
  await page.goto("/#mission-archive");
  const archive = page.frameLocator('iframe[title="Lunar mission archive and interactive 3D paths"]');
  await expect(archive.locator("body")).toHaveCSS("background-color", "rgb(7, 18, 37)");
  await expect(archive.getByRole("heading", { name: "Follow the path beyond Earth." })).toBeVisible();
  await expect(archive.locator("#trajectory-name")).toHaveText("Apollo 11", { timeout: 15000 });
  const camera = archive.getByRole("button", { name: "Moon", exact: true });
  await camera.click();
  await expect(camera).toHaveAttribute("aria-pressed", "true");
});
