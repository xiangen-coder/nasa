import { expect, test } from "@playwright/test";

test("selects the exact south pole and opens its water evidence", async ({ page }) => {
  await page.route("**/api/research/water-evidence?*", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("latitude")).toBe("-90");
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
  await page.goto("/#search", { waitUntil: "domcontentloaded" });
  const atlas = page.frameLocator("iframe[title='Lunar Atlas 3D globe and 2D map']");
  const find = atlas.getByRole("button", { name: "Find south pole" });
  const globe = atlas.getByRole("button", { name: "3D globe" });
  await expect(globe).toBeEnabled();
  await find.click();
  await expect(atlas.locator("#feature-info")).toContainText("90° S");
  await atlas.getByRole("button", { name: "2D map" }).click();
  await expect(atlas.getByRole("heading", { name: "Lunar south pole" })).toBeVisible();
  await atlas.getByRole("button", { name: "Use south pole" }).click();
  await expect(page.locator("#landing-search-form").getByLabel("Latitude", { exact: true })).toHaveValue("-90");
  await page.getByText("Water/Ice Evidence", { exact: true }).click();
  await expect(page.getByText("27.5%", { exact: true })).toBeVisible();
  await page.getByLabel("Local evidence map").selectOption("illumination");
  await expect(page.getByRole("img", { name: /Long-term solar illumination around/ })).toHaveAttribute("src", /map\/illumination/);
});
