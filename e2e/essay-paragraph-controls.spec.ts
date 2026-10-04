import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * essay-paragraph-controls.spec.ts — srs-web#423: one tool surface at a time (hover wins over focus),
 * handle and ⋯ always visible, and a hover strip that sits inside the paragraph's own title row and so
 * never covers a neighbour's controls, a thread composer, the margin or Add paragraph.
 * Fixture: essay.srsj (Opening / Claim / untitled Third paragraph, one draft).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const strip = (page: Page, n: number) => items(page).nth(n).getByTestId("block-strip");
const opacity = (l: Locator) => l.evaluate((e) => getComputedStyle(e).opacity);

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };
/** Rectangles meet with 0px tolerance (touching edges do not intersect). */
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
/** Every visible box of a locator (a hidden or absent element has none). */
async function boxes(l: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (let i = 0; i < (await l.count()); i++) {
    const b = await l.nth(i).boundingBox();
    if (b) out.push(b);
  }
  return out;
}

test("single surface: focus A, hover B: exactly one strip is shown (B's); pointer away: A's remains", async ({
  page,
}) => {
  await open(page);
  await items(page).nth(0).locator(".block__render, .block__body").click(); // A: focus in the body
  await page.mouse.move(5, 5);
  await expect.poll(() => opacity(strip(page, 0))).toBe("1"); // a focused body shows its strip when nothing is hovered
  await items(page).nth(1).hover(); // B
  await expect.poll(() => opacity(strip(page, 1))).toBe("1");
  await expect.poll(() => opacity(strip(page, 0))).toBe("0");
  const all = page.getByTestId("block-strip");
  const shown = (
    await all.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))
  ).filter((o) => o === "1");
  expect(shown).toHaveLength(1);
  await page.mouse.move(5, 5);
  await expect.poll(() => opacity(strip(page, 0))).toBe("1");
  await expect.poll(() => opacity(strip(page, 1))).toBe("0");
});

test("handle and ⋯ are visible with no hover or focus", async ({ page }) => {
  await open(page);
  await page.mouse.move(5, 5);
  for (let n = 0; n < (await items(page).count()); n++) {
    for (const t of [
      items(page).nth(n).locator(".block__handle"),
      items(page).nth(n).getByTestId("paragraph-menu"),
    ]) {
      await expect(t).toBeVisible();
      expect(await opacity(t)).toBe("1");
    }
  }
});

/** Hover paragraph n (previous paragraph has an open thread) and check the strip against every neighbouring control. */
async function noOverlap(page: Page, n: number) {
  const prev = items(page).nth(n - 1);
  await prev.getByTestId("comment-badge").click(); // open the previous paragraph's thread
  await expect(prev.getByTestId("comment-thread")).toBeVisible();
  await items(page).nth(n).hover();
  await expect.poll(() => opacity(strip(page, n))).toBe("1");
  const s = (await strip(page, n).boundingBox())!;
  const block = (await items(page).nth(n).locator(".block").boundingBox())!;
  const main = (await items(page).nth(n).locator(".block__main").boundingBox())!;
  // never leaves the block, and stays in the main column
  expect(s.y).toBeGreaterThanOrEqual(block.y);
  expect(s.y + s.height).toBeLessThanOrEqual(block.y + block.height + 0.5);
  expect(s.x).toBeGreaterThanOrEqual(main.x);
  expect(s.x + s.width).toBeLessThanOrEqual(main.x + main.width + 0.5);
  const others: [string, Locator][] = [
    ["paragraph body text", items(page).nth(n).locator(".block__body, .block__render")],
    ["handle", page.locator(".essay-shell__page .block__handle")],
    ["⋯", page.locator('.essay-shell__page [data-testid="paragraph-menu"]')],
    ["Add paragraph", page.getByTestId("add-paragraph")],
    ["comment badge", page.locator(".essay-shell__page .comment-badge")],
    ["margin row", page.locator('.essay-shell__page .margin > [data-part="row"]')],
    ["previous composer", prev.getByLabel("Reply")],
    ["previous Comment button", prev.getByRole("button", { name: "Comment", exact: true })],
  ];
  for (const [name, l] of others) {
    for (const b of await boxes(l)) expect(intersects(s, b), `strip meets ${name}`).toBe(false);
  }
}

test("no overlap: a one-line paragraph whose previous paragraph has an open thread", async ({
  page,
}) => {
  await open(page);
  await noOverlap(page, 2); // "Third paragraph." is untitled and one line
});

test("no overlap: a titled paragraph (the strip may cover the end of its title, nothing else)", async ({
  page,
}) => {
  await open(page);
  await noOverlap(page, 1);
});

test("no layout shift on hover: every paragraph keeps its title row, so a block is the same height before and after the strip shows", async ({
  page,
}) => {
  await open(page);
  await page.mouse.move(5, 5);
  for (const n of [0, 1, 2]) {
    const block = items(page).nth(n).locator(".block");
    const head = items(page).nth(n).locator(".block__head");
    const before = (await block.boundingBox())!.height;
    // titled or not, the title row is at least the strip's height (--block-head-min)
    expect((await head.boundingBox())!.height, `paragraph ${n} head row`).toBeGreaterThanOrEqual(
      30
    );
    await items(page).nth(n).hover();
    await expect.poll(() => opacity(strip(page, n))).toBe("1");
    expect((await block.boundingBox())!.height, `paragraph ${n} height on hover`).toBe(before);
  }
});

test("no overlap: a hidden paragraph", async ({ page }) => {
  await open(page);
  await items(page).nth(2).hover();
  await items(page)
    .nth(2)
    .getByRole("button", { name: /^Hide / })
    .click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await noOverlap(page, 2);
});

test("keyboard: Shift+Tab from a paragraph body reaches its strip; it shows even while another paragraph is hovered", async ({
  page,
}) => {
  await open(page);
  await items(page).nth(0).locator(".block__render, .block__body").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Tab"); // title/strip are before the body in tab order
  const focused = page.locator(":focus");
  await expect(strip(page, 0).locator(":focus")).toHaveCount(1);
  await items(page).nth(1).hover();
  await expect.poll(() => opacity(strip(page, 0))).toBe("1");
  expect(await focused.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
});

test("the strip's Hide runs the same callback as the menu's", async ({ page }) => {
  await open(page);
  await items(page).nth(1).hover();
  await items(page)
    .nth(1)
    .getByRole("button", { name: /^Hide / })
    .click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await page.getByRole("button", { name: "Actions for Claim" }).click();
  await expect(page.getByTestId("paragraph-menu-hide")).toHaveText(/Show/);
  await page.getByTestId("paragraph-menu-hide").click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(0);
});
