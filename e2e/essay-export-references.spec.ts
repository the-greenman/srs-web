import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

/**
 * essay-export-references.spec.ts — srs-web#278: "Export references (.md)" refreshes the bundle and
 * downloads the core render of the essay-references composition over it. Fixture essay-references.srsj:
 * paragraph Opening bears on a problem, a source evidences Claim.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-references.srsj");

test("Export references: problems and sources linked to paragraphs, no essay text", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await openMenu(page, "Document");
      await page.getByTestId("export-references").click();
    })(),
  ]);
  expect(download.suggestedFilename()).toBe("On small democracy (references).md");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  const md = readFileSync((await download.path()) as string, "utf8");
  expect(md).toContain("## Problems");
  expect(md).toContain("Small groups lose touch");
  expect(md).toContain("Small self-governing groups cannot see each other.");
  expect(md).toContain("## Sources");
  expect(md).toContain("Ostrom, Governing the Commons");
  expect(md).not.toContain("## Claims"); // none linked: the section is hidden
  expect(md).not.toContain("First paragraph.");
});
