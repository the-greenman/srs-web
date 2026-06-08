import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * editor-mode.spec.ts — explicit editor-mode selection tests (C7).
 *
 * Verifies the mode picker shows on idle, Governance mode leads to the
 * governance shell, and Guides mode leads to the guides shell.
 *
 * Uses the existing sample.srsj fixture for both modes because the guides
 * shell at this stage is a placeholder and works with any .srsj file.
 * muSrs.srsj (C6) will be used for full guides tests in C8+.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FIXTURE = path.join(__dirname, "fixtures", "sample.srsj");

test.describe("Editor mode selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
  });

  test("shows mode picker on idle (not the file picker)", async ({ page }) => {
    await expect(page.getByTestId("mode-picker")).toBeVisible();
    await expect(page.getByTestId("mode-governance")).toBeVisible();
    await expect(page.getByTestId("mode-guides")).toBeVisible();
    // File picker should NOT be visible yet
    await expect(page.locator('input[type="file"]#srsj-file')).not.toBeVisible();
  });

  test("Governance mode shows governance file picker", async ({ page }) => {
    await page.getByTestId("mode-governance").click();

    await expect(page.getByTestId("governance-file-picker")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible();
    await expect(page.locator('input[type="file"]#srsj-file')).toBeAttached();
  });

  test("Guides mode shows guides file picker", async ({ page }) => {
    await page.getByTestId("mode-guides").click();

    await expect(page.getByTestId("guides-file-picker")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "muDemocracy Guides Editor" })
    ).toBeVisible();
    await expect(page.locator('input[type="file"]#srsj-file')).toBeAttached();
  });

  test("Back button from Governance returns to mode picker", async ({ page }) => {
    await page.getByTestId("mode-governance").click();
    await expect(page.getByTestId("governance-file-picker")).toBeVisible();

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByTestId("mode-picker")).toBeVisible();
  });

  test("Back button from Guides returns to mode picker", async ({ page }) => {
    await page.getByTestId("mode-guides").click();
    await expect(page.getByTestId("guides-file-picker")).toBeVisible();

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByTestId("mode-picker")).toBeVisible();
  });

  test("Guides mode: loads .srsj and shows guides shell", async ({ page }) => {
    await page.getByTestId("mode-guides").click();

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(SAMPLE_FIXTURE);

    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("guides-file-picker")).not.toBeVisible();
  });

  test("Governance mode: loads .srsj and shows governance shell (no regression)", async ({
    page,
  }) => {
    await page.getByTestId("mode-governance").click();

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(SAMPLE_FIXTURE);

    // Governance shell should be active — check nav items are visible
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("guides-shell")).not.toBeVisible();
  });

  test("Open another file from guides returns to mode picker", async ({ page }) => {
    await page.getByTestId("mode-guides").click();
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(SAMPLE_FIXTURE);
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Open another file" }).click();
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 3000 });
  });
});
