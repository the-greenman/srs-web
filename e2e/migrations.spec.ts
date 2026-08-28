import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * migrations.spec.ts — Migrations panel apply flow.
 *
 * Uses sample.srsj which has both `migrate-identity` and `repo-upgrade`
 * in `status: needed` state. Verifies the Repository → Migrations panel,
 * the apply flow, and that governance nav is unaffected after apply.
 *
 * sample.srsj is deliberately left without manifest.container.identityInstanceId
 * set so `migrate-identity` has something to report as "needed" — do not
 * "fix" the fixture by migrating it. See navigation.spec.ts's comment for
 * why other specs use gallery.srsj instead of this one.
 *
 * ADR-014: Migrations surface via "Repository" NavGroup in GovernanceShell.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.srsj");

test.describe("Migrations panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Wait for loaded state
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("shows Migrations panel when Repository → Migrations is clicked", async ({ page }) => {
    await page.getByRole("link", { name: /Migrations/ }).click();
    await expect(page.getByRole("heading", { name: "Migrations", level: 2 })).toBeVisible({
      timeout: 5000,
    });
  });

  test("lists migrate-identity and repo-upgrade with Needed badges", async ({ page }) => {
    await page.getByRole("link", { name: /Migrations/ }).click();

    // Both migrations must show the "Needed" badge
    const identityRow = page.locator(".migration-row").filter({
      hasText: "Graduate identity to purpose record",
    });
    const upgradeRow = page.locator(".migration-row").filter({
      hasText: "Normalise instance file paths",
    });

    await expect(identityRow.locator(".migration-badge--needed")).toBeVisible({ timeout: 5000 });
    await expect(upgradeRow.locator(".migration-badge--needed")).toBeVisible({ timeout: 5000 });
  });

  test("applying migrate-identity shows result payload and flips badge to Applied", async ({
    page,
  }) => {
    await page.getByRole("link", { name: /Migrations/ }).click();

    const identityRow = page.locator(".migration-row").filter({
      hasText: "Graduate identity to purpose record",
    });

    // Badge should start as Needed
    await expect(identityRow.locator(".migration-badge--needed")).toBeVisible({ timeout: 5000 });

    // Click Apply
    await identityRow.locator(".migration-row__apply").click();

    // Result payload must appear
    await expect(identityRow.locator(".migration-result--ok")).toBeVisible({ timeout: 5000 });

    // Badge must have flipped to Applied
    await expect(identityRow.locator(".migration-badge--applied")).toBeVisible({ timeout: 5000 });
    await expect(identityRow.locator(".migration-badge--needed")).not.toBeVisible();
  });

  test("governance nav is intact after apply — Articles section still loads", async ({ page }) => {
    await page.getByRole("link", { name: /Migrations/ }).click();

    // Use repo-upgrade (file-rename only) to verify nav regression — migrate-identity
    // replaces the identity record, which changes the nav structure by design.
    const upgradeRow = page.locator(".migration-row").filter({
      hasText: "Normalise instance file paths",
    });
    await expect(upgradeRow.locator(".migration-badge--needed")).toBeVisible({ timeout: 5000 });
    await upgradeRow.locator(".migration-row__apply").click();
    await expect(upgradeRow.locator(".migration-result--ok")).toBeVisible({ timeout: 5000 });

    // Switch back to governance — Articles section must still render
    await page.getByRole("link", { name: /Articles/ }).click();
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible({
      timeout: 5000,
    });
  });
});
