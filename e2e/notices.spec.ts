import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openPackageEditor } from "./helpers.js";

/**
 * notices.spec.ts — srs-web#441: one notice system (toast, Notice, grouped Diagnostics).
 * r23.srsj: a `contains` chain 7 deep rendered as html, so the engine emits the SAME
 * "[R23] computed heading level 7 exceeds 6 ..." diagnostic ten times (no stubs).
 * essay-catalog.srsj: the essay fixture plus one deliberately malformed object (a catalog error).
 */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const R23 = path.join(dir, "r23.srsj");

async function open(page: Page, fixture: string) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(fixture);
}

test.describe("Grouped diagnostics", () => {
  test("a repeated R23 is one collapsed line, expands to one group with a count, and dismiss is per document", async ({
    page,
  }) => {
    await open(page, R23);
    const notice = page.getByTestId("document-diagnostics");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("10 warnings");
    await expect(notice.locator(".diag-list")).toBeHidden();

    await notice.getByRole("button", { name: "Show diagnostics" }).click();
    await expect(notice.locator('[data-part="group"]')).toHaveCount(1);
    await expect(notice.locator('[data-part="count"]')).toHaveText("x10");
    await expect(notice.getByText("[R23] computed heading level 7")).toBeVisible();

    await notice.getByRole("button", { name: "Dismiss" }).click();
    await expect(notice).toHaveCount(0);

    // away and back: still dismissed for this document (session scope)
    await page.getByRole("button", { name: "Records" }).click();
    await page.getByRole("button", { name: /tree-document/ }).click();
    await expect(page.getByRole("heading", { name: "tree-document" })).toBeVisible();
    await expect(page.getByTestId("document-diagnostics")).toHaveCount(0);

    // a reload starts a new session: shown again
    await open(page, R23);
    await expect(page.getByTestId("document-diagnostics")).toBeVisible();
  });
});

test.describe("Catalog notice", () => {
  test("shows below the bar in the generic shell and in a registered editor shell, as a status", async ({
    page,
  }) => {
    await open(page, path.join(dir, "essay-catalog.srsj"));
    const notice = page.getByTestId("catalog-diagnostics");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
    await expect(notice).toContainText("1 error");
    await expect(page.getByRole("alert")).toHaveCount(0);

    await openPackageEditor(page, "essay");
    await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
    await expect(page.getByTestId("catalog-diagnostics")).toBeVisible();
    // below the bar, above the scroller: real DOM order inside the main column
    const order = await page.evaluate(() => {
      const main = document.querySelector(".app__main") as HTMLElement;
      const kids = [...main.children];
      const at = (sel: string) => kids.findIndex((k) => k.matches(sel));
      return [at(".toolbar"), at('[data-testid="catalog-diagnostics"]'), at(".workspace")];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });
});
