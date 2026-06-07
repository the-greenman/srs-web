import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * validation.spec.ts — inspector/validation panel tests.
 *
 * After loading the fixture, verifies the Validation inspector section is
 * visible and reports the expected state (no errors for an empty repo).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.srsj");

test.describe("Validation inspector", () => {
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

  test("shows Validation inspector section after loading", async ({ page }) => {
    // InspectorSection renders title in .inspector__title
    await expect(page.locator(".inspector__title").filter({ hasText: "Validation" })).toBeVisible();
  });

  test("shows clean status for an empty valid repo", async ({ page }) => {
    // validationAside = "clean" when errorCount === 0; shown in .inspector__title-aside
    await expect(
      page.locator(".inspector__title-aside").filter({ hasText: "clean" })
    ).toBeVisible();
  });

  test("shows Repository inspector section", async ({ page }) => {
    await expect(page.locator(".inspector__title").filter({ hasText: "Repository" })).toBeVisible();
  });

  test("shows record count in inspector", async ({ page }) => {
    // Empty repo — inspector Repository aside shows "0" (String(instanceCount))
    // and the inspector kv rows show the "Records" label
    await expect(
      page.locator(".inspector__section").filter({ hasText: "Repository" })
    ).toContainText("Records");
  });
});
