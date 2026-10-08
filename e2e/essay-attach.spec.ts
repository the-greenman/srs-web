import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-attach.spec.ts — srs-web#506, #519: attach text files to a paragraph by drop or the ⋯ menu; each is a
 * source record in the references pool evidencing the paragraph (a source glyph). Fixture: essay-pool.srsj.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-pool.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const glyphs = (page: Page, n: number) => items(page).nth(n).locator('.glyph[aria-label^="source"]');
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

test("dropping a file on a paragraph attaches it; the ⋯ menu attaches another", async ({
  page,
}) => {
  await open(page);
  const target = items(page).nth(0);
  await expect(glyphs(page, 0)).toHaveCount(0);

  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["# Notes\n"], "dropped-notes.md", { type: "text/markdown" }));
    return d;
  });
  await target.dispatchEvent("dragenter", { dataTransfer: dt });
  await target.dispatchEvent("dragover", { dataTransfer: dt });
  await expect(target).toHaveClass(/is-drop-file/);
  await target.dispatchEvent("drop", { dataTransfer: dt });
  await expect(glyphs(page, 0)).toHaveCount(1);
  await expect(target).not.toHaveClass(/is-drop-file/);
  await glyphs(page, 0).hover();
  await expect(page.getByRole("group", { name: "dropped-notes.md" })).toBeVisible();

  // ⋯ > Attach file…, then the picker
  await target.getByTestId("paragraph-menu").click();
  await page.getByTestId("paragraph-menu-attach").click();
  await target
    .getByTestId("attach-drop")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "picked.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("picked"),
    });
  await expect(glyphs(page, 0)).toHaveCount(2);

  // a duplicate name is refused by the core and surfaced
  await target.getByTestId("paragraph-menu").click();
  await page.getByTestId("paragraph-menu-attach").click();
  await target
    .getByTestId("attach-drop")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "picked.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("again"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(glyphs(page, 0)).toHaveCount(2);
});

test("a non-text file dropped on a paragraph is rejected with a message", async ({ page }) => {
  await open(page);
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["x"], "photo.png", { type: "image/png" }));
    return d;
  });
  await items(page).nth(0).dispatchEvent("drop", { dataTransfer: dt });
  await expect(page.getByTestId("attach-rejected")).toContainText("photo.png");
  await expect(glyphs(page, 0)).toHaveCount(0);
});
