import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * mixed-container.spec.ts — srs-web#483: a container holding a Tier-0 note (no `record` in
 * resolve_container_view) renders all its members. Fixture: build-mixed-container-fixture.sh.
 */
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "mixed-container.srsj"
);

test("a container with a note and records lists every member, the note marked, and maps them all", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 30000 });

  await page.getByRole("button", { name: "Toggle Mixed bag" }).click();
  await expect(page.locator(".generic-tree-members .nav__item")).toHaveCount(3);
  await expect(page.getByTestId("member-note-mark")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /A loose note/ })).toBeVisible();

  await page.getByRole("button", { name: /^Mixed bag container/ }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Inspect A loose note/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Inspect paragraph/ })).toHaveCount(2);
  expect(errors).toEqual([]);
});
