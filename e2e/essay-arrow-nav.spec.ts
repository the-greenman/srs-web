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

test("a blank line inside a paragraph is not an edge", async ({ page }) => {
  await open(page);
  await body(page, 1).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("line one\n\nline three");
  await page.keyboard.press("ArrowUp"); // line three -> blank line
  await page.keyboard.press("ArrowDown"); // blank -> line three: must not leave
  await expect(body(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp"); // blank -> line one
  await expect(body(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowDown"); // line one -> blank
  await page.keyboard.press("ArrowUp"); // blank -> line one
  await expect(body(page, 1)).toBeFocused();
});

/** srs-web#750: the same paragraph keys in the visual editor (the edit mode is per browser; the suite's storage sets source, #752). */
test.describe("visual mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("srs-web.essay.edit-mode", "visual"));
    await open(page);
  });
  const visual = (page: Page, n: number) => items(page).nth(n).locator(".ProseMirror");
  const depth = (page: Page, n: number) => items(page).nth(n).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--depth"));
  /** Click just before the first occurrence of `text` in a rendered paragraph (a real pointer click). */
  async function clickBefore(page: Page, n: number, text: string) {
    const pt = await body(page, n).evaluate((el, t) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        const i = node.textContent!.indexOf(t);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        const b = r.getBoundingClientRect();
        return { x: b.left + 1, y: b.top + b.height / 2 };
      }
      return null;
    }, text);
    await page.mouse.click(pt!.x, pt!.y);
    await expect(visual(page, n)).toBeFocused();
    // A click inside an open editor reaches its state on the next selectionchange; a writer is never faster.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }

  test("the caret lands where clicked, and Ctrl+Enter splits there; Ctrl+Z joins again", async ({ page }) => {
    await clickBefore(page, 0, "paragraph");
    await page.keyboard.press("Control+Enter");
    await expect(items(page)).toHaveCount(4);
    await expect(body(page, 0)).toHaveText("First");
    await expect(body(page, 1)).toHaveText("paragraph.");
    await expect(visual(page, 1)).toBeFocused();
    await expect.poll(() => caretOffset(page)).toBe(0);
    // nothing typed in the new half: Ctrl+Z is the essay's undo, not the editor's
    await page.keyboard.press("Control+z");
    await expect(items(page)).toHaveCount(3);
    await expect(body(page, 0)).toHaveText("First paragraph.");

    await clickBefore(page, 1, "paragraph");
    await page.keyboard.type("short ");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await expect(body(page, 1)).toHaveText("Second short paragraph.");
  });

  test("arrows cross to the neighbouring paragraph from the first/last line", async ({ page }) => {
    await clickBefore(page, 1, "paragraph");
    await page.keyboard.press("ArrowUp");
    await expect(visual(page, 0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(visual(page, 1)).toBeFocused();
    await expect.poll(() => caretOffset(page)).toBe(0);
    await page.keyboard.press("ArrowDown");
    await expect(visual(page, 2)).toBeFocused();
  });

  test("Alt+arrows move and change level; Tab and Shift+Tab at the start indent and outdent", async ({ page }) => {
    await clickBefore(page, 1, "paragraph");
    await page.keyboard.press("Alt+ArrowUp");
    await expect(body(page, 0)).toHaveText("Second paragraph.");
    await clickBefore(page, 1, "paragraph");
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(() => depth(page, 1)).toBe("1");
    await clickBefore(page, 1, "paragraph");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect.poll(() => depth(page, 1)).toBe("0");

    await clickBefore(page, 2, "Third");
    await page.keyboard.press("Tab");
    await expect.poll(() => depth(page, 2)).toBe("1");
    await clickBefore(page, 2, "Third");
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => depth(page, 2)).toBe("0");
    // not at the start: Tab is left to the browser (never prevented), so focus is never trapped
    await clickBefore(page, 2, "paragraph");
    await page.evaluate(() => window.addEventListener("keydown", (e) => ((window as unknown as { tabTaken: boolean }).tabTaken = e.defaultPrevented)));
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => (window as unknown as { tabTaken: boolean }).tabTaken)).toBe(false);
    expect(await depth(page, 2)).toBe("0");
  });
});
