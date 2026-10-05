import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openInspectorDrawer, openNavDrawer, openPackageEditor, openMenus, navItem } from "./helpers.js";

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
  await expect(navItem(page, /Articles/)).toBeVisible({ timeout: 5000 });
}

// The package picker is in the nav; at phone width that is the drawer.
async function openEditor(page: Page, id: "governance" | "guides" | "essay") {
  await openPackageEditor(page, id);
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
    await drawer.locator(".nav__item").filter({ hasText: /Decision Log/ }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();
    await expect(page.getByTestId("nav-trigger")).toBeFocused();
  });

  test("Governance: both triggers sit inside the viewport", async ({
    page,
  }) => {
    await load(page, "gallery.srsj");
    await openEditor(page, "governance");
    for (const id of ["nav-trigger", "inspector-trigger"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(375);
    }
  });

  test("Governance: the bar is one row, with no more than the Save primary", async ({ page }) => {
    await load(page, "gallery.srsj");
    await openEditor(page, "governance");
    const bar = page.getByTestId("toolbar");
    expect((await bar.boundingBox())!.height).toBeLessThan(72);
    // A local file is not writable here: no Save, and the reason shows under the bar. Never more than one primary.
    expect(await bar.locator('[data-part="primary"]').count()).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("readonly-reason")).toBeVisible();
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
    expect((await page.getByTestId("toolbar").boundingBox())!.height).toBeLessThan(72);
    await expect(page.getByTestId("inspector-trigger")).toHaveCount(1);
    await openNavDrawer(page);
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("shell-drawer-nav")).toBeHidden();
    await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });
    await openInspectorDrawer(page);
    await expect(page.getByTestId("guides-preview-pane")).toBeVisible();
  });
});

async function openEssay(page: Page) {
  await load(page, "essay.srsj");
  await openEditor(page, "essay");
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

async function setWide(page: Page, on: boolean) {
  await page.getByTestId("toolbar-menu-view").click();
  const item = page.getByTestId("margin-variant");
  if ((await item.getAttribute("aria-checked")) !== String(on)) await item.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).toHaveAttribute("data-margin", on ? "expanded" : "compact");
}

const pageWidth = (page: Page) =>
  page.locator(".essay-shell__page").evaluate((el) => Math.round(el.getBoundingClientRect().width));

test.describe("Essay on the frame: Wide", () => {
  test.use({ viewport: { width: 1920, height: 1000 } });

  test("Wide widens the page past 46rem; off is the 46rem column; it persists across a reload", async ({
    page,
  }) => {
    await openEssay(page);
    expect(await pageWidth(page)).toBeLessThanOrEqual(46 * 16 + 1);
    await setWide(page, true);
    expect(await pageWidth(page)).toBeGreaterThan(1000); // the cap is 80rem (1280px), not just the margin column growing;
    await setWide(page, false);
    expect(await pageWidth(page)).toBeLessThanOrEqual(46 * 16 + 1);
    await setWide(page, true);

    await page.reload();
    await openEssay(page);
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "expanded");
    expect(await pageWidth(page)).toBeGreaterThan(1000); // the cap is 80rem (1280px), not just the margin column growing;
  });
});

test.describe("Essay on the frame: geometry", () => {
  test("1280 with Wide on: no horizontal overflow in main or the workspace; the margin stays clear of the inspector", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEssay(page);
    await setWide(page, true);
    for (const sel of [".app__main", ".app__main > .workspace"]) {
      const over = await page.locator(sel).evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(over, `${sel} overflows horizontally`).toBe(false);
    }
    const insp = (await page.locator(".app__inspector").boundingBox())!;
    const pageBox = (await page.locator(".essay-shell__page").boundingBox())!;
    expect(pageBox.x + pageBox.width).toBeLessThanOrEqual(insp.x + 1);
  });

  test("375: the bar is one row with the inspector trigger and the rail opens in the drawer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openEssay(page);
    expect((await page.getByTestId("toolbar").boundingBox())!.height).toBeLessThan(72);
    await expect(page.getByTestId("inspector-trigger")).toBeVisible();
    await expect(page.getByTestId("nav-trigger")).toHaveCount(0); // the essay has no nav (#425)
    await page.getByTestId("inspector-trigger").click();
    await expect(page.getByTestId("shell-drawer-inspector").getByTestId("rail")).toBeVisible();
  });
});

const widthOf = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));

