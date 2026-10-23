import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * migrate-rev8.spec.ts — a revision-8 essay (built with the build.425 CLI). Since build.545
 * (RFC-052, srs-web#583) the engine migrates a pre-10 .srsj in memory on open, with no prompt;
 * a reply is still written with an attributed actor (the engine refuses actor writes below
 * revision 9), so the 8 -> 9 step did run.
 */
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "rev8",
  "essay-rev8.srsj"
);

test("a rev-8 essay opens migrated in memory and takes an attributed human reply", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await page.getByTestId("package-editor-essay").click();
  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Your name").fill("Ada");
  await first.getByLabel("Reply").fill("After migration.");
  await first.getByRole("button", { name: "Comment", exact: true }).click();
  const c = first.getByTestId("comment");
  await expect(c.getByTestId("actor-name")).toHaveText("Ada");
  await expect(c.getByTestId("actor-kind")).toHaveText("human");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
});
