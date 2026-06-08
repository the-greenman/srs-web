import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * load-repo.spec.ts — file upload and loaded-state tests.
 *
 * Uploads the sample.srsj fixture via the file input and verifies the app
 * transitions to the three-pane loaded state, showing all nav sections.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.srsj");

test.describe("Load repository", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM boot, then choose governance mode
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("transitions to loaded state after uploading a .srsj file", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Idle heading should disappear
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("shows Articles nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("shows Decision Log nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
  });

  test("shows Roles nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    await expect(page.getByRole("link", { name: /Roles/ })).toBeVisible({ timeout: 5000 });
  });

  test("shows Exercise Book nav item after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    await expect(page.getByRole("link", { name: /Exercise Book/ })).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows the repo filename in the topbar after loading", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Filename without extension is shown as repo name in .topbar__repo span
    await expect(page.locator(".topbar__repo")).toContainText("sample", { timeout: 5000 });
  });
});
