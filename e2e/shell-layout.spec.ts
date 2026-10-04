import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openInspectorDrawer, openNavDrawer, openPackageEditor } from "./helpers.js";

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

// Until Generic's nav is a drawer (Phase 5) the phone picker is the mobile button.
async function openEditor(page: Page, id: "governance" | "guides") {
  const desktop = page.getByTestId(`package-editor-${id}`);
  await ((await desktop.isVisible())
    ? desktop
    : page.getByTestId(`package-editor-mobile-${id}`)
  ).click();
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
    const w = await page
      .locator(".canvas")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
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

async function openGuides(page: Page) {
  await load(page, "muSrs.srsj");
  await openEditor(page, "guides");
  await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
}

test.describe("drawers at 375px", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("Governance: the hamburger opens the nav drawer; choosing an item closes it and shows it; focus returns", async ({
    page,
  }) => {
    await load(page, "gallery.srsj");
    await openEditor(page, "governance");
    await expect(page.getByTestId("nav-trigger")).toHaveCount(1);
    await expect(page.getByTestId("shell-drawer-nav")).toBeHidden();
    await page.getByTestId("nav-trigger").click();
    const drawer = page.getByTestId("shell-drawer-nav");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: /Decision Log/ }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();
    await expect(page.getByTestId("nav-trigger")).toBeFocused();
  });

  test("Governance migrations view renders exactly one nav-trigger", async ({ page }) => {
    await load(page, "gallery.srsj");
    await openEditor(page, "governance");
    await page.getByTestId("nav-trigger").click();
    await page.getByTestId("shell-drawer-nav").getByText("Migrations").click();
    await expect(page.getByTestId("nav-trigger")).toHaveCount(1);
    await expect(page.getByTestId("inspector-trigger")).toHaveCount(1);
  });

  test("the inspector opens as a drawer: Escape and an outside click close it, focus returns, Tab stays inside", async ({
    page,
  }) => {
    await load(page, "gallery.srsj");
    await openEditor(page, "governance");
    const trigger = page.getByTestId("inspector-trigger");
    await trigger.click();
    const drawer = page.getByTestId("shell-drawer-inspector");
    await expect(drawer).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      // A modal dialog may hand focus to the browser's own UI (activeElement = body) but never to the
      // inert page behind it.
      const ok = await page.evaluate(
        () =>
          document.activeElement === document.body ||
          !!document.activeElement?.closest('[data-testid="shell-drawer-inspector"]')
      );
      expect(ok, `tab ${i} stays inside`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(10, 300); // the scrim, outside the panel
    await expect(drawer).toBeHidden();
  });

  test("the agent dock never covers an open drawer", async ({ page }) => {
    await load(page, "gallery.srsj");
    await openEditor(page, "governance");
    const dock = page.locator(".mcp-dock");
    const hasDock = (await dock.count()) > 0;
    await page.getByTestId("nav-trigger").click();
    const drawer = page.getByTestId("shell-drawer-nav");
    await expect(drawer).toBeVisible();
    if (hasDock) {
      const box = (await dock.first().boundingBox())!;
      const inDrawer = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return !!el?.closest('[data-testid="shell-drawer-nav"]');
        },
        [box.x + box.width / 2, box.y + box.height / 2]
      );
      expect(inDrawer).toBe(true);
    }
  });

  test("Guides: both triggers, the nav drawer, and exactly one inspector button", async ({
    page,
  }) => {
    await openGuides(page);
    await expect(page.getByTestId("guides-preview-toggle")).toBeHidden();
    await expect(page.getByTestId("inspector-trigger")).toHaveCount(1);
    await openNavDrawer(page);
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("shell-drawer-nav")).toBeHidden();
    await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });
    await openInspectorDrawer(page);
    await expect(page.getByTestId("guides-preview-pane")).toBeVisible();
  });
});
