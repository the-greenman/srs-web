import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-references-pool.spec.ts — srs-web#519: the References panel is one pool for files and URLs.
 * Fixture essay-pool.srsj (essay 1.7.0 + the real argument/source type): a text file dropped on the tray
 * becomes a source row whose Open shows the text; a pasted URL a web row with its link; a file dropped on
 * a paragraph is the same source, evidencing that paragraph (source glyph + tray chip).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-pool.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const rows = (page: Page) => page.getByTestId("reference-row");

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await expect(page.getByTestId("references")).toBeVisible();
}
const fileDrop = (page: Page, name: string, text: string) =>
  page.evaluateHandle(
    ([n, t]) => {
      const d = new DataTransfer();
      d.items.add(new File([t], n, { type: "text/markdown" }));
      return d;
    },
    [name, text]
  );

test("a text file dropped on the tray becomes a source row; Open shows its text", async ({ page }) => {
  await open(page);
  const before = await rows(page).count();
  const zone = page.getByTestId("references-drop");
  const dt = await fileDrop(page, "call-transcript.md", "# Call\nWe agreed to meet on Tuesday.\n");
  await zone.dispatchEvent("dragenter", { dataTransfer: dt });
  await zone.dispatchEvent("drop", { dataTransfer: dt });
  await expect(rows(page)).toHaveCount(before + 1);
  const row = rows(page).filter({ hasText: "call-transcript.md" });
  await expect(row).toContainText("source · transcript");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);

  await page.getByLabel("Open call-transcript.md").click(); // not linked to any paragraph yet
  const pinned = page.locator(".pinned__item").filter({ hasText: "call-transcript.md" });
  await expect(pinned).toContainText("We agreed to meet on Tuesday.");
  await pinned.getByRole("button", { name: "Open" }).click();
  await expect(pinned.locator(".pinned__full")).toContainText("We agreed to meet on Tuesday.");
});

test("a pasted URL becomes a web row with its link", async ({ page }) => {
  await open(page);
  const zone = page.getByTestId("references-drop");
  await zone.focus();
  await zone.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "https://example.org/small-democracy");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const row = rows(page).filter({ hasText: "https://example.org/small-democracy" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("source · web");
  await expect(row.getByTestId("reference-url")).toHaveAttribute("href", "https://example.org/small-democracy");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
});

test("a file dropped on a paragraph is a source evidencing it: glyph on the paragraph, chip in the tray", async ({ page }) => {
  await open(page);
  const target = items(page).nth(0);
  await expect(target.locator('.glyph[aria-label^="source"]')).toHaveCount(0);
  const dt = await fileDrop(page, "interview.md", "Interview text.");
  await target.dispatchEvent("dragenter", { dataTransfer: dt });
  await target.dispatchEvent("dragover", { dataTransfer: dt });
  await target.dispatchEvent("drop", { dataTransfer: dt });
  await expect(target.locator('.glyph[aria-label^="source"]')).toHaveCount(1);
  const row = rows(page).filter({ hasText: "interview.md" });
  await expect(row.getByTestId("reference-chip")).toHaveCount(1);
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
});

test("Link to paragraph links a pooled reference later", async ({ page }) => {
  await open(page);
  const zone = page.getByTestId("references-drop");
  const dt = await fileDrop(page, "later.md", "Later.");
  await zone.dispatchEvent("drop", { dataTransfer: dt });
  const row = rows(page).filter({ hasText: "later.md" });
  await expect(row.getByTestId("reference-chip")).toHaveCount(0);
  await row.getByTestId("reference-link").click();
  await page.locator('[data-testid^="reference-link-"]').first().click();
  await expect(row.getByTestId("reference-chip")).toHaveCount(1);
});

test("a file dropped on the page background joins the pool, linked to nothing", async ({ page }) => {
  await open(page);
  const dt = await fileDrop(page, "background.md", "Loose.");
  await page.locator(".essay-shell__page").dispatchEvent("drop", { dataTransfer: dt });
  const row = rows(page).filter({ hasText: "background.md" });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("reference-chip")).toHaveCount(0);
});
