import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";

/**
 * The "Unsaved changes" status opens the list of changes. The list sits inside the toolbar's status,
 * whose children clip their overflow for the ellipsis, so it can be in the DOM and still unseen:
 * toBeVisible does not notice clipping, so this asks what is actually painted at the panel's centre.
 */
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const paintedAtCentre = (panel: Locator) =>
  panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });

test("clicking Unsaved changes shows the list, not a clipped one", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(path.join(FIXTURES, "essay-1.5.0.srsj"));
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });

  await page.getByTestId("package-upgrade-notice-action").click();
  await page.getByTestId("upgrade-apply").click();
  await page.getByTestId("changes-toggle").click();

  const panel = page.getByTestId("changes-panel");
  await expect(panel).toBeAttached();
  await page.screenshot({ path: process.env.SHOT_CHANGES ?? "test-results/changes-panel.png" });
  expect(await paintedAtCentre(panel)).toBe(true);

  // the essay shell, whose page sits directly under the bar
  await page.getByTestId("changes-toggle").click();
  await page.getByTestId("package-editor-essay").click();
  await page.getByRole("button", { name: "New essay" }).click();
  await expect(page.getByRole("heading", { name: "Untitled essay" })).toBeVisible();
  await page.getByTestId("changes-toggle").click();
  await page.screenshot({ path: process.env.SHOT_ESSAY ?? "test-results/changes-panel-essay.png" });
  expect(await paintedAtCentre(panel)).toBe(true);
});