test.describe("Generic on the frame", () => {
  test("clicking the last nav item leaves the window and the nav's own scroll alone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 380 });
    await load(page, "muSrs.srsj");
    const scroller = page.locator(".app__nav .nav__scroll");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);
    // the last navigation item (the package editors below it switch shells)
    await page.locator('.app__nav .nav__item:not([data-testid^="package-editor"])').last().click();
    await expect.poll(() => scrollY(page)).toBe(0);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true
    );
  });

  test("Wide in Governance sets data-margin and persists across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await openGovernance(page);
    await setWide(page, true);
    await openGovernanceAfterReload(page);
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "expanded");
  });

  test("Wide is one switch across editors: Essay -> Generic -> Essay keeps it; Generic widens past 46rem", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await load(page, "essay.srsj");
    expect(await widthOf(page, ".generic-page")).toBeLessThanOrEqual(46 * 16 + 1);
    await openEditor(page, "essay");
    await setWide(page, true);
    expect(await pageWidth(page)).toBeGreaterThan(1000); // the cap is 80rem (1280px), not just the margin column growing;

    await page.getByTestId("toolbar-menu-go").click();
    await page.getByTestId("toolbar-explorer").click(); // back to the generic shell, same repository
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible();
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "expanded");
    expect(await widthOf(page, ".generic-page")).toBeGreaterThan(1000); // the cap is 80rem (1280px), not just the margin column growing;

    await openEditor(page, "essay");
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "expanded");
    await page.getByTestId("toolbar-menu-go").click();
    await page.getByTestId("toolbar-explorer").click();
    await setWide(page, false); // and the other way round
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "compact");
    expect(await widthOf(page, ".generic-page")).toBeLessThanOrEqual(46 * 16 + 1);

    await setWide(page, true);
    await page.reload(); // nothing but localStorage survives: re-upload and reopen
    await load(page, "essay.srsj");
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "expanded");
  });

  test.describe("at 375px", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("the hamburger opens the drawer; choosing Records closes it and the main pane shows it; an editor opens from it", async ({
      page,
    }) => {
      // gallery, not essay: the Records list of essay.srsj throws each_key_duplicate on origin/main too
      await load(page, "gallery.srsj");
      await expect(page.getByTestId("shell-drawer-nav")).toBeHidden();
      await page.getByTestId("nav-trigger").click();
      const drawer = page.getByTestId("shell-drawer-nav");
      await expect(drawer).toBeVisible();
      await drawer.getByRole("button", { name: "Records", exact: true }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole("heading", { name: "Records", level: 1 })).toBeVisible();
      await expect(page.getByTestId("nav-trigger")).toBeFocused();

      await page.getByTestId("nav-trigger").click();
      await page.getByTestId("package-editor-governance").click();
      await expect(drawer).toBeHidden();
      await expect(page.getByTestId("nav-trigger")).toHaveCount(1); // now the Governance shell, same frame
    });

    test("choosing a record from the nav drawer opens the inspector drawer showing that record", async ({
      page,
    }) => {
      await load(page, "gallery.srsj");
      await page.getByTestId("nav-trigger").click();
      const nav = page.getByTestId("shell-drawer-nav");
      await nav.getByRole("button", { name: "Records", exact: true }).click();
      await expect(nav).toBeHidden();
      await page.locator(".generic-record-row").first().click();
      const insp = page.getByTestId("shell-drawer-inspector");
      await expect(insp).toBeVisible();
      await expect(insp.locator(".generic-inspector-head")).toBeVisible();
      // and a member picked straight from the nav drawer's structure tree
      await insp.press("Escape");
      await expect(insp).toBeHidden();
      await page.getByTestId("nav-trigger").click();
      await nav.getByRole("button", { name: "Toggle Articles" }).click();
      await expect(nav).toBeVisible(); // a disclosure leaves the drawer open
      await nav.locator(".generic-tree-members button").first().click();
      await expect(nav).toBeHidden();
      await expect(insp).toBeVisible();
      await expect(insp.locator(".generic-inspector-head")).toBeVisible();
    });

    // The Layers row menu is the touch reorder control (hover: none only), so this one runs as a touch phone.
    test.describe("touch", () => {
      test.use({ isMobile: true, hasTouch: true });
      test("an ActionMenu inside a drawer: the first Escape closes only the menu, the second closes the drawer", async ({
        page,
      }) => {
        await openEssay(page);
        await page.getByTestId("inspector-trigger").click();
        const drawer = page.getByTestId("shell-drawer-inspector");
        await expect(drawer).toBeVisible();
        const layers = drawer.locator("details.panel", { hasText: "Layers" }).first();
        if (!(await layers.evaluate((el: HTMLDetailsElement) => el.open)))
          await layers.locator("summary").first().click();
        await drawer.getByTestId("layer-menu").first().click();
        const menu = openMenus(page);
        await expect(menu).toHaveCount(1);
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(drawer).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
      });
    });
  });
});

test.describe("Generic explorer: one scroller per column", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Anything inside .workspace that scrolls itself, minus the two documented exceptions: the sandboxed
  // preview iframe (cannot report its height) and the relation map's sideways pan.
  const nested = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".app__main .workspace *")]
        .filter((e) => !e.closest("iframe, .generic-graph"))
        .filter((e) => {
          const s = getComputedStyle(e);
          return ["auto", "scroll"].includes(s.overflowY) && e.scrollHeight > e.clientHeight;
        })
        .map((e) => `${e.tagName}.${e.className}`)
    );

  test("a composition preview is reading-height, not crushed, and nothing nests a scroller", async ({
    page,
  }) => {
    await load(page, "muSrs.srsj");
    const docs = page.locator('.nav__group[data-part="documents"] button');
    const n = await docs.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await docs.nth(i).click();
      await expect(page.locator("iframe, .document-editor-panel").first()).toBeVisible();
      expect(await nested(page), `composition ${i}`).toEqual([]);
      const panel = page.getByTestId("document-editor-panel");
      if (await panel.count()) {
        // the blueprint editor flows at its content height (its inline block previews are small by design)
        expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      } else {
        expect((await page.locator("iframe").first().boundingBox())!.height).toBeGreaterThan(540);
      }
    }
  });

  test("a preview-only composition (gallery) is reading-height", async ({ page }) => {
    await load(page, "gallery.srsj");
    await expect(page.locator("iframe").first()).toBeVisible();
    expect((await page.locator("iframe").first().boundingBox())!.height).toBeGreaterThan(900 * 0.6);
    expect(await nested(page)).toEqual([]);
  });

  test("the Records list view nests no scroller", async ({ page }) => {
    await load(page, "muSrs.srsj");
    await page.getByRole("button", { name: "Records", exact: true }).click();
    await expect(page.locator(".generic-record-row").first()).toBeVisible();
    expect(await nested(page)).toEqual([]);
  });
});
