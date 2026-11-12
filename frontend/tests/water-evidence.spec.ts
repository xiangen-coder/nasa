import { expect, test } from "@playwright/test";

test("selects the exact south pole without showing water evidence on Configure", async ({ page }) => {
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
  await expect(page.getByText("Water/Ice Evidence", { exact: true })).toHaveCount(0);
});
