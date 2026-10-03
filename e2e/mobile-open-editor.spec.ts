import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test } from "@playwright/test";

const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

// defaultBrowserType can't be set per-describe
const { defaultBrowserType: _ignored, ...phone } = devices["iPhone 13"];
test.use(phone);

test("srs-web#381: the essay editor opens from the main column on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  const choice = page.getByTestId("package-editor-mobile-essay");
  await expect(choice).toBeVisible();
  await choice.tap();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
});
