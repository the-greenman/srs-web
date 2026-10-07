import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * large-repo.spec.ts — srs-web#481: Records and Map stay usable on a repository the size of the SRS spec
 * (704 records: 677 typed in 15 types, 27 notes; the hub concept "Travelling form" has 26 relations).
 * srs-spec.srs is the published spec bundle (srs#906), migrated to data-model revision 9.
 */
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "srs-spec.srs");

async function openSpec(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Records", exact: true }).click();
  return errors;
}

test("Records opens grouped by type with counts, collapsed, and a Notes group", async ({ page }) => {
  const errors = await openSpec(page);

  await expect(page.getByTestId("records-count")).toHaveText("704 records");
  const groups = page.getByTestId("record-group");
  await expect(groups).toHaveCount(16);
  await expect(groups.first()).toContainText("mechanism");
  await expect(groups.first()).toContainText("175");
  await expect(groups.last()).toContainText("Notes");
  await expect(groups.last()).toContainText("27");
  await expect(page.getByTestId("record-row")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a group opens to 50 rows and Show more pages to 100", async ({ page }) => {
  await openSpec(page);

  await page.getByTestId("record-group").first().getByRole("button").first().click();
  await expect(page.getByTestId("record-row")).toHaveCount(50);
  await expect(page.getByTestId("group-more")).toContainText("125 left");
  await page.getByTestId("group-more").click();
  await expect(page.getByTestId("record-row")).toHaveCount(100);
  // backticks are display-only noise in a label
  await expect(page.getByTestId("record-row").filter({ hasText: "`" })).toHaveCount(0);
});

test("the Notes group opens through the core's note filter", async ({ page }) => {
  await openSpec(page);

  await page.getByTestId("record-group").last().getByRole("button").first().click();
  await expect(page.getByTestId("record-row")).toHaveCount(27);
});

test("the type filter lists only non-empty types and narrows to one flat, counted list", async ({ page }) => {
  await openSpec(page);
  const select = page.getByLabel("Filter records by type");

  await expect(select.locator("option")).toHaveCount(1 + 15 + 1);
  await select.selectOption({ label: "com.semanticops.spec/invariant (128)" });

  await expect(page.getByTestId("records-count")).toHaveText("128 records");
  await expect(page.getByTestId("record-group")).toHaveCount(0);
  await expect(page.getByTestId("record-row")).toHaveCount(50);
});

test("search is ranked: the exact title comes first, and the count reads N results", async ({ page }) => {
  await openSpec(page);

  await page.getByLabel("Search records").fill("Travelling form");

  await expect(page.getByTestId("records-count")).toHaveText("9 results");
  await expect(page.getByTestId("record-row").first().locator("strong")).toHaveText("Travelling form");
  await expect(page.getByTestId("record-group")).toHaveCount(0);
});

test("the Map focuses a hub record: 12 neighbours, an 'N more' page, and a legend", async ({ page }) => {
  await openSpec(page);
  await page.getByLabel("Search records").fill("Travelling form");
  await page.getByTestId("record-row").first().click();

  await page.getByRole("button", { name: "Map", exact: true }).click();

  const neighbours = page.locator('[data-testid="scoped-graph"] g.neighbour');
  await expect(neighbours).toHaveCount(12);
  await expect(page.getByTestId("map-more")).toContainText("14 more");
  await expect(page.getByTestId("graph-legend")).toContainText("contains");

  await page.getByTestId("map-more").click();
  await expect(neighbours).toHaveCount(24);
  await expect(page.getByTestId("map-more")).toContainText("2 more");
});

test("a container map is capped at 24 nodes", async ({ page }) => {
  await openSpec(page);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const nodes = page.locator('[data-testid="scoped-graph"] circle');
  // the first container is selected by default: whatever it holds, no more than 24 nodes are drawn
  expect(await nodes.count()).toBeLessThanOrEqual(24);
});
