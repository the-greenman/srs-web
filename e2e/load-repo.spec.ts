import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openPackageEditor, navItem } from "./helpers.js";

/**
 * load-repo.spec.ts — file upload and loaded-state tests.
 *
 * Uploads the gallery.srsj fixture via the file input and verifies the app
 * transitions to the three-pane loaded state, showing all nav sections. Uses
 * gallery.srsj (not sample.srsj): every test past the first switches into the
 * GovernanceShell nav, which requires a fixture that installs the decision
 * type (srs-web#322) — sample.srsj does not.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Load repository", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  });

  test("transitions to loaded state after uploading a .srsj file", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Idle picker should disappear
    await expect(page.getByTestId("generic-file-picker")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("shows Articles nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);
    await openPackageEditor(page, "governance");

    await expect(navItem(page, /Articles/)).toBeVisible({ timeout: 5000 });
  });

  test("shows Decision Log nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);
    await openPackageEditor(page, "governance");

    await expect(navItem(page, /Decision Log/)).toBeVisible({ timeout: 5000 });
  });

  test("shows Roles nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);
    await openPackageEditor(page, "governance");

    await expect(navItem(page, /Roles/)).toBeVisible({ timeout: 5000 });
  });

  test("shows Exercises nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);
    await openPackageEditor(page, "governance");

    await expect(navItem(page, /Exercises/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows the repo filename in the toolbar after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);
    await openPackageEditor(page, "governance");

    // Filename without extension is shown as the document title in the toolbar
    await expect(page.locator(".toolbar__title")).toContainText("gallery", { timeout: 5000 });
  });
});
