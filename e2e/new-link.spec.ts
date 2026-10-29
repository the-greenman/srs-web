import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * new-link.spec.ts — srs-web#640: `?new=<editor>` opens a new, unsaved document in that editor, the
 * parameter leaves the address bar, an unknown editor lands on the picker with a notice, and a
 * waiting recovery copy is never replaced without asking.
 */
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.srsj");

test("?new=essay opens an untitled essay and drops the parameter", async ({ page }) => {
  await page.goto("/?new=essay");
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL((u) => !u.searchParams.has("new"));
});

test("an unknown editor lands on the picker with a notice", async ({ page }) => {
  await page.goto("/?new=nope");
  await expect(page.getByTestId("new-link-error")).toContainText('"nope"');
  await expect(page.getByTestId("generic-file-picker")).toBeVisible();
});

test("with unsaved work waiting, the link offers restore or start new", async ({ page }) => {
  const entry = JSON.stringify({ name: "sample", srsj: readFileSync(SAMPLE, "utf8"), savedAt: "2026-10-01T00:00:00Z" });
  await page.goto("/");
  await page.evaluate((e) => localStorage.setItem("srs-web:working-copy", e), entry);
  await page.goto("/?new=essay");
  await expect(page.getByTestId("restore-notice")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("new-link-start").click();
  await expect(page.locator(".essay-shell__page")).toBeVisible();
});

test("restoring the waiting copy spends the offer", async ({ page }) => {
  const entry = JSON.stringify({ name: "sample", srsj: readFileSync(SAMPLE, "utf8"), savedAt: "2026-10-01T00:00:00Z" });
  await page.goto("/");
  await page.evaluate((e) => localStorage.setItem("srs-web:working-copy", e), entry);
  await page.goto("/?new=Essay&repo=a/b");
  await expect(page).toHaveURL((u) => u.search === "");
  await page.getByTestId("restore-notice").getByTestId("restore-discard").click();
  await expect(page.getByTestId("new-link")).toHaveCount(0);
});
