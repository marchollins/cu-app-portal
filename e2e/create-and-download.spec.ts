import { expect, test } from "@playwright/test";

test("authenticated user can create an app package", async ({ page }) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: /create new app/i }),
  ).toBeVisible();

  await page.getByRole("link", { name: /use web app starter/i }).click();
  await page.getByLabel("App Name").fill("Campus Dashboard");
  await page
    .getByLabel("Short Description")
    .fill("Shows campus metrics.");
  await page.getByLabel("Hosting Target").selectOption("Vercel");
  await page.getByRole("button", { name: /generate app package/i }).click();

  await expect(
    page.getByRole("heading", { name: /your app package is ready/i }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /download zip/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("campus-dashboard.zip");
});
