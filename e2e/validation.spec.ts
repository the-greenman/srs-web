import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openPackageEditor } from "./helpers.js";

/**
 * validation.spec.ts — inspector/validation panel tests.
 *
 * After loading the fixture, verifies the Validation inspector section is
 * visible and reports the expected state (no errors). The Validation/Repository
 * inspector panels are GovernanceShell UI (InspectorSection), so this needs a
 * fixture that qualifies for the Governance package editor — gallery.srsj installs
 * the decision type; sample.srsj does not (srs-web#322).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Validation inspector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);
    await openPackageEditor(page, "governance");

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
    // and the inspector kv rows show the "Records" label.
    //
    // Scoped by .inspector__title (the section's own heading), not a
    // whole-section hasText match: a broad match on ".inspector__section"
    // also picks up the Validation section once its diagnostics contain the
    // word "repository" (e.g. the dataModelRevision compatibility warning),
    // which produced a strict-mode violation under build.297.
    const repositorySection = page
      .locator(".inspector__section")
      .filter({ has: page.locator(".inspector__title", { hasText: "Repository" }) });
    await expect(repositorySection).toContainText("Records");
  });
});
