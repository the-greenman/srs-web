import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openInspectorDrawer, openPackageEditor } from "./helpers";

/**
 * site-editor.spec.ts — srs-web#680 B1 (ADR-029): the site editor over site.srsj (website package
 * 0.2.1; pages home, about and scratch; home has drafts; a menu). Edit a field in place and undo it,
 * take a block to the Bin and restore it, publish a page as a draft, edit the menu (srs-web#681),
 * and fit a phone.
 */
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "site.srsj");

async function openSite(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await openPackageEditor(page, "site");
  await expect(page.getByTestId("site-shell")).toBeVisible();
}

test("edit a page of the site: a field, undo, the Bin, publishing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openSite(page);

  const pagePicker = page.getByTestId("site-page");
  await expect(pagePicker.locator("option")).toHaveCount(3);
  await pagePicker.selectOption({ label: "Home (/home)" });

  const headline = page.getByRole("textbox", { name: "Headline" });
  await expect(headline).toHaveText("Decisions power change.");
  await headline.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Together.");
  await page.getByRole("textbox", { name: "Supporting copy" }).first().click(); // leave the field: it commits
  await expect(headline).toHaveText("Decisions power change. Together.");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+z");
  await expect(headline).toHaveText("Decisions power change.");

  // Leaving a field commits it and the next field keeps the caret: the canvas is not rebuilt.
  const support = page.getByRole("textbox", { name: "Supporting copy" }).first();
  await headline.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await support.click();
  await page.keyboard.type("x");
  await expect(support).toBeFocused();
  await expect(headline).toHaveText("Decisions power change.!");

  // The FAQ group to the Bin, with its items, and back.
  const questions = page
    .getByRole("textbox", { name: "Section heading" })
    .filter({ hasText: "Questions." });
  await questions.click();
  await openInspectorDrawer(page);
  await page.getByTestId("site-to-bin").click();
  await expect(questions).toHaveCount(0);
  const bin = page.locator('[data-feature="site.bin"]');
  await bin
    .getByRole("button", { name: /Restore/ })
    .first()
    .click();
  await expect(questions).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Faq question" })).toHaveCount(2);

  // A draft dragged from the Drafts tray onto the page.
  const drafts = page.locator('[data-feature="site.drafts"]');
  await drafts.getByText("Another opening.").dragTo(page.locator(".site-block__type").first());
  await expect(
    page.getByRole("textbox", { name: "Headline" }).filter({ hasText: "Another opening." })
  ).toHaveCount(1);
  await expect(drafts.getByText("Another opening.")).toHaveCount(0);

  // Add block: a quote after the selected block.
  await page.getByTestId("site-add-block").click();
  await page.getByRole("menuitem", { name: /Quote/ }).click();
  await expect(page.getByRole("textbox", { name: "Quote text" })).toHaveCount(1);

  // Page settings: Esc deselects; publish as a draft, and it is still a draft after leaving the page.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Escape");
  await pagePicker.selectOption({ label: "Scratch (/scratch)" });
  await openInspectorDrawer(page);
  const publish = page.getByTestId("site-publish");
  await expect(publish).toHaveValue("no");
  await publish.selectOption("draft");
  await pagePicker.selectOption({ label: "Home (/home)" });
  await pagePicker.selectOption({ label: "Scratch (/scratch)" });
  await expect(page.getByTestId("site-publish")).toHaveValue("draft");

  expect(errors).toEqual([]);
});

test("edit the menu: a page as a dropdown entry, renamed, reordered, back to the bar, undone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openSite(page);
  await openInspectorDrawer(page);
  const menu = page.locator('[data-feature="site.menu"]');
  const items = menu.getByTestId("site-menu-item");
  const labels = menu.getByRole("textbox", { name: "Menu label" });
  await expect(labels).toHaveCount(4);

  await menu.getByTestId("site-menu-page").selectOption({ label: "Scratch (/scratch)" });
  await menu.getByTestId("site-menu-add-page").click();
  await expect(labels).toHaveCount(5);
  await expect(labels.nth(4)).toHaveValue("Scratch");

  await menu.getByRole("button", { name: "Put Scratch in the dropdown above" }).click();
  await expect(items.nth(4)).toHaveAttribute("data-depth", "1");

  await labels.nth(4).fill("Notes");
  await labels.nth(4).press("Enter");
  await menu.getByRole("button", { name: "Move Notes up" }).click();
  await expect(labels.nth(3)).toHaveValue("Notes");
  await expect(labels.nth(4)).toHaveValue("Recording");

  await menu.getByRole("button", { name: "Move Notes to the bar" }).click();
  await expect(menu.locator('[data-testid="site-menu-item"][data-depth="1"]')).toHaveCount(1);

  // Undo walks it all back, the add included.
  // Focus is on a menu button, not a field, so Ctrl+Z is the shell's undo (the drawer hides the bar).
  for (let i = 0; i < 5; i++) await page.keyboard.press("Control+z");
  await expect(labels).toHaveCount(4);
  await expect(labels.nth(3)).toHaveValue("Recording");

  expect(errors).toEqual([]);
});

test("the site editor fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openSite(page);
  await expect(page.getByRole("textbox", { name: "Section heading" }).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
