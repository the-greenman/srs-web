import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { NO_ACTOR } from "../playwright.config";

/**
 * essay-author.spec.ts — srs-web#618: no unattributed writes. With neither a login nor a saved name
 * the essay is read-only behind a name prompt; once a name is given the header names the writer and
 * the first paragraph is saved as theirs.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
test.use({ storageState: NO_ACTOR });

test("an essay with no actor is read-only until the writer gives a name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByTestId("name-gate")).toBeVisible();
  await expect(page.getByTestId("session-actor")).toHaveCount(0);
  await expect(page.locator(".essay-shell__page")).toHaveAttribute("inert", "");

  await page.getByTestId("name-gate-input").fill("Grace");
  await page.getByRole("button", { name: "Start writing" }).click();
  await expect(page.getByTestId("name-gate")).toHaveCount(0);
  await expect(page.getByTestId("session-actor")).toContainText("Grace");

  await page.getByTestId("add-paragraph").click();
  const last = page.locator(".essay-shell__page .block-stack__item").last();
  await expect(page.locator(".essay-shell__page")).not.toHaveAttribute("inert", "");
});
