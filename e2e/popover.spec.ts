import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { connectAgents } from "./helpers";

/**
 * popover.spec.ts — the Popover primitive (srs-web#421, ADR-020 e). Chromium only (the pinned
 * browser); the JS placement fallback is covered by tests/popover-position.test.ts.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

async function styleguide(page: Page) {
  await page.goto("/styleguide");
  await expect(page.getByTestId("sg-popover-scroll")).toBeVisible({ timeout: 15000 });
  // The standalone MarkdownHelp opens at load; close it so it does not interfere.
  await page.keyboard.press("Escape");
}
const trigger = (page: Page) => page.getByTestId("sg-scroll-menu");
const rows = (page: Page) => page.locator('[data-testid^="sg-scroll-menu-"]');

test.describe("Popover in an overflow container", () => {
  test("a menu near the bottom edge is fully visible, not clipped", async ({ page }) => {
    await styleguide(page);
    await trigger(page).scrollIntoViewIfNeeded();
    await trigger(page).click();
    await expect(rows(page)).toHaveCount(3);
    const vp = page.viewportSize()!;
    const trig = (await trigger(page).boundingBox())!;
    const list = page.locator('[role="menu"][aria-label="Actions for Scrolled"]');
    await expect(list).toBeVisible();
    for (let i = 0; i < 3; i++) {
      const row = rows(page).nth(i);
      const b = (await row.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
      const hit = await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el === top || el.contains(top);
      });
      expect(hit, `row ${i} is covered or clipped`).toBe(true);
    }
    // Opens below the trigger, or above it when there is no room below.
    const first = (await rows(page).first().boundingBox())!;
    const below = first.y >= trig.y + trig.height - 1;
    const lastBox = (await rows(page).last().boundingBox())!;
    expect(below || lastBox.y + lastBox.height <= trig.y + 1).toBe(true);
  });

  test("Escape closes it and focus returns to the trigger", async ({ page }) => {
    await styleguide(page);
    await trigger(page).click();
    await expect(rows(page).first()).toBeVisible();
    await expect(rows(page).first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("arrow keys move between rows", async ({ page }) => {
    await styleguide(page);
    await trigger(page).click();
    await expect(rows(page).first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("sg-scroll-menu-hide")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger(page)).toBeFocused();
  });

  test("an outside click on non-focusable text closes it and focus returns to the trigger", async ({
    page,
  }) => {
    await styleguide(page);
    await trigger(page).click();
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole("heading", { name: "Icons", exact: true }).click();
    await expect(rows(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("an outside click on another focusable button closes it and focus stays there", async ({
    page,
  }) => {
    await styleguide(page);
    await trigger(page).click();
    await expect(rows(page).first()).toBeVisible();
    await page.getByTestId("sg-outside-button").click();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByTestId("sg-outside-button")).toBeFocused();
  });

  test("scrolling the container keeps the open menu attached to the trigger", async ({ page }) => {
    await styleguide(page);
    await trigger(page).scrollIntoViewIfNeeded();
    await page.getByTestId("sg-popover-scroll").evaluate((el) => (el.scrollTop = 0));
    await trigger(page).click();
    await expect(rows(page).first()).toBeVisible();
    const gap = async () => {
      const t = (await trigger(page).boundingBox())!;
      const r = (await rows(page).first().boundingBox())!;
      const l = (await rows(page).last().boundingBox())!;
      // below: first row just under the trigger; flipped: last row just above it
      return Math.min(Math.abs(r.y - (t.y + t.height)), Math.abs(l.y + l.height - t.y));
    };
    expect(await gap()).toBeLessThan(12);
    await page.getByTestId("sg-popover-scroll").evaluate((el) => (el.scrollTop = 20));
    await expect.poll(gap).toBeLessThan(12);
  });
});

test.describe("MarkdownHelp wiring in the essay header", () => {
  async function openEssay(page: Page, viewport?: { width: number; height: number }) {
    await page.setViewportSize({ width: 1280, height: 800 }); // the package picker is hidden on a phone
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
    await page.getByTestId("package-editor-essay").click();
    await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
    if (viewport) await page.setViewportSize(viewport);
  }
  const help = (page: Page) => page.getByRole("region", { name: "Markdown cheat-sheet" });
  const openCount = (page: Page) => page.locator(":popover-open").count();

  test.describe("desktop", () => {
    test("? opens, ? again closes and stays closed", async ({ page }) => {
      await openEssay(page);
      const q = page.getByRole("button", { name: "Markdown help", exact: true });
      await q.click();
      await expect(help(page)).toBeVisible();
      await expect(q).toHaveAttribute("aria-expanded", "true");
      await q.click();
      await expect(help(page)).toBeHidden();
      await page.waitForTimeout(300); // a reopen race would show up here
      await expect(help(page)).toBeHidden();
      await expect(q).toHaveAttribute("aria-expanded", "false");
    });

    test("Escape closes it with focus on ?", async ({ page }) => {
      await openEssay(page);
      const q = page.getByRole("button", { name: "Markdown help", exact: true });
      await q.click();
      await expect(help(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(help(page)).toBeHidden();
      await expect(q).toBeFocused();
    });

    test("an outside click closes it", async ({ page }) => {
      await openEssay(page);
      await page.getByRole("button", { name: "Markdown help", exact: true }).click();
      await expect(help(page)).toBeVisible();
      await page.getByRole("heading", { name: "On small democracy" }).click();
      await expect(help(page)).toBeHidden();
    });
  });

  test("Escape in a paragraph menu closes only the menu: the shell stays zoomed", async ({
    page,
  }) => {
    await openEssay(page);
    const menu = page.locator(".essay-shell__page").getByTestId("paragraph-menu").first();
    await menu.click();
    await page.getByTestId("paragraph-menu-zoom").click();
    await expect(page.getByTestId("zoom-exit")).toBeVisible();
    await menu.click();
    await expect(page.getByTestId("paragraph-menu-add")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("paragraph-menu-add")).toHaveCount(0);
    await expect(page.getByTestId("zoom-exit")).toBeVisible();
    await expect(menu).toBeFocused();
  });

  test.describe("narrow", () => {
    const phone = { width: 390, height: 800 };

    test("choosing help from the overflow menu opens exactly one popover; Escape returns to the menu trigger", async ({
      page,
    }) => {
      await openEssay(page, phone);
      const menu = page.getByTestId("header-menu");
      await expect(page.getByRole("button", { name: "Markdown help", exact: true })).toBeHidden(); // desktop invoker is hidden on a phone
      await menu.click();
      await page.getByTestId("header-menu-help").click();
      await expect(help(page)).toBeVisible();
      await expect(page.getByTestId("header-menu-help")).toBeHidden();
      expect(await openCount(page)).toBe(1);
      await page.keyboard.press("Escape");
      await expect(help(page)).toBeHidden();
      await expect(menu).toBeFocused();
    });

    test("an outside tap closes it", async ({ page }) => {
      await openEssay(page, phone);
      await page.getByTestId("header-menu").click();
      await page.getByTestId("header-menu-help").click();
      await expect(help(page)).toBeVisible();
      await page.getByRole("heading", { name: "On small democracy" }).click();
      await expect(help(page)).toBeHidden();
    });
  });
});

const LONG = "A long reading note that should not be squeezed into a narrow column. ".repeat(8);
/** Hover the first attachment glyph (long text) and return the card, the viewport and its box. */
async function hoverCard(page: Page, width: number, height: number) {
  const { tool, attach } = await connectAgents(page, ESSAY, 1);
  const found = await tool(1, "find", { contentMatch: "First paragraph." });
  const target = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(found))?.[0] as string;
  await attach(1, "Long note", LONG, target);
  await page.setViewportSize({ width, height });
  const glyph = page.locator(".essay-shell__page .glyph").first();
  await expect(glyph).toBeVisible();
  await glyph.hover();
  const card = page.locator(".hover-card").first();
  await expect(card).toBeVisible();
  return { card, box: (await card.boundingBox())! };
}

test.describe("HoverCard width (srs-web#422)", () => {
  test("1440: a long-text card is at least 20rem, in the viewport, and clear of the rail", async ({
    page,
  }) => {
    const { card, box } = await hoverCard(page, 1440, 900);
    const rem = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    );
    console.log(`hover card width @1440: ${box.width}px`);
    expect(box.width).toBeGreaterThanOrEqual(20 * rem - 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    const rail = await page.getByTestId("rail").boundingBox();
    if (rail) expect(box.x + box.width <= rail.x || box.x >= rail.x + rail.width).toBe(true);
    await expect(card).toBeVisible();
  });
  test("390: the card fits within the viewport", async ({ page }) => {
    const { box } = await hoverCard(page, 390, 800);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
});
