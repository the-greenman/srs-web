import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { acceptMigration } from "./helpers.js";

/**
 * migrate-rev8.spec.ts — RFC-046 revision gate (srs-web#359). A revision-8 essay (built with the
 * build.425 CLI) offers the 8 -> 9 migration; after accepting, a reply is written with an
 * attributed actor (the engine refuses actor writes below revision 9), and an agent comment
 * keeps its own author next to the human's.
 */
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "rev8",
  "essay-rev8.srsj"
);

test("a rev-8 essay offers 8 -> 9, then takes an attributed human reply", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await acceptMigration(page, "rfc046-actor-provenance");
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
