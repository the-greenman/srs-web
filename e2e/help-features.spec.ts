import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { NO_ACTOR } from "../playwright.config";

/**
 * help-features.spec.ts — srs-web#641: the essay's help features are on the page, through elements,
 * Button, Panel and the Toolbar's action data, so ui_highlight can find them.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-pool.srsj");
test.use({ storageState: NO_ACTOR });

test("the essay presents its help features", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.locator('[data-feature="essay.name-gate"]')).toBeVisible();
  for (const id of ["essay.paragraphs", "essay.layers", "essay.sources", "shell.connect-ai"])
    await expect(page.locator(`[data-feature="${id}"]`)).toHaveCount(1);
});

test("a new essay's Save presents shell.save (a loaded .srsj offers no Save)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("create-name").fill("Untitled essay");
  await page.getByTestId("create-editor-essay").check();
  await page.getByTestId("create-repository").click();
  await expect(page.locator('[data-feature="shell.save"]')).toHaveCount(1);
});
