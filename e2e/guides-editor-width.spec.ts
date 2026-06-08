import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * guides-editor-width.spec.ts — flexible-width editor forms in the guides shell.
 *
 * Verifies that SectionForm and RecordForm render with the record-form--wide class
 * (no max-width cap) when opened inside the guides Workspace, so form fields fill
 * all available horizontal space as the inspector is resized.
 *
 * srs-web#39: resizable inspector + flexible editor width
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_PATH = path.join(__dirname, "fixtures", "muSrs.srsj");
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

async function loadGuidesAndSelectFirst(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("mode-guides").click();
  await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS_PATH);
  await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("guides-guide-item").first().click();
  await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });
}

test.describe("Guides editor flexible width", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  test("SectionForm renders with record-form--wide class in guides shell", async ({ page }) => {
    await loadGuidesAndSelectFirst(page);

    // Clicking a section row opens the edit form.
    await page.getByTestId("guides-section-open").first().click();

    const form = page.getByTestId("section-form");
    await expect(form).toBeVisible({ timeout: 3000 });
    await expect(form).toHaveClass(/record-form--wide/);
  });

  test("SectionForm has no max-width constraint in guides shell", async ({ page }) => {
    await loadGuidesAndSelectFirst(page);

    await page.getByTestId("guides-section-open").first().click();

    const form = page.getByTestId("section-form");
    await expect(form).toBeVisible({ timeout: 3000 });

    const maxWidth = await form.evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth).toBe("none");
  });

  test("RecordForm for guide root renders with record-form--wide class", async ({ page }) => {
    await loadGuidesAndSelectFirst(page);

    await page.getByTestId("guides-edit-guide").click();

    const form = page.getByTestId("record-form");
    await expect(form).toBeVisible({ timeout: 3000 });
    await expect(form).toHaveClass(/record-form--wide/);
  });

  test("RecordForm for guide root has no max-width constraint", async ({ page }) => {
    await loadGuidesAndSelectFirst(page);

    await page.getByTestId("guides-edit-guide").click();

    const form = page.getByTestId("record-form");
    await expect(form).toBeVisible({ timeout: 3000 });

    const maxWidth = await form.evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth).toBe("none");
  });

  test("governance RecordForm retains constrained max-width", async ({ page }) => {
    // Governance mode does not pass `wide`, so the form must keep its default max-width.
    await page.goto("/");
    await expect(page.getByTestId("mode-governance")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("mode-governance").click();

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });

    await page.locator("button.topbar__new").click();

    const form = page.getByTestId("record-form");
    await expect(form).toBeVisible({ timeout: 3000 });

    // Without `wide`, max-width should be a pixel value (42rem), not 'none'.
    const maxWidth = await form.evaluate((el) => getComputedStyle(el).maxWidth);
    expect(maxWidth).not.toBe("none");
  });

  test("SectionForm is visible and wide on narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await loadGuidesAndSelectFirst(page);

    // On narrow screens the inspector hides, but the form itself must still be accessible.
    await page.getByTestId("guides-section-open").first().click();

    const form = page.getByTestId("section-form");
    await expect(form).toBeVisible({ timeout: 3000 });
    // The wide class is present regardless of viewport — it controls the form's own max-width.
    await expect(form).toHaveClass(/record-form--wide/);
  });
});
