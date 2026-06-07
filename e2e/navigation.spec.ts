import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * navigation.spec.ts — nav section switching tests.
 *
 * After loading the fixture, verifies that clicking each nav item changes the
 * active section heading shown in the main content area.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.srsj");

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Wait for loaded state — use the nav link as the signal
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("Articles is the default active section", async ({ page }) => {
    // The section heading h2 should say "Articles"
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible();
  });

  test("clicking Decision Log shows Decision Log section heading", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();
  });

  test("clicking Roles shows Roles section heading", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await expect(page.getByRole("heading", { name: "Roles", level: 2 })).toBeVisible();
  });

  test("clicking Exercise Book shows Exercise Book section heading", async ({ page }) => {
    await page.getByRole("link", { name: /Exercise Book/ }).click();
    await expect(page.getByRole("heading", { name: "Exercise Book", level: 2 })).toBeVisible();
  });

  test("clicking Articles after another section returns to Articles heading", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();

    await page.getByRole("link", { name: /Articles/ }).click();
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible();
  });
});
