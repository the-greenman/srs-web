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
  for (const card of await cards.all())
    await expect(card.getByTestId("actor-kind")).toHaveText("ai");
  await expect(cards.first()).toContainText("Writer");
  await expect(board.getByTestId("problem-comments")).toHaveCount(1);
  await expect(
    cards.filter({ hasText: "Suggestions pile up unseen" }).getByRole("img", { name: "1 comment" })
  ).toBeVisible();
  await expect(board.getByTestId("method-cluster")).toContainText("Leaving the editor");

  await page.getByRole("button", { name: "Open Suggestions pile up unseen" }).click();
  await openInspectorDrawer(page);
  const detail = page.getByTestId("method-detail");
  await expect(detail).toContainText("Testimony and authority");
  await expect(detail.getByRole("link", { name: "https://example.org/notes" })).toBeVisible();

  await expect(page.getByTestId("problem-actions-affirm")).toBeEnabled();
  await page.getByTestId("problem-actions-set-aside").click();

  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Set aside 1" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Suggestions pile up unseen");
  await expect(cards.first().getByTestId("problem-status")).toHaveText("Set aside");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  expect(errors).toEqual([]);
});

test("affirm a suggested problem: the fork keeps its links and is the owner's", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "srs-web.actor",
      JSON.stringify({ kind: "human", id: "local:owner", name: "Owner Person" })
    )
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await openPackageEditor(page, "method");

  const board = page.getByTestId("method-board");
  const cards = board.getByTestId("problem-card");
  await page.getByRole("button", { name: "Open A document cannot leave and return" }).click();
  await openInspectorDrawer(page);
  await page.getByTestId("problem-actions-affirm").click();

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
  await expect(page.getByTestId("problem-actions-affirm")).toHaveCount(0); // affirmed: just Edit
  await expect(page.getByTestId("problem-actions-edit")).toBeVisible();
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  expect(errors).toEqual([]);
});

async function openMethod(page: import("@playwright/test").Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "srs-web.actor",
      JSON.stringify({ kind: "human", id: "local:owner", name: "Owner Person" })
    )
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await openPackageEditor(page, "method");
}

test("remedies list under the problems they answer; affirm one, then a cluster and a persona (srs-web#541)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openMethod(page);

  await page.getByRole("button", { name: "Open A document cannot leave and return" }).click();
  await openInspectorDrawer(page);
  const remedies = page.getByTestId("problem-remedies");
  await expect(remedies.getByTestId("remedy-card")).toHaveCount(1);
  await expect(remedies).toContainText("Let a document edited elsewhere come back");
  await expect(remedies).toContainText("Merging two edits to one paragraph.");
  // the same remedy answers SP-3 too: one record, listed under both
  await page.getByRole("button", { name: "Open A brief replaces reading the source" }).click();
  await expect(page.getByTestId("problem-remedies")).toContainText("A return path for edited documents");

  // open the remedy from the problem, affirm it
  await page.getByTestId("problem-remedies").getByTestId("linked-record").click();
  const detail = page.getByTestId("method-detail");
  await expect(detail).toHaveAttribute("data-entity", "remedy");
  await expect(detail.getByTestId("remedy-answers").getByTestId("linked-record")).toHaveCount(2);
  await page.getByTestId("problem-actions-affirm").click();
  await expect(detail).toContainText("Owner Person");
  await expect(page.getByTestId("problem-actions-affirm")).toHaveCount(0);
  await expect(page.getByTestId("problem-actions-edit")).toBeVisible();

  // the affirmed remedy now stands under the problem (the suggestion is hidden behind it)
  await page.getByRole("button", { name: "Open A document cannot leave and return" }).click();
  const under = page.getByTestId("problem-remedies").getByTestId("remedy-card");
  await expect(under).toHaveCount(1);
  await expect(under.getByTestId("linked-record")).toHaveAttribute("data-status", "affirmed");

  // a cluster: affirm from the board heading; its problems are not forked
  const cards = page.getByTestId("method-board").getByTestId("problem-card");
  await expect(cards).toHaveCount(3);
  await page.getByTestId("method-cluster").getByTestId("linked-record").click();
  await expect(detail).toHaveAttribute("data-entity", "cluster");
  await page.getByTestId("problem-actions-affirm").click();
  await expect(page.getByTestId("method-cluster").getByTestId("linked-record")).toHaveAttribute("data-status", "affirmed");
  await expect(cards).toHaveCount(3);

  // a persona: set aside, then restore
  await page.getByRole("button", { name: "Open Suggestions pile up unseen" }).click();
  await page.getByTestId("method-personas").getByTestId("linked-record").click();
  await expect(detail).toHaveAttribute("data-entity", "persona");
  await page.getByTestId("problem-actions-set-aside").click();
  await expect(page.getByTestId("problem-actions-restore")).toBeVisible();
  await page.getByTestId("problem-actions-restore").click();
  await expect(page.getByTestId("problem-actions-affirm")).toBeVisible();
  expect(errors).toEqual([]);
});
