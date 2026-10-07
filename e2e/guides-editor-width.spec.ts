import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { navItem, newRecord, openPackageEditor, setWide } from "./helpers.js";

/**
 * guides-editor-width.spec.ts — editor forms fill their container (#463).
 *
 * Forms carry no max-width of their own: the container caps the width (`.canvas`, capped by the one
 * `--content-max` token, 46rem; 80rem with Wide on), so a form is exactly as wide as its canvas.
 *
 * srs-web#39: resizable inspector + flexible editor width
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_PATH = path.join(__dirname, "fixtures", "muSrs.srsj");
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

async function loadGuidesAndSelectFirst(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS_PATH);
  await openPackageEditor(page, "guides");
  await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("guides-guide-item").first().click();
  await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });
}

const width = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
const REM = 16;
/** Guides wraps its forms in a 1rem-padded panel: the form fills the canvas less that padding. */
async function expectFills(page: Page, sel: string, pad = 0) {
  const w = await width(page, sel);
  const c = await width(page, ".canvas");
  expect(c - w).toBeGreaterThanOrEqual(0);
  expect(c - w).toBeLessThanOrEqual(pad * 2 * REM);
  return w;
}

test.describe("Editor forms fill their container", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
  });

  test("Guides SectionForm: no own cap, fills the canvas; Wide widens both past 46rem", async ({ page }) => {
    await loadGuidesAndSelectFirst(page);
    await page.getByTestId("guides-section-open").first().click();
    const form = page.getByTestId("section-form");
    await expect(form).toBeVisible({ timeout: 3000 });
    expect(await form.evaluate((el) => getComputedStyle(el).maxWidth)).toBe("none");
    const off = await expectFills(page, '[data-testid="section-form"]', 1);
    expect(off).toBeLessThanOrEqual(46 * REM);
    await setWide(page, true);
    const on = await expectFills(page, '[data-testid="section-form"]', 1);
    expect(on).toBeGreaterThan(46 * REM);
  });

  test("Guides root RecordForm: no own cap, fills the canvas", async ({ page }) => {
    await loadGuidesAndSelectFirst(page);
    await page.getByTestId("guides-edit-guide").click();
    const form = page.getByTestId("record-form");
    await expect(form).toBeVisible({ timeout: 3000 });
    expect(await form.evaluate((el) => getComputedStyle(el).maxWidth)).toBe("none");
    const w = await expectFills(page, '[data-testid="record-form"]', 1);
    expect(w).toBeLessThanOrEqual(46 * REM);
  });

  test("Governance RecordForm: fills the canvas and is at most 46rem with Wide off", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(GALLERY_PATH);
    await openPackageEditor(page, "governance");
    await expect(navItem(page, /Articles/)).toBeVisible({ timeout: 5000 });
    await newRecord(page);
    await expect(page.getByTestId("record-form")).toBeVisible({ timeout: 3000 });
    const w = await expectFills(page, '[data-testid="record-form"]');
    expect(w).toBeLessThanOrEqual(46 * REM);
  });

  test("SectionForm stays reachable on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await loadGuidesAndSelectFirst(page);
    await page.getByTestId("guides-section-open").first().click();
    await expect(page.getByTestId("section-form")).toBeVisible({ timeout: 3000 });
  });
});
