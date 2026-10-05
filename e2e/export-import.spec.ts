import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openPackageEditor, navItem, newRecord, exportItem, openAnother, openMenu, closeMenus } from "./helpers.js";

/**
 * export-import.spec.ts — B10 export/import round-trip tests.
 *
 * Tests:
 * 1. The Document menu's "Export .srsj" item is visible after loading
 * 2. Clicking it triggers a browser download (intercepted via download event)
 * 3. The downloaded filename reflects the repo name
 * 4. After a mutation (create record), the downloaded file is valid JSON
 *    containing the new record (round-trip via Blob URL re-read in the page)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Export / Import round-trip (B10)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await openPackageEditor(page, "governance");

    await expect(navItem(page, /Articles/)).toBeVisible({ timeout: 5000 });
  });

  test("the Document menu offers Export .srsj after loading", async ({ page }) => {
    await openMenu(page, "Document");
    await expect(page.getByTestId("toolbar-export-srsj")).toBeVisible();
    await closeMenus(page);
  });

  test("choosing Export .srsj triggers a file download", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportItem(page, "srsj"),
    ]);

    // Filename must be <repoName>.srsj
    expect(download.suggestedFilename()).toMatch(/\.srsj$/);
    expect(download.suggestedFilename()).toContain("gallery");
  });

  test("downloaded file is valid JSON with srsj envelope", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportItem(page, "srsj"),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty("srsj", "2");
    expect(parsed).toHaveProperty("manifest");
    expect(parsed).toHaveProperty("data");
  });

  test("exported file contains all original records", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportItem(page, "srsj"),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const parsed = JSON.parse(text);

    // gallery.srsj has 16 instances (6 articles + 7 decisions + 3 roles).
    // RFC-038: the tree is the catalog — membership is the set of record
    // objects in `data`, not a manifest inventory ([R2] retires those).
    const records = Object.keys(parsed.data ?? {}).filter((p) => p.startsWith("records/"));
    expect(records.length).toBeGreaterThanOrEqual(16);
    expect(parsed.manifest).not.toHaveProperty("instanceIndex");
    expect(parsed.manifest).not.toHaveProperty("containerIndex");
  });

  test("mutation survives export → re-import round-trip", async ({ page }) => {
    // Create a new article
    await newRecord(page);
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Round-Trip Test Article");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("This record was created to test the export round-trip.");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.getByTestId("record-form").getByRole("button", { name: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("record-reading")).toContainText("Round-Trip Test Article");

    // Click back to return to the list before exporting.
    await page.getByTestId("record-reading-back").click();
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });

    // Download the mutated repo
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportItem(page, "srsj"),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const exportedText = Buffer.concat(chunks).toString("utf8");

    // The exported JSON must contain the new record's title text
    expect(exportedText).toContain("Round-Trip Test Article");

    // Re-import: click "Open another file", choose governance again, re-upload
    await openAnother(page);
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });

    // Write the exported content to a temp file and re-upload
    const tmpPath = path.join(__dirname, "fixtures", "_roundtrip_tmp.srsj");
    const fs = await import("node:fs/promises");
    await fs.writeFile(tmpPath, exportedText, "utf8");
    try {
      const fileInput2 = page.locator('input[type="file"]#srsj-file');
      await fileInput2.setInputFiles(tmpPath);
      await openPackageEditor(page, "governance");
      await expect(navItem(page, /Articles/)).toBeVisible({ timeout: 5000 });

      // The new record must still be present after re-import — navigate to Articles
      // explicitly since the default active section on load is not guaranteed.
      await navItem(page, /Articles/).click();
      await expect(page.locator("text=Round-Trip Test Article")).toBeVisible({ timeout: 5000 });
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });
});
