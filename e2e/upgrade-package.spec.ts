import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openNavDrawer } from "./helpers";

/**
 * srs-web#450: an editor whose package is outdated is upgraded from the pinned bundle. The fixture
 * repo has essay 1.2.0 installed (the registry requires 1.3.0, so it is `version-too-low`); the
 * pinned bundle is 1.5.0. The core plans the upgrade (dry run) and applies it.
 */
const OUTDATED = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "essay-outdated.srsj"
);

test("an outdated essay package is upgraded from its pinned bundle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(OUTDATED);
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  await openNavDrawer(page);
  await page.getByTestId("package-editor-essay-upgrade").click();
  const modal = page.getByTestId("upgrade-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Upgrade essay 1.2.0 → 1.5.0");
  await expect(modal.getByTestId("upgrade-counts")).toContainText("added");
  await page.screenshot({ path: process.env.SHOT_UPGRADE ?? "test-results/upgrade-modal.png" });

  // the plan is a dry run: cancelling leaves the document untouched
  await page.getByTestId("upgrade-cancel").click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  await page.getByTestId("package-editor-essay-upgrade").click();
  await page.getByTestId("upgrade-apply").click();
  await expect(page.getByRole("button", { name: "New essay" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  await expect(page.getByTestId("document-dirty-status")).toContainText("Unsaved changes");
});
