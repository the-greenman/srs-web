import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/** Word / character counts (srs-web#648): per paragraph, essay total, hidden paragraphs still counted. */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

test("paragraph and essay counts follow typing and include hidden paragraphs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const total = page.getByTestId("essay-count");
  const first = page.locator(".essay-shell__page [data-testid=block-count]").first();
  await page.locator(".essay-shell__page :is(.block__render, .block__body)").first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("one two three");
  await expect(first).toHaveAttribute("title", "3 words, 13 characters");
  const before = await total.getAttribute("title");

  await page.locator(".essay-shell__page .block").first().hover();
  await page.locator(".essay-shell__page .block__strip .eye").first().click();
  await expect(page.locator(".essay-shell__page .block__closed").first()).toBeVisible();
  await expect(first).toHaveAttribute("title", "3 words, 13 characters");
  await expect(total).toHaveAttribute("title", before ?? "");

  // Nest "Third paragraph." under Claim: Claim shows its own count and the subtotal.
  await page.locator(".essay-shell__page .block__render", { hasText: "Third paragraph." }).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  const claim = page
    .locator(".essay-shell__page .block", { hasText: "Second paragraph." })
    .getByTestId("block-count");
  await expect(claim.locator("[aria-hidden=true]")).toHaveText("2w 17c · Σ 4w 33c");
  await expect(claim).toHaveAttribute(
    "title",
    "This paragraph: 2 words, 17 characters. With nested paragraphs: 4 words, 33 characters."
  );
  await page.screenshot({ path: "test-results/essay-counts.png", fullPage: true });
});
