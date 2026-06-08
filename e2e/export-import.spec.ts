import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * export-import.spec.ts — B10 export/import round-trip tests.
 *
 * Tests:
 * 1. "Download .srsj" button is visible after loading
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
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("Download .srsj button is visible after loading", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Download .srsj" })).toBeVisible();
  });

  test("clicking Download .srsj triggers a file download", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .srsj" }).click(),
    ]);

    // Filename must be <repoName>.srsj
    expect(download.suggestedFilename()).toMatch(/\.srsj$/);
    expect(download.suggestedFilename()).toContain("gallery");
  });

  test("downloaded file is valid JSON with srsj envelope", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .srsj" }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty("srsj", "1");
    expect(parsed).toHaveProperty("manifest");
    expect(parsed).toHaveProperty("data");
  });

  test("exported file contains all original records", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .srsj" }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const parsed = JSON.parse(text);

    // gallery.srsj has 16 instances (6 articles + 7 decisions + 3 roles)
    const instanceIndex: unknown[] = parsed.manifest?.instanceIndex ?? [];
    expect(instanceIndex.length).toBeGreaterThanOrEqual(16);
  });

  test("mutation survives export → re-import round-trip", async ({ page }) => {
    // Create a new article
    await page.getByRole("button", { name: "New Article" }).click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Round-Trip Test Article");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("This record was created to test the export round-trip.");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.getByRole("button", { name: "Save" }).click();

    // Wait for form to close and new record to appear
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Round-Trip Test Article")).toBeVisible();

    // Download the mutated repo
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .srsj" }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const exportedText = Buffer.concat(chunks).toString("utf8");

    // The exported JSON must contain the new record's title text
    expect(exportedText).toContain("Round-Trip Test Article");

    // Re-import: click "Open another file", upload the exported content as a file
    await page.getByRole("button", { name: "Open another file" }).click();
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible();

    // Write the exported content to a temp file and re-upload
    const tmpPath = path.join(__dirname, "fixtures", "_roundtrip_tmp.srsj");
    const fs = await import("node:fs/promises");
    await fs.writeFile(tmpPath, exportedText, "utf8");
    try {
      const fileInput2 = page.locator('input[type="file"]#srsj-file');
      await fileInput2.setInputFiles(tmpPath);
      await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });

      // The new record must still be present after re-import
      await expect(page.locator("text=Round-Trip Test Article")).toBeVisible({ timeout: 5000 });
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });
});
