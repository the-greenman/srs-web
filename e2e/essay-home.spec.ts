import { expect, test } from "@playwright/test";

/**
 * essay-home.spec.ts — srs-web#700: `/essay` (and essay.semanticops.com) shows the essay home, whose
 * words are help records; New essay starts an essay; `/` keeps the generic landing.
 */
const START = '[data-feature="essay-home.start"]';

test("/essay shows the essay home; New essay lands in the essay shell", async ({ page }) => {
  await page.goto("/essay");
  await expect(page.locator(START)).toHaveText("Start an essay", { timeout: 15000 });
  await expect(page.getByTestId("generic-file-picker")).toHaveCount(0);
  await page.locator(START).click();
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
});

test("/essay?new=essay lands in the essay shell", async ({ page }) => {
  await page.goto("/essay?new=essay");
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
});

test("a repository opened on the essay home lands in the essay shell, unasked (#710)", async ({ page }) => {
  await page.goto("/essay?open=/examples/on-small-democracy.srsj");
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
});

test("the same link on / does not choose the essay shell (#710)", async ({ page }) => {
  await page.goto("/?open=/examples/on-small-democracy.srsj");
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".essay-shell__page")).toHaveCount(0);
});

test("/ keeps the generic landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(START)).toHaveCount(0);
});
