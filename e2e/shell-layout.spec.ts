import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openPackageEditor } from "./helpers.js";

/**
 * shell-layout.spec.ts — the shared page frame (#424): the window never scrolls, each column scrolls
 * itself, nav and inspector widths are resizable and persisted, Wide is one per-viewer switch.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => path.join(__dirname, "fixtures", n);

async function load(page: Page, name: string) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(fixture(name));
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 10000 });
}

async function openGovernance(page: Page) {
  await load(page, "gallery.srsj");
  await openPackageEditor(page, "governance");
  await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test.describe("independent scroll", () => {
  // A short window so the nav overflows and has something to scroll.
  test.use({ viewport: { width: 1440, height: 380 } });

  test("Governance: clicking the last nav item leaves the window and the nav's own scroll alone", async ({
    page,
  }) => {
    await openGovernance(page);
    const scroller = page.locator(".app__nav .nav__scroll");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.locator(".app__nav .nav__item").last().click();
    await expect.poll(() => scrollY(page)).toBe(0);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
    const fits = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight
    );
    expect(fits).toBe(true);
  });

  test("Governance: the migrations view scrolls inside .workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 260 });
    await openGovernance(page);
    await page.locator(".app__nav .nav__item", { hasText: "Migrations" }).click();
    const ws = page.locator(".app__main > .workspace");
    await expect(ws).toBeVisible();
    expect(await ws.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    expect(await ws.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const fits = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight
    );
    expect(fits).toBe(true);
  });
});

test.describe("Wide", () => {
  test("a stored Wide never changes a shell without the toggle (Governance stays 820px, compact)", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("srs-web.margin", "expanded"));
    await page.setViewportSize({ width: 1920, height: 1000 });
    await openGovernance(page);
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "compact");
    const w = await page.locator(".canvas").first().evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(w)).toBe(820);
  });
});

test.describe("resizable columns", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const width = (page: Page, sel: string) =>
    page.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().width));

  test("nav: drag and keyboard change the width; it persists across a reload", async ({ page }) => {
    await openGovernance(page);
    const start = await width(page, ".app__nav");
    const box = (await page.getByTestId("nav-resize").boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, y, { steps: 5 });
    await page.mouse.up();
    expect(await width(page, ".app__nav")).toBe(start + 80);
    await page.getByTestId("nav-resize").focus();
    await page.keyboard.press("ArrowRight");
    expect(await width(page, ".app__nav")).toBe(start + 96);

    await openGovernanceAfterReload(page);
    expect(await width(page, ".app__nav")).toBe(start + 96);
  });

  test("inspector: drag and keyboard change the width; it persists across a reload", async ({
    page,
  }) => {
    await openGovernance(page);
    const start = await width(page, ".app__inspector");
    const box = (await page.getByTestId("inspector-resize").boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, y, { steps: 5 });
    await page.mouse.up();
    expect(await width(page, ".app__inspector")).toBe(start + 80);
    await page.getByTestId("inspector-resize").focus();
    await page.keyboard.press("ArrowLeft");
    expect(await width(page, ".app__inspector")).toBe(start + 96);

    await openGovernanceAfterReload(page);
    expect(await width(page, ".app__inspector")).toBe(start + 96);
  });

  test("the main column cannot be dragged to zero", async ({ page }) => {
    await openGovernance(page);
    await page.getByTestId("nav-resize").focus();
    await page.keyboard.press("End");
    expect(await width(page, ".app__nav")).toBeLessThanOrEqual(384);
    expect(await width(page, ".app__main")).toBeGreaterThan(400);
  });
});

// Nothing but localStorage survives a reload: re-upload the fixture and reopen the editor.
async function openGovernanceAfterReload(page: Page) {
  await page.reload();
  await openGovernance(page);
}
