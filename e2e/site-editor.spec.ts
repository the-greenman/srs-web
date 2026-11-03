import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openInspectorDrawer, openPackageEditor } from "./helpers";

/**
 * site-editor.spec.ts — srs-web#680 B1 (ADR-029): the site editor over site.srsj (website package
 * 0.2.0; pages home, about and scratch; home has drafts). Edit a field in place and undo it, take a
 * block to the Bin and restore it, publish a page as a draft, and fit a phone.
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

  // The FAQ group to the Bin, with its items, and back.
  await page
    .getByRole("textbox", { name: "Section heading" })
    .filter({ hasText: "Questions." })
    .click();
  await openInspectorDrawer(page);
  await page.getByTestId("site-to-bin").click();
  await expect(
    page.getByRole("textbox", { name: "Section heading" }).filter({ hasText: "Questions." })
  ).toHaveCount(0);
  const bin = page
    .getByRole("region", { name: "Bin" })
    .or(page.locator('[data-feature="site.bin"]'));
  await bin
    .getByRole("button", { name: /Restore/ })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section heading" }).filter({ hasText: "Questions." })
  ).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Faq question" })).toHaveCount(2);

  // Page settings: with no block selected, publish as a draft.
  await page.keyboard.press("Escape");
  await pagePicker.selectOption({ label: "Scratch (/scratch)" });
  await openInspectorDrawer(page);
  const publish = page.getByTestId("site-publish");
  await expect(publish).toHaveValue("no");
  await publish.selectOption("draft");
  await expect(publish).toHaveValue("draft");

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
