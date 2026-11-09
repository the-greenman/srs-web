import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { menuItem } from "./helpers";
import type { Page } from "@playwright/test";

/** srs-web#425: the top-bar document picker, in a real browser (popover API, focus, narrow sheet). */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

async function openWithTwoEssays(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await menuItem(page, "Document", "copy-document");
  await expect(page.getByRole("heading", { name: "Copy of On small democracy" })).toBeVisible();
}

test("the picker is hidden until opened, filters, and Escape returns focus to the title", async ({ page }) => {
  await openWithTwoEssays(page);
  const trigger = page.getByTestId("doc-picker-trigger");
  await expect(page.getByTestId("doc-picker-search")).toBeHidden();
  await trigger.click();
  await expect(page.getByTestId("doc-picker-search")).toBeFocused();
  await expect(page.getByTestId("doc-picker-option")).toHaveCount(2);
  await page.keyboard.type("copy");
  await expect(page.getByTestId("doc-picker-option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("doc-picker-search")).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("doc-picker-search")).toBeHidden();
});

test("390: the picker opens as a full-width sheet with search focused", async ({ page }) => {
  await openWithTwoEssays(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByTestId("doc-picker-trigger").click();
  await expect(page.getByTestId("doc-picker-search")).toBeFocused();
  const box = await page.getByTestId("doc-picker-search").boundingBox();
  expect(box!.width).toBeGreaterThan(370);
});
