import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** srs-web#807: clicking a formatted paragraph to edit keeps the clicked text under the pointer. */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const body = (page: Page, n: number) => items(page).nth(n).locator('[data-focus-key^="body:"]');
const render = (page: Page, n: number) => items(page).nth(n).locator(".block__render, [class$='__render']").first();

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

// Formatted: a heading, a long list, a link. Rendered height differs a lot from the source height.
const FORMATTED = [
  "# A heading",
  "",
  ...Array.from({ length: 30 }, (_, i) => `- item ${i} with [a link](https://example.com/a/very/long/address/${i}) and *emphasis*`),
  "",
  "closing words here",
].join("\n");

test("clicking a word in a long formatted paragraph keeps it under the pointer", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 500 });
  await open(page);
  await body(page, 1).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(FORMATTED);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(items(page).nth(1).locator("[contenteditable]")).toHaveCount(0);

  const target = render(page, 1).locator("li").nth(20).locator("em");
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const clickY = box.y + box.height / 2;
  await page.mouse.click(box.x + box.width / 2, clickY);
  await expect(body(page, 1)).toHaveAttribute("contenteditable", "plaintext-only");

  const caret = await page.evaluate(() => {
    const r = getSelection()!.getRangeAt(0);
    const rect = r.getBoundingClientRect();
    return { top: rect.top, height: rect.height, text: r.startContainer.textContent!.slice(0, r.startOffset) };
  });
  // the caret sits in the clicked list item's source, and on screen where the writer clicked
  expect(caret.text.split("\n").at(-1)).toMatch(/^- item 20 /);
  const line = caret.height || 24;
  expect(Math.abs(caret.top - clickY)).toBeLessThanOrEqual(line * 1.5);
});
