import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * migrate-rev7.spec.ts — RFC-043 revision gate (srs-web#334).
 *
 * A dataModelRevision-7 repository must never open empty: the engine refuses it,
 * the app offers the `rfc043-container-entries` migration, applies it to the
 * working copy (unsaved), and then renders. Cancel returns to the picker.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REV7 = path.join(__dirname, "fixtures", "rev7", "sample-rev7.srsj");

test.describe("Rev-7 repository migration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(REV7);
  });

  test("offers the migration, applies it, then renders the repository", async ({ page }) => {
    await expect(page.getByTestId("migration-prompt")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("migration-prompt")).toContainText("rfc043-container-entries");
    // 7 -> 9 chains: the same prompt carries the RFC-046 step.
    await expect(page.getByTestId("migration-prompt")).toContainText("rfc046-actor-provenance");

    await page.getByTestId("migration-apply").click();

    await expect(page.getByTestId("migration-prompt")).not.toBeVisible();
    // Rendered, not empty: the generic shell's structure navigation lists the sections.
    await expect(page.getByRole("heading", { name: "Structure" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Articles").first()).toBeVisible();
    await expect(page.getByText(/Unsaved/i).first()).toBeVisible();
  });

  test("cancel returns to the file picker without opening anything", async ({ page }) => {
    await page.getByTestId("migration-cancel").click();
    await expect(page.getByTestId("generic-file-picker")).toBeVisible();
  });
});
