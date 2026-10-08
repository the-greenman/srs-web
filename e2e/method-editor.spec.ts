import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openInspectorDrawer, openPackageEditor } from "./helpers";

/**
 * method-editor.spec.ts — srs-web#526: the Method shell over method.srsj (3 agent-suggested problems
 * in Suggestions, empty Affirmed and Set aside). Set aside moves membership; the filter follows it.
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
  await expect(page.getByTestId("problem-menu-affirm")).toBeDisabled();
  await expect(page.getByTestId("problem-menu-affirm")).toHaveAttribute("title", "Needs the next engine build");
  await page.getByTestId("problem-menu-set-aside").click();

  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Set aside 1" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Suggestions pile up unseen");
  await expect(cards.first().getByTestId("problem-status")).toHaveText("Set aside");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  expect(errors).toEqual([]);
});
