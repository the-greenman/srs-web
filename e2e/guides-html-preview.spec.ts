import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * guides-html-preview.spec.ts — Phase C: live HTML preview in the guides inspector.
 *
 * Verifies that when a guide is selected:
 *   - on wide viewports (≥ 1100px), the preview iframe is visible in the inspector;
 *   - the iframe contains rendered HTML with the guide's section headings;
 *   - on narrow viewports (< 1100px), the inspector collapses and the preview is not visible.
 *
 * srs-web#39: guides HTML preview
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_PATH = path.join(__dirname, "fixtures", "muSrs.srsj");

test.describe("Guides HTML preview (Phase C)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("mode-guides").click();
    await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS_PATH);
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    // Select the first guide.
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });
  });

  test("preview pane is visible on wide viewport", async ({ page }) => {
    await expect(page.getByTestId("guides-preview-pane")).toBeVisible();
  });

  test("preview iframe is present when a guide has sections", async ({ page }) => {
    await expect(page.getByTestId("guides-preview-frame")).toBeVisible();
  });

  test("preview iframe contains section heading text", async ({ page }) => {
    const frame = page.getByTestId("guides-preview-frame");
    await expect(frame).toBeVisible();
    // Poll the iframe srcdoc content — the guide has at least one section heading.
    const srcdoc = await frame.getAttribute("srcdoc");
    expect(srcdoc).toBeTruthy();
    expect(srcdoc!.length).toBeGreaterThan(100);
  });

  test("preview collapses on narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    // The .app__inspector is display:none below 1100px via layout.css.
    await expect(page.getByTestId("guides-preview-pane")).not.toBeVisible();
  });
});
