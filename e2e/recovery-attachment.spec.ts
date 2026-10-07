import path from "node:path";
import { expect, test } from "@playwright/test";
import { openPackageEditor, waitForRecoveryCopy } from "./helpers.js";

// srs-web#505: the recovery copy is the .srs archive in IndexedDB, so it keeps updating (and
// restores) once the repository holds attachment bytes, which export_srsj refuses.
test("recovery copy survives an attachment and restores", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page
    .locator('input[type="file"]#srsj-file')
    .setInputFiles(path.join(import.meta.dirname, "fixtures", "gallery.srsj"));
  await openPackageEditor(page, "governance");

  await page.getByTestId("attachments-file-input").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello attachment"),
  });
  await expect(page.getByTestId("attachment-item")).toHaveCount(1);

  await waitForRecoveryCopy(page);

  await page.reload();
  const banner = page.locator(".restore-banner");
  await expect(banner).toBeVisible({ timeout: 10000 });
  await banner.locator(".restore-banner__restore").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
  await openPackageEditor(page, "governance");
  await expect(page.getByTestId("attachment-item")).toHaveCount(1);
});
