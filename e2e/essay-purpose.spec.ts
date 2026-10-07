import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-purpose.spec.ts — srs-web#411: the essay's purpose (markdown, edited in place under the
 * title) and Copy for agent. Fixture: essay.srsj, whose essay type carries the optional
 * `purpose` field (com.mudemocracy.essay, muDemocracy.org#272).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const purpose = (page: Page) =>
  page.locator(".essay-shell__purpose :is(.purpose__render, .purpose__body)");

/** The Document menu no longer holds Copy for agent (srs-web#498). */
async function openMenuAbsent(page: Page) {
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Copy for agent" })).toHaveCount(0);
  await page.keyboard.press("Escape");
}

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

test("purpose renders markdown until focused, persists in the working copy and survives a reload", async ({
  page,
}) => {
  await open(page);
  await purpose(page).click();
  await page.keyboard.type("Persuade the **board**.");
  await page.getByRole("heading", { name: "On small democracy" }).click(); // blur: commit
  await page.keyboard.press("Escape");
  await expect(page.locator(".purpose__render strong")).toHaveText("board");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();

  await page.reload();
  await page.locator(".restore-banner__restore").click();
  await page.getByTestId("package-editor-essay").click();
  await expect(page.locator(".purpose__render strong")).toHaveText("board");
});

test("Copy essay handoff: the Agents panel copies the whole essay, a paragraph menu focuses that paragraph", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await purpose(page).click();
  await page.keyboard.type("Persuade the board.");
  await page.getByRole("heading", { name: "On small democracy" }).click();

  await page.getByTestId("copy-for-agent").click(); // the Agents panel (srs-web#498)
  await expect(page.getByTestId("address-notice")).toHaveText(/Copied/);
  const whole = await page.evaluate(() => navigator.clipboard.readText());
  expect(whole).toContain("On small democracy");
  expect(whole).toContain("Purpose: Persuade the board.");
  expect(whole).toMatch(/srs:\/\/[0-9a-f-]{36}\/container\/[0-9a-f-]{36}/);
  expect(whole).not.toContain("Focus:");
  expect(whole).toContain("How to work on this essay");
  expect(whole).toContain("Never edit a paragraph body");
  await openMenuAbsent(page);

  const id = (await items(page).nth(1).locator(".block").getAttribute("data-block-id"))!;
  await items(page).nth(1).getByTestId("paragraph-menu").click({ force: true });
  await page.getByTestId("paragraph-menu-agent").click();
  const one = await page.evaluate(() => navigator.clipboard.readText());
  expect(one).toContain(`"Claim" (paragraph ${id})`);
  expect(one).toMatch(new RegExp(`/context/[0-9a-f-]{36}/${id}`));
});
