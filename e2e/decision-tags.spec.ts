import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * decision-tags.spec.ts — e2e tests for srs-web#105: decision tag chips.
 *
 * Covers:
 *   - Tag chips visible on DecisionSummaryCard rows
 *   - Tag filter chip group in controls bar
 *   - Chip-based filtering by topic
 *   - Inspector tag editor: add / remove tags on selected decision
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Decision tag chips — read display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
  });

  test("decisions with tags show tag chips on their summary cards", async ({ page }) => {
    // gallery fixture has decisions with tags; at least one chip should be visible
    await expect(page.getByTestId("tag-chip").first()).toBeVisible();
  });

  test("filtering to a topic shows only decisions tagged with that topic", async ({ page }) => {
    // Filter to exhibitions (2 tagged decisions)
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(2);
    // Each exhibitions card must have at least one tag chip showing "exhibitions"
    for (const card of await cards.all()) {
      await expect(card.getByTestId("tag-chip").filter({ hasText: "exhibitions" })).toBeVisible();
    }
  });

  test("tag filter group is visible when tags exist", async ({ page }) => {
    await expect(page.getByTestId("topic-filter")).toBeVisible();
  });

  test("All chip is selected by default", async ({ page }) => {
    const allChip = page.getByTestId("topic-filter").getByRole("button", { name: "All" });
    await expect(allChip).toBeVisible();
    await expect(allChip).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking exhibitions chip shows exactly 2 decisions", async ({ page }) => {
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
  });

  test("clicking All chip restores full list after filtering", async ({ page }) => {
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
    await page.getByTestId("topic-filter").getByRole("button", { name: "All" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
  });

  test("selected chip has aria-pressed true, unselected chips false", async ({ page }) => {
    const filterGroup = page.getByTestId("topic-filter");
    await filterGroup.getByRole("button", { name: "exhibitions" }).click();
    await expect(filterGroup.getByRole("button", { name: "exhibitions" })).toHaveAttribute("aria-pressed", "true");
    await expect(filterGroup.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Decision tag chips — inspector tag editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
  });

  test("selecting a decision shows the Tags inspector section", async ({ page }) => {
    await page.getByTestId("decision-summary-card").first().click();
    await expect(page.getByTestId("inspector-tags")).toBeVisible();
  });

  test("inspector shows existing tags as removable chips", async ({ page }) => {
    // Click an exhibitions-tagged decision
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await page.getByTestId("decision-summary-card").first().click();
    const inspectorTags = page.getByTestId("inspector-tags");
    await expect(inspectorTags.getByTestId("tag-chip-remove")).toBeVisible();
  });

  test("adding a tag via the input updates the decision card", async ({ page }) => {
    await page.getByTestId("decision-summary-card").first().click();
    const countBefore = await page.getByTestId("tag-chip").count();

    await page.getByTestId("tag-input").fill("newtag");
    await page.getByTestId("tag-add-btn").click();

    await expect(page.getByTestId("tag-chip")).toHaveCount(countBefore + 1);
    await expect(page.getByTestId("inspector-tags").getByText("newtag")).toBeVisible();
  });

  test("adding a tag via Enter key updates the decision card", async ({ page }) => {
    await page.getByTestId("decision-summary-card").first().click();
    const countBefore = await page.getByTestId("tag-chip").count();

    await page.getByTestId("tag-input").fill("entertag");
    await page.getByTestId("tag-input").press("Enter");

    await expect(page.getByTestId("tag-chip")).toHaveCount(countBefore + 1);
  });

  test("removing a tag decrements the chip count", async ({ page }) => {
    // Select a decision that has at least one tag. Selecting opens the record's
    // reading view, so the remaining tag chips are the inspector's — count those.
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await page.getByTestId("decision-summary-card").first().click();

    const countBefore = await page.getByTestId("tag-chip").count();
    await page.getByTestId("inspector-tags").getByTestId("tag-chip-remove").first().click();
    await expect(page.getByTestId("tag-chip")).toHaveCount(countBefore - 1);
  });

  test("tag input clears after selection changes", async ({ page }) => {
    // Selecting a decision opens its reading view; return to the log before
    // selecting a different decision.
    await page.getByTestId("decision-summary-card").nth(0).click();
    await page.getByTestId("tag-input").fill("sometext");
    await page.getByTestId("record-reading-back").click();
    await page.getByTestId("decision-summary-card").nth(1).click();
    await expect(page.getByTestId("tag-input")).toHaveValue("");
  });
});
