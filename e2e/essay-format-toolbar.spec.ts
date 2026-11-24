import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openMenu } from "./helpers";

/**
 * srs-web#751: the formatting toolbar in visual mode (the default since #752; the suite's storage sets source). Every button
 * keeps the edit and the caret, and its format reaches the record as markdown (read back through
 * Export markdown). Fixture essay.srsj: "First paragraph." / "Second paragraph." / "Third paragraph.".
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const body = (page: Page, n: number) => items(page).nth(n).locator('[data-focus-key^="body:"]');
const visual = (page: Page, n: number) => items(page).nth(n).locator(".ProseMirror");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Formatting" });
const button = (page: Page, name: string) =>
  toolbar(page).getByRole("button", { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("srs-web.essay.edit-mode", "visual"));
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
});

/** A key's selection reaches the editor's state on the next selectionchange; a writer is never faster. */
const settle = (page: Page) => page.waitForTimeout(100);

/** Choose a row of the heading menu. */
async function heading(page: Page, row: string) {
  await button(page, "Heading").click();
  await page.getByRole("menuitemcheckbox", { name: row, exact: true }).click();
}

/** Open paragraph `n` and select its (one-line) text. */
async function select(page: Page, n: number) {
  await body(page, n).click();
  await expect(visual(page, n)).toBeFocused();
  await settle(page); // the editor places its caret a frame after focus
  await page.keyboard.press("Control+a"); // the editor's own command: no wait for selectionchange
}

async function exported(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await openMenu(page, "Document");
      await page.getByTestId("export-markdown").click();
    })(),
  ]);
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

test("bold from the toolbar keeps the edit and the caret, and reaches the record as **x**", async ({
  page,
}) => {
  await select(page, 0);
  await button(page, "Bold").click();
  await expect(visual(page, 0)).toBeFocused();
  await expect(button(page, "Bold")).toHaveAttribute("aria-pressed", "true");
  await expect(visual(page, 0).locator("strong")).toHaveText("First paragraph.");
  await settle(page); // the button gives focus back a frame later
  // the caret is still in the paragraph: typing goes on in it
  await page.keyboard.press("End");
  await page.keyboard.type(" More");
  await expect(visual(page, 0).locator("strong")).toHaveText("First paragraph. More");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(toolbar(page)).toHaveCount(0);
  expect(await exported(page)).toContain("**First paragraph. More**");
});

