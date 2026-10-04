import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * records-explorer.spec.ts — srs-web#438: the Generic explorer's "Records" surface
 * crashed with Svelte's `each_key_duplicate` on essay.srsj. The fixture's package
 * carries two stored versions of the `document-state` type (the same type id, kept
 * so a record still bound to the older version resolves) — `listTypes()` returned
 * one row per stored version, so the type-filter dropdown's `{#each types as type
 * (type.id)}` saw a duplicate key. #424's phone-drawer e2e used gallery.srsj instead,
 * specifically to dodge this.
 */
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function openRecordsSurface(page: Page, fixture: string) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(path.join(FIXTURES, fixture));
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Records", exact: true }).click();
  return errors;
}

test("essay.srsj: Records opens with no console error and each record appears once", async ({
  page,
}) => {
  const errors = await openRecordsSurface(page, "essay.srsj");

  await expect(page.getByText("7 records")).toBeVisible();
  await expect(page.locator(".record-row")).toHaveCount(7);

  expect(errors.filter((e) => e.includes("each_key_duplicate"))).toEqual([]);
});

test("essay.srsj: the type filter offers document-state once despite two stored versions", async ({
  page,
}) => {
  await openRecordsSurface(page, "essay.srsj");

  const options = page.getByLabel("Filter records by type").locator("option");
  const labels = await options.allTextContents();
  const documentStateOptions = labels.filter((l) => l.includes("document-state"));
  expect(documentStateOptions).toHaveLength(1);
});
