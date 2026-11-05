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
  page.getByRole("navigation").getByRole("button", { name, exact: true });

test("news sidebar displays source, date, excerpt and external article link", async ({
  page,
}) => {
  await page.route("**/api/news", (route) =>
    route.fulfill({ json: newsFixture }),
  );
  await page.goto("/");
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
  const side = page.getByRole("complementary", {
    name: "Lunar exploration news",
  });
  await expect(side).toContainText("No substitute headlines");
  await page.unroute("**/api/news");
  await page.route("**/api/news", (route) =>
    route.fulfill({ json: { ...newsFixture, status: "stale" } }),
  );
  await page.reload();
  await expect(side).toContainText("Cached headlines");
  await expect(side).toContainText("STALE");
});

test("uploaded models load, local import works, and sky follows computed samples", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/news", (route) =>
    route.fulfill({ json: newsFixture }),
  );
  await page.goto("/");
  await nav(page, "3D observatory").click();
  await page.getByRole("button", { name: "Reference models & local sky", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "3D model status" }),
  ).toContainText("Reference Moon");
  await expect(
    page.getByText("South pole · 90° S", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Earth", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "3D model status" }),
  ).toHaveText("Uploaded Earth model loaded", { timeout: 20000 });
  await page.getByRole("button", { name: "Sun", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "3D model status" }),
  ).toHaveText("Uploaded Sun model loaded", { timeout: 20000 });
  await page.getByRole("button", { name: "Moon", exact: true }).click();
  await page
    .getByLabel("Import local Moon model")
    .setInputFiles("public/models/earth.glb");
  await expect(
    page.getByRole("status", { name: "3D model status" }),
  ).toContainText("Local lunar model · orientation unverified");
  await page
    .getByRole("button", { name: "Computed local sky", exact: true })
    .click();
  await expect(
    page.getByText("No directions are invented.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze site", exact: true }).click();
  await expect(
    page.getByText("Computed sample:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("slider", { name: "3D simulation time" }).fill("40");
  await expect(
    page.getByText("Computed sample:", { exact: false }),
  ).toContainText("02 Oct");
  await page.screenshot({
    path: "test-results/observatory.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});


test("observatory combines system simulation and models; removed tools are absent", async ({page}) => {
  await page.goto("/");
  await expect(nav(page,"Mission planner")).toHaveCount(0);
  await expect(nav(page,"Lunar surface route")).toHaveCount(0);
  await expect(nav(page,"Sun–Earth–Moon")).toHaveCount(0);
  await nav(page,"3D observatory").click();
  await expect(page.getByRole("heading",{name:"Sun–Earth–Moon simulation",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Reference models & local sky",exact:true}).click();
  await expect(page.getByRole("button",{name:"Computed local sky",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Sun–Earth–Moon simulation",exact:true}).click();
  await expect(page.getByLabel("Astronomy date",{exact:true})).toBeVisible();
});
