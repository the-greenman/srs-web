import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * instance-notes.spec.ts — srs-web#422: the non-essay shells show the engine's relations for the
 * selected instance and, only where the essay package's comment type is installed, its comments.
 * gallery.srsj has no comment package; essay.srsj does (comments on a non-paragraph instance).
 */
const GALLERY_CONTAINER = "Articles";
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function selectFirstRecord(page: Page, fixture: string, container: string) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(path.join(FIXTURES, fixture));
  await page.getByRole("button", { name: `Toggle ${container}` }).click();
  await page.locator(".tree-members button").first().click();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  return errors;
}

test("gallery (no comment package): relations only, no comment UI, no console error", async ({
  page,
}) => {
  const errors = await selectFirstRecord(page, "gallery.srsj", GALLERY_CONTAINER);
  const notes = page.getByTestId("instance-notes");
  await expect(notes).toHaveAttribute("data-srs-instance", /[0-9a-f-]{36}/);
  await expect(notes.getByRole("textbox", { name: "Reply" })).toHaveCount(0);
  await expect(notes.getByTestId("comment-thread")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a draft reply does not carry over to the next selected instance", async ({ page }) => {
  await selectFirstRecord(page, "essay.srsj", "On small democracy");
  const notes = page.getByTestId("instance-notes");
  await notes.getByLabel("Reply").fill("A draft for the first instance.");
  await page.locator(".tree-members button").nth(1).click();
  await expect(page.getByTestId("instance-notes")).toHaveAttribute("data-srs-instance", /./);
  await expect(page.getByTestId("instance-notes").getByLabel("Reply")).toHaveValue("");
  await expect(page.getByTestId("instance-notes").getByTestId("comment")).toHaveCount(0);
});

test("essay corpus: a comment on a non-paragraph instance works", async ({ page }) => {
  const errors = await selectFirstRecord(page, "essay.srsj", "On small democracy");
  const notes = page.getByTestId("instance-notes");
  await expect(notes.getByTestId("comment-thread")).toBeVisible();
  await notes.getByLabel("Your name").fill("Ada");
  await notes.getByLabel("Reply").fill("A comment from the generic inspector.");
  await notes.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(notes.getByTestId("comment")).toHaveCount(1);
  await expect(notes.getByTestId("comment")).toContainText("A comment from the generic inspector.");
  await expect(notes.getByTestId("actor-name")).toHaveText("Ada");
  expect(errors).toEqual([]);
});
