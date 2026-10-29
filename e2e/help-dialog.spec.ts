import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { FIRST_RUN } from "../playwright.config";
import { openMenu } from "./helpers.js";

/**
 * help-dialog.spec.ts — srs-web#642: a new essay opens with its help, in the help repository's order
 * and words, before the name gate; "Don't show again" sticks across a reload; Go > Editor help…
 * brings it back; Connect your AI opens the Agents panel.
 */
test.use({ storageState: FIRST_RUN });

async function newEssay(page: Page) {
  await page.goto("/");
  await page.getByTestId("create-name").fill("Untitled essay");
  await page.getByTestId("create-editor-essay").check();
  await page.getByTestId("create-repository").click();
}
const dialog = (page: Page) => page.getByTestId("help-dialog");

test("a new essay opens with its help, over the name gate, in order", async ({ page }) => {
  await newEssay(page);
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId("help-step-title")).toHaveText("Connect your AI");
  await expect(page.getByTestId("name-gate")).toBeAttached(); // under the dialog
  await page.getByTestId("help-next").click();
  await expect(page.getByTestId("help-step-title")).toHaveText("Your name");
  await page.getByTestId("help-back").click();
  await page.getByTestId("help-more").getByText("More").click();
  await expect(dialog(page)).toContainText("claude mcp add");
});

test("Don't show again sticks; Go > Editor help… brings it back", async ({ page }) => {
  await newEssay(page);
  await page.getByTestId("help-dont-show").check();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await page.reload();
  await newEssay(page);
  await expect(page.locator(".essay-shell__page")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await openMenu(page, "Go");
  await page.getByTestId("editor-help").click();
  await expect(dialog(page)).toBeVisible();
});

test("Connect your AI opens the Agents panel", async ({ page }) => {
  await newEssay(page);
  await page.getByTestId("help-action").click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId("agent-panel")).toBeVisible();
});