test("a heading, a list, a quote and a link each reach the record as markdown", async ({
  page,
}) => {
  await select(page, 0);
  await heading(page, "Heading 3");
  await expect(visual(page, 0)).toBeFocused();
  await expect(button(page, "Heading")).toHaveAttribute("aria-pressed", "true");
  await select(page, 1);
  await button(page, "Bulleted list").click();
  await select(page, 2);
  await button(page, "Quote").click();
  await expect(visual(page, 2)).toBeFocused();
  // the link field takes focus without ending the edit
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await settle(page);
  await button(page, "Link").click();
  const field = page.getByRole("textbox", { name: "Link address" });
  await expect(field).toBeFocused();
  await field.fill("https://example.com");
  await field.press("Enter");
  await expect(visual(page, 2)).toBeFocused();
  await expect(button(page, "Link")).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  const md = await exported(page);
  expect(md).toMatch(/^#+ First paragraph\.$/m);
  expect(md).toContain("- Second paragraph.");
  expect(md).toContain("> [Third paragraph.](https://example.com)");
});

test("the heading menu shows the level, changes it, and returns to normal text", async ({ page }) => {
  await select(page, 0);
  await heading(page, "Heading 3");
  await expect(visual(page, 0).locator("h3")).toHaveText("First paragraph.");
  // by keyboard: Escape keeps the edit; the arrows reach a level
  await button(page, "Heading").click();
  const row = (name: string) => page.getByRole("menuitemcheckbox", { name, exact: true });
  await expect(row("Heading 3")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(row("Heading 3")).toHaveCount(0);
  await expect(toolbar(page)).toBeVisible();
  await button(page, "Heading").click();
  await expect(row("Normal text")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(visual(page, 0)).toBeFocused();
  await expect(visual(page, 0).locator("h2")).toHaveText("First paragraph.");
  await heading(page, "Normal text");
  await expect(visual(page, 0).locator("p")).toHaveText("First paragraph.");
  await expect(button(page, "Heading")).toHaveAttribute("aria-pressed", "false");
});

test("text the save check refuses falls back to source, saved, with no page error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await body(page, 0).click();
  await expect(visual(page, 0)).toBeFocused();
  await settle(page);
  const range = async (from: number, to: number) => {
    await settle(page); // the editor places its caret after a click or a button
    await visual(page, 0).evaluate(
      (root, [from, to]) => {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const r = document.createRange();
        let at = 0;
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const len = n.textContent!.length;
          if (from >= at && from < at + len) r.setStart(n, from - at);
          if (to > at && to <= at + len) r.setEnd(n, to - at);
          at += len;
        }
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
      },
      [from, to]
    );
    await settle(page); // the selection reaches the editor's state
  };
  // overlapping bold and italic: a known serializer defect
  await range(0, 8);
  await button(page, "Bold").click();
  await expect(visual(page, 0).locator("strong")).toHaveText("First pa");
  await range(4, 12);
  await button(page, "Italic").click();
  await expect(page.locator(".block__note")).toContainText("needs the markdown source");
  await expect(body(page, 0)).toBeFocused();
  expect(errors.filter((e) => !e.includes("localStorage"))).toEqual([]);
});

test("a heading chosen in an empty paragraph waits for its text", async ({ page }) => {
  await select(page, 0);
  await page.keyboard.press("Delete");
  await heading(page, "Heading 2");
  await page.waitForTimeout(700); // past the save pause
  await expect(visual(page, 0)).toBeFocused();
  await page.keyboard.type("Later");
  await expect(visual(page, 0).locator("h2")).toHaveText("Later");
});

test("every button is reachable by keyboard with a label, and Tab into the toolbar keeps the edit", async ({
  page,
}) => {
  await body(page, 1).click();
  await expect(visual(page, 1)).toBeFocused();
  await settle(page);
  await page.keyboard.press("End"); // not at the start: Tab is not an indent there
  await page.keyboard.press("Tab");
  await expect(button(page, "Bold")).toBeFocused();
  const labels = [
    "Bold",
    "Italic",
    "Heading",
    "Bulleted list",
    "Numbered list",
    "Quote",
    "Code",
    "Link",
  ];
  for (const name of labels.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(button(page, name)).toBeFocused();
  }
  // pressing a button by keyboard formats and returns to the text
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(visual(page, 1)).toBeFocused();
  await expect(visual(page, 1).locator("code")).toHaveCount(0); // nothing selected: a stored mark only
  await page.keyboard.type("x");
  await expect(visual(page, 1).locator("code")).toHaveText("x");
});

test.describe("phone width", () => {
  test.use({ hasTouch: true });
  test("the toolbar fits the screen and a tap keeps the edit", async ({ page }) => {
    // The editor picker is not reachable at phone width yet (srs-web#381): opened at desktop width, then shrunk.
    await page.setViewportSize({ width: 360, height: 740 });
    await body(page, 0).tap();
    await expect(visual(page, 0)).toBeFocused();
    for (const b of await toolbar(page).getByRole("button").all()) {
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }
    await button(page, "Heading").tap();
    const box = (await page.getByRole("menu", { name: "Heading" }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await page.getByRole("menuitemcheckbox", { name: "Heading 2" }).tap();
    await expect(visual(page, 0).locator("h2")).toBeVisible();
    await button(page, "Italic").tap();
    await expect(visual(page, 0)).toBeFocused();
    await expect(button(page, "Italic")).toHaveAttribute("aria-pressed", "true");
  });
});
