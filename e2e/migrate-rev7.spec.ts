import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers.js";

/**
 * migrate-rev7.spec.ts — a dataModelRevision-7 document must never open empty (srs-web#334), and is
 * never migrated unasked (srs-web#611). The engine migrates a pre-10 .srsj in memory on open
 * (7 -> 10) and refuses every write until the user accepts (srs-rust#1454); declining opens it
 * read-only, unchanged. Accept -> edit -> save is migrate-rev8.spec.ts; the prompt for an
 * unmigrated tree is local-folder.spec.ts (revision-9 folder).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REV7 = path.join(__dirname, "fixtures", "rev7", "sample-rev7.srsj");

test.describe("a rev-7 file", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(REV7);
    const prompt = page.getByTestId("migration-prompt");
    await expect(prompt).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("migration-source-revision")).toHaveText("7");
    await expect(prompt).toContainText(
      "rfc043-container-entries, rfc046-actor-provenance, rfc052-root-container, rfc051-container-entries"
    );
  });

  test("declining opens the rev-7 document read-only: rendered, no editors, no Save", async ({
    page,
  }) => {
    await page.getByTestId("migration-read-only").click();
    // Rendered, not empty: the generic shell's structure navigation lists the sections.
    await expect(page.getByRole("heading", { name: "Structure" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Articles").first()).toBeVisible();
    await expect(page.getByTestId("read-only-note")).toContainText("Not migrated");
    await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
    await expect(page.getByTestId("save-document")).toHaveCount(0);
    // No editing surface is offered on a declined document.
    await expect(page.locator('[data-testid^="package-editor-"]')).toHaveCount(0);
    await openMenu(page, "Document");
    await expect(page.getByTestId("save-copy")).toBeVisible();
  });

  test("cancelling returns to the picker without opening it", async ({ page }) => {
    await page.getByTestId("migration-cancel").click();
    await expect(page.getByTestId("generic-file-picker")).toBeVisible();
    await expect(page.getByTestId("generic-srs-shell")).toHaveCount(0);
  });
});

test("declining a restored rev-7 session leaves it read-only, clean and unchanged in storage", async ({
  page,
}) => {
  // A legacy recovery entry (pre-#505 localStorage .srsj) holding the rev-7 document.
  const entry = JSON.stringify({
    name: "sample-rev7",
    srsj: readFileSync(REV7, "utf8"),
    savedAt: "2026-10-01T00:00:00Z",
  });
  await page.goto("/");
  await page.evaluate((e) => localStorage.setItem("srs-web:working-copy", e), entry);
  const restore = async () => {
    await page.reload();
    await page.getByTestId("restore-notice").getByTestId("restore-session").click();
    await expect(page.getByTestId("migration-source-revision")).toHaveText("7", { timeout: 10000 });
  };
  await restore();
  await page.getByTestId("migration-read-only").click();
  await expect(page.getByTestId("read-only-note")).toContainText("Not migrated");
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  // Not written back at revision 11, so restoring again asks again.
  expect(await page.evaluate(() => localStorage.getItem("srs-web:working-copy"))).toBe(entry);
  await restore();
});
