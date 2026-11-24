import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/** Word / character counts (srs-web#648): per paragraph, nested subtotals, essay / section total. */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

test("counts follow the rendered text, include hidden paragraphs, subtotal nesting, follow zoom", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const total = page.getByTestId("essay-count").getByTestId("count");
  const first = page.locator(".essay-shell__page .block [data-testid=count]").first();
  await page.locator(".essay-shell__page :is(.block__render, .block__body)").first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("**one** [two](https://example.org/long/path) three");
  // markdown syntax and the link URL are not counted
  await expect(first).toHaveAttribute("title", "3 words, 13 characters.");
  await expect(total).toHaveAttribute("title", "Essay: 7 words, 46 characters.");

  await page.locator(".essay-shell__page .block").first().hover();
  await page.locator(".essay-shell__page .block__strip .eye").first().click();
  await expect(page.locator(".essay-shell__page .block__closed").first()).toBeVisible();
  await expect(first).toHaveAttribute("title", "3 words, 13 characters.");
  await expect(total).toHaveAttribute("title", "Essay: 7 words, 46 characters."); // hidden still counts

  // Nest "Third paragraph." under Claim: Claim shows its own count and the subtotal.
  await page.locator(".essay-shell__page .block__render", { hasText: "Third paragraph." }).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  const claim = page
    .locator(".essay-shell__page .block", { hasText: "Second paragraph." })
    .getByTestId("count");
  await expect(claim.locator("[aria-hidden=true]")).toHaveText("2w 17c · Σ 4w 33c");
  await expect(claim).toHaveAttribute(
    "title",
    "2 words, 17 characters. With nested paragraphs: 4 words, 33 characters."
  );

  // Zoomed into Claim, the header counts what is on screen.
  await page.locator(".essay-shell__page .block", { hasText: "Second paragraph." }).first().hover();
  await page
    .locator(".essay-shell__page .block", { hasText: "Second paragraph." })
    .first()
    .getByRole("button", { name: /zoom/i })
    .first()
    .click();
  await expect(total).toHaveAttribute("title", "Section: 4 words, 33 characters.");
});
