import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { connectAgents } from "./helpers";

/**
 * annotation-margin.spec.ts — srs-web#422: the margin is a real grid column. Rows never cross the
 * page edge or the rail, the compact form carries marks only, and at phone width the notes stay
 * reachable inline in the title row. Fixture: essay.srsj; an agent writes the annotations.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const LONG = "A deliberately long attached note title that must wrap and clamp rather than spill";

async function annotate(page: Page) {
  const { attach, relate } = await connectAgents(page, ESSAY, 1);
  const id = (n: number) =>
    items(page).nth(n).locator("[data-block-id]").getAttribute("data-block-id") as Promise<string>;
  const p1 = await id(1);
  const p2 = await id(2);
  for (let i = 1; i <= 3; i++)
    await attach(1, `${LONG} ${i}`, `Body of note ${i}`, p1, i === 2 ? "refines" : "evidences");
  await relate(1, p2, p1);
  await relate(1, p1, p2, "refines");
  return { p1 };
}

test("1920 expanded: no row meets the rail or leaves the page; compact at 1280 shows marks only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await annotate(page);
  const shell = page.locator(".essay-shell");
  await expect(shell).toHaveAttribute("data-margin", "compact");
  const block = items(page).nth(1);
  await expect(block.locator('[data-part="row"]').first()).toBeVisible();
  await expect(block.locator(".margin__text")).toHaveCount(0); // compact: marks only

  await page.getByTestId("margin-variant").click();
  await expect(shell).toHaveAttribute("data-margin", "expanded");
  await expect(block.locator(".margin__text").first()).toBeVisible();
  const rail = (await page.getByTestId("rail").boundingBox())!;
  const pageBox = (await page.locator(".essay-shell__page").boundingBox())!;
  const rows = page.locator('.essay-shell__page [data-part="row"]');
  const n = await rows.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    const r = (await rows.nth(i).boundingBox())!;
    expect(r.x + r.width, `row ${i} right edge`).toBeLessThanOrEqual(pageBox.x + pageBox.width + 1);
    const crosses = r.x < rail.x + rail.width && r.x + r.width > rail.x;
    expect(crosses, `row ${i} meets the rail`).toBe(false);
  }
  // one shared left edge: every mark in a block starts at the same x
  const xs = await block.locator('[data-part="row"] > [data-part="mark"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
  expect(new Set(xs).size).toBe(1);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId("margin-variant").click();
  await expect(shell).toHaveAttribute("data-margin", "compact");
  await expect(block.locator(".margin__text")).toHaveCount(0);
});

test("390: the notes are reachable inline in the title row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await annotate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const block = items(page).nth(1).locator(".block");
  const rows = block.locator('[data-part="row"]');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = (await rows.nth(i).boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(391);
  }
  const body = (await block.locator(".block__render").boundingBox())!;
  const last = (await rows.last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(body.y + 1); // above the text: inline in the title row
});
