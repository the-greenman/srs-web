import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { VISUAL_DEFAULT } from "../playwright.config";
import { closeMenus, openMenu } from "./helpers";

/**
 * srs-web#752 (decision 3f6f215c): essays edit visually by default, and View > Edit as markdown switches
 * this browser to the source and back. Markdown help is offered only in markdown mode.
 * Fixture essay.srsj: "First paragraph." / "Second paragraph." / "Third paragraph.".
 */
test.use({ storageState: VISUAL_DEFAULT });

const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const item = (page: Page, n: number) => page.locator(".essay-shell__page .block-stack__item").nth(n);
const body = (page: Page, n: number) => item(page, n).locator('[data-focus-key^="body:"]');
const visual = (page: Page, n: number) => item(page, n).locator(".ProseMirror");
const source = (page: Page, n: number) => item(page, n).locator('[contenteditable="plaintext-only"]');

async function openEssay(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

async function editAsMarkdown(page: Page): Promise<string | null> {
  await openMenu(page, "View");
  return page.getByTestId("edit-markdown").getAttribute("aria-checked");
}

/** Leave the open paragraph: a click on the page margin. */
const leave = (page: Page) => page.locator("body").click({ position: { x: 5, y: 5 } });

test("a paragraph opens in the visual editor, with no Markdown help, by default", async ({ page }) => {
  await openEssay(page);
  await expect(page.getByTestId("toolbar-help")).toHaveCount(0);
  await body(page, 0).click();
  await expect(visual(page, 0)).toBeFocused();
  await expect(source(page, 0)).toHaveCount(0);
  expect(await editAsMarkdown(page)).toBe("false");
});

test("Edit as markdown shows the source and Markdown help, survives a reload, and switches back", async ({
  page,
}) => {
  await openEssay(page);
  expect(await editAsMarkdown(page)).toBe("false");
  await page.getByTestId("edit-markdown").click();
  await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "true");
  await closeMenus(page);
  await expect(page.getByTestId("toolbar-help")).toBeVisible();
  await body(page, 0).click();
  await expect(source(page, 0)).toBeFocused();
  await expect(source(page, 0)).toHaveText("First paragraph.");
  await leave(page);

  await page.reload();
  await openEssay(page);
  await expect(page.getByTestId("toolbar-help")).toBeVisible();
  expect(await editAsMarkdown(page)).toBe("true");
  await page.getByTestId("edit-markdown").click();
  await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "false");
  await closeMenus(page);
  await expect(page.getByTestId("toolbar-help")).toHaveCount(0);
  await body(page, 0).click();
  await expect(visual(page, 0)).toBeFocused();
});

test("switching while a paragraph is open keeps what was typed", async ({ page }) => {
  await openEssay(page);
  await body(page, 0).click();
  await expect(visual(page, 0)).toBeFocused();
  await page.waitForTimeout(100); // the editor places its caret a frame after focus (trap 32f714fd)
  await page.keyboard.press("End");
  await page.keyboard.type(" More");
  await editAsMarkdown(page);
  await page.getByTestId("edit-markdown").click();
  await closeMenus(page);
  await body(page, 0).click();
  await expect(source(page, 0)).toHaveText("First paragraph. More");
});

test("at phone width the switch is in the one overflow menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); // the package picker is hidden on a phone
  await openEssay(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("header-menu").click();
  await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("toolbar-help")).toHaveCount(0);
  await page.getByTestId("edit-markdown").click(); // the overflow menu closes on a choice
  await page.getByTestId("header-menu").click();
  await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("toolbar-help")).toBeVisible();
});

test("with the stored choice unreadable the essay still opens, in visual mode", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k: string) {
      if (k === "srs-web.essay.edit-mode") throw new DOMException("blocked", "SecurityError");
      return get.call(this, k);
    };
  });
  await openEssay(page);
  await body(page, 0).click();
  await expect(visual(page, 0)).toBeFocused();
});
