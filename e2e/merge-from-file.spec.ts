import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { exportItem, menuItem, navItem, newRecord, openAnother, openPackageEditor } from "./helpers.js";

/**
 * Merge changes from a file (srs-web#733): a copy with a new record is merged into a fresh open of
 * the same document; the record comes in as an unsaved change. The engine plans and applies
 * (srs-rust#1580); this checks the screen around it.
 */
const GALLERY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "gallery.srsj");

async function openGallery(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(GALLERY);
  await openPackageEditor(page, "governance");
  await expect(navItem(page, /Articles/)).toBeVisible({ timeout: 5000 });
}

test("a record made in another copy comes in through Merge changes from a file", async ({ page }) => {
  await page.goto("/");
  await openGallery(page);

  // The other copy: one new record, exported as .srs.
  await newRecord(page);
  await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Made in the other copy");
  await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Brought back by a merge.");
  await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
  await page.getByTestId("record-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("record-reading")).toContainText("Made in the other copy");
  const [download] = await Promise.all([page.waitForEvent("download"), exportItem(page, "srs")]);
  const copy = await download.path();

  // This copy: the same document, opened fresh.
  await openAnother(page);
  await openGallery(page);
  await expect(page.getByTestId("changes-toggle")).toHaveCount(0);

  await menuItem(page, "Document", "toolbar-merge");
  await page.getByTestId("merge-file").setInputFiles(copy);
  const modal = page.getByTestId("merge-modal");
  await expect(modal.getByTestId("merge-choice")).toHaveCount(1);
  await expect(modal.getByTestId("merge-new")).toContainText("Made in the other copy");
  await expect(modal.getByTestId("merge-left-out")).toHaveCount(0);
  await modal.getByTestId("merge-apply").click();
  await expect(modal).toHaveCount(0);

  await page.getByTestId("changes-toggle").click();
  await expect(page.locator('[data-testid="changes-panel"] [data-group="added"] li')).toHaveCount(1);
  await expect(page.getByTestId("changes-panel")).toContainText("Made in the other copy");
});
