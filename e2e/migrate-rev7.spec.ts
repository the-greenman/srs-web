import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * migrate-rev7.spec.ts — a dataModelRevision-7 document must never open empty (srs-web#334).
 *
 * Since build.545 (RFC-052, srs-web#583) the engine migrates a pre-10 .srsj in memory on open
 * (7 -> 10), so no prompt is shown; the prompt for an unmigrated tree is covered by
 * local-folder.spec.ts (revision-9 folder).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REV7 = path.join(__dirname, "fixtures", "rev7", "sample-rev7.srsj");

test("a rev-7 document opens migrated in memory and renders its sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(REV7);
  await expect(page.getByTestId("migration-prompt")).toHaveCount(0);
  // Rendered, not empty: the generic shell's structure navigation lists the sections.
  await expect(page.getByRole("heading", { name: "Structure" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Articles").first()).toBeVisible();
});
