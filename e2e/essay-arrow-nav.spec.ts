import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** srs-web#396: ArrowDown/Up on the last/first visual line moves to the neighbouring paragraph. */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const body = (page: Page, n: number) => items(page).nth(n).locator('[data-focus-key^="body:"]');
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}
const caretOffset = (page: Page) => page.evaluate(() => getSelection()?.anchorOffset);

test("arrows cross paragraph boundaries only on the first/last line", async ({ page }) => {
  await open(page);
  await body(page, 1).click();
  await expect(body(page, 1)).toHaveAttribute("contenteditable", "plaintext-only");
  // make paragraph 1 multi-line so a plain arrow stays inside it
  await page.keyboard.press("Control+A");
  await page.keyboard.type("first line\nsecond line");
  await page.keyboard.press("ArrowUp"); // second -> first line: stays
  await expect(body(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowUp"); // first line: crosses to the previous paragraph
  await expect(body(page, 0)).toBeFocused();
  await page.keyboard.press("ArrowDown"); // single/last line: crosses to the next, at its start
  await expect(body(page, 1)).toBeFocused();
  await expect.poll(() => caretOffset(page)).toBe(0);
  await page.keyboard.press("ArrowDown"); // first line of two: stays
  await expect(body(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowDown"); // last line: next paragraph
  await expect(body(page, 2)).toBeFocused();
});
