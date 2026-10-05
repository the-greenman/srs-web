import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test } from "@playwright/test";
import { openNavDrawer } from "./helpers.js";

const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

// defaultBrowserType can't be set per-describe
const { defaultBrowserType: _ignored, ...phone } = devices["iPhone 13"];
test.use(phone);

test("srs-web#381: the essay editor opens from the nav drawer on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await openNavDrawer(page); // the one picker lives in the nav, a drawer at phone width
  const choice = page.getByTestId("package-editor-essay");
  await expect(choice).toBeVisible();
  await choice.tap();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
});
