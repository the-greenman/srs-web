import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";
import { openMenu } from "./helpers";

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
  // nothing in a new essay is a paragraph yet, so nothing in the list is a link (srs-web#726)
  await expect(panel.getByRole("button")).toHaveCount(0);

  // a paragraph is a link, and following it closes the list and focuses that paragraph
  await page.getByTestId("changes-toggle").click();
  await page.getByTestId("first-paragraph").click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.getByTestId("changes-toggle").click();
  await panel.getByRole("button").click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-focus-key^="body:"]').first()).toBeFocused();

  // Escape closes the list
  await page.getByTestId("changes-toggle").click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // the generic shell: a changed record is a link, and following it shows it in the inspector
  await openMenu(page, "Go");
  await page.getByTestId("toolbar-explorer").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible();
  await page.getByTestId("changes-toggle").click();
  await panel.getByRole("button", { name: "Untitled essay" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Record" }).getByRole("heading", { name: "Untitled essay" })).toBeVisible();
});
