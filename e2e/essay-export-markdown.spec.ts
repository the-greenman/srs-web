import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * essay-export-markdown.spec.ts — srs-web#416: "Export markdown" is the visible essay only.
 * Fixture essay.srsj: Opening / Claim / Third (untitled) + a draft "Spare". We nest Claim under
 * Opening and hide Opening: the file has one H1, arranged order, and no hidden, hidden-by-parent
 * or draft text (export = what the editor shows).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

test("Export markdown: one H1, no hidden, hidden-by-parent or draft text, arranged order", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const bodies = page.locator(".essay-shell__page :is(.block__render, .block__body)");
  await bodies.nth(1).click(); // Claim
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab"); // nest under Opening
  await page.getByRole("button", { name: "Hide Opening", exact: true }).first().click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-markdown").click(),
  ]);
  expect(download.suggestedFilename()).toBe("On small democracy.md");
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  const md = Buffer.concat(chunks).toString("utf8");

  expect(md.match(/^# .*$/gm)).toEqual(["# On small democracy"]);
  expect(md).not.toContain("First paragraph.");
  expect(md).not.toContain("Spare");
  expect(md).not.toContain("Drafted paragraph.");
  expect(md).not.toContain("Second paragraph."); // Claim: hidden by its parent
  expect(md).toContain("Third paragraph.");
});
