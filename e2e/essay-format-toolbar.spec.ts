import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openMenu } from "./helpers";

/**
 * srs-web#751: the formatting toolbar in visual mode (per browser; source until #752). Every button
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
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Open paragraph `n` and select its (one-line) text. */
async function select(page: Page, n: number) {
  await body(page, n).click();
  await expect(visual(page, n)).toBeFocused();
  await settle(page); // the editor places its caret a frame after focus
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await settle(page);
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
  await button(page, "Heading").click();
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
    await button(page, "Italic").tap();
    await expect(visual(page, 0)).toBeFocused();
    await expect(button(page, "Italic")).toHaveAttribute("aria-pressed", "true");
  });
});
