import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openInspectorDrawer, openPackageEditor } from "./helpers";

/**
 * method-editor.spec.ts — srs-web#526: the Method shell over method.srsj (3 agent-suggested problems
 * in Suggestions, empty Affirmed and Set aside). Set aside moves membership; the filter follows it.
 * Affirm (srs-web#530) forks into Affirmed carrying the links; the suggestion hides behind the fork.
 */
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "method.srsj");

test("review suggested problems and set one aside", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await openPackageEditor(page, "method");

  const board = page.getByTestId("method-board");
  const cards = board.getByTestId("problem-card");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) await expect(card.getByTestId("actor-kind")).toHaveText("ai");
  await expect(cards.first()).toContainText("Writer");
  await expect(board.getByTestId("method-cluster")).toContainText("Leaving the editor");

  await page.getByRole("button", { name: "Open Suggestions pile up unseen" }).click();
  await openInspectorDrawer(page);
  const detail = page.getByTestId("method-detail");
  await expect(detail).toContainText("Testimony and authority");
  await expect(detail.getByRole("link", { name: "https://example.org/notes" })).toBeVisible();

  await page.getByTestId("problem-menu").click();
  await expect(page.getByTestId("problem-menu-affirm")).toBeEnabled();
  await page.getByTestId("problem-menu-set-aside").click();

  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Set aside 1" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Suggestions pile up unseen");
  await expect(cards.first().getByTestId("problem-status")).toHaveText("Set aside");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  expect(errors).toEqual([]);
});

test("affirm a suggested problem: the fork keeps its links and is the owner's", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("srs-web.actor", JSON.stringify({ kind: "human", id: "local:owner", name: "Owner Person" }))
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await openPackageEditor(page, "method");

  const board = page.getByTestId("method-board");
  const cards = board.getByTestId("problem-card");
  await page.getByRole("button", { name: "Open A document cannot leave and return" }).click();
  await openInspectorDrawer(page);
  await page.getByTestId("problem-menu").click();
  await page.getByTestId("problem-menu-affirm").click();

  await expect(cards).toHaveCount(2); // the suggestion is hidden behind its affirmed fork
  await expect(board).not.toContainText("A document cannot leave and return");
  await page.getByRole("button", { name: "Affirmed 1" }).click();
  await expect(cards).toHaveCount(1);
  const card = cards.first();
  await expect(card).toContainText("A document cannot leave and return");
  await expect(card).toContainText("Writer"); // held-by carried
  await expect(card.getByTestId("problem-status")).toHaveText("Affirmed");
  await expect(card.getByTestId("actor-kind")).toHaveText("human");
  await expect(board.getByTestId("method-cluster")).toContainText("Leaving the editor"); // contains carried
  await expect(page.getByTestId("method-detail")).toContainText("Owner Person");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  expect(errors).toEqual([]);
});
