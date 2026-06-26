import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * gallery.spec.ts — end-to-end tests using the governance gallery fixture.
 *
 * gallery.srsj is a real governance repository with 6 articles, 7 decisions,
 * and 3 roles. These tests verify that records actually render (not empty state),
 * which catches WASM serialisation bugs like duplicate-key crashes when
 * instanceId resolves to undefined.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Gallery fixture — real records render", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM boot, then choose governance mode
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    // Wait for loaded state
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("Articles section renders cards, not empty state", async ({ page }) => {
    // Verify the h2 shows Articles
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible();

    // gallery.srsj has 6 articles — the record list should have items
    await expect(page.locator(".record-list__item").first()).toBeVisible();

    // Empty state message must NOT be shown
    await expect(page.locator(".empty-state")).not.toBeVisible();
  });

  test("Articles section shows count badge matching record count", async ({ page }) => {
    // The nav item for Articles includes a count; gallery has 6 articles
    const articlesNav = page.getByRole("link", { name: /Articles/ });
    await expect(articlesNav).toContainText("6");
  });

  test("Decision Log section renders cards, not empty state", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();

    // gallery.srsj has 7 decisions — DecisionLogView renders them as summary card rows
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
    await expect(page.getByTestId("decision-summary-card").first()).toBeVisible();
  });

  test("Decision Log shows DecisionSummaryCard rows with decision content", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();

    // gallery.srsj has 7 decisions — 7 summary card rows
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(7);

    // First card must contain the decision statement (not empty)
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator(".dscard__statement")).not.toBeEmpty();
  });

  test("clicking a DecisionSummaryCard row opens the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await page.getByTestId("decision-summary-card").first().click();
    await expect(page.getByTestId("record-reading")).toBeVisible();
  });

  test("Decision Log nav item shows count badge", async ({ page }) => {
    const decisionsNav = page.getByRole("link", { name: /Decision Log/ });
    await expect(decisionsNav).toContainText("7");
  });

  test("Roles section renders cards, not empty state", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await expect(page.getByRole("heading", { name: "Roles", level: 2 })).toBeVisible();

    // gallery.srsj has 3 roles
    await expect(page.locator(".record-list__item").first()).toBeVisible();
    await expect(page.locator(".empty-state")).not.toBeVisible();
  });

  test("clicking a record card opens the reading view", async ({ page }) => {
    // Click the first article card — reading view should open
    await page.locator(".record-list__item").first().click();
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();
  });

  test("selecting an article shows its fields in the reading view", async ({ page }) => {
    // Click first article card — reading view opens in the centre canvas
    await page.locator(".record-list__item").first().click();

    // Reading view must appear in the centre with field labels
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Article Text");

    // Field content must NOT appear in the inspector
    await expect(page.locator(".inspector__section").first()).not.toContainText("Article Text");
  });

  test("selecting a decision shows its fields in the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await page.getByTestId("decision-summary-card").first().click();

    // Reading view must contain decision-specific field labels
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Decision Statement");

    // Field content must NOT appear in the inspector
    await expect(page.locator(".inspector__section").first()).not.toContainText("Decision Statement");
  });

  test("selecting a role shows its fields in the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await page.locator(".record-list__item").first().click();

    // Reading view must contain role-specific field labels
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Role Holder");

    // Field content must NOT appear in the inspector
    await expect(page.locator(".inspector__section").first()).not.toContainText("Role Holder");
  });

  test("clicking back from the reading view returns to the record list", async ({ page }) => {
    await page.locator(".record-list__item").first().click();
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();

    // Clicking the back button clears selection and returns to the list
    await page.getByTestId("record-reading-back").click();
    await expect(page.locator('[data-testid="record-reading"]')).not.toBeAttached();
    // Record list is visible again
    await expect(page.locator(".record-list__item").first()).toBeVisible();
    // Validation inspector section remains visible
    await expect(page.locator(".inspector__section").first()).toContainText("Validation");
  });

  test("repo filename shown in topbar", async ({ page }) => {
    await expect(page.locator(".topbar__repo")).toContainText("gallery");
  });
});

test.describe("Decision Log — sort and filter controls", () => {
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

  test("sort toggle defaults to newest first", async ({ page }) => {
    const toggle = page.getByTestId("sort-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("Newest first");
  });

  test("sort decisions oldest first", async ({ page }) => {
    const toggle = page.getByTestId("sort-toggle");
    await toggle.click();
    await expect(toggle).toHaveText("Oldest first");
    // Oldest decision is Pilot duration (2026-01-15)
    const firstTitle = page.getByTestId("decision-summary-card").first().locator(".dscard__title");
    await expect(firstTitle).toContainText("Pilot duration");
  });

  test("sort decisions newest first after toggling", async ({ page }) => {
    const toggle = page.getByTestId("sort-toggle");
    // Toggle to oldest then back to newest
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveText("Newest first");
    // Newest decision is Closure obligations (2026-05-01)
    const firstTitle = page.getByTestId("decision-summary-card").first().locator(".dscard__title");
    await expect(firstTitle).toContainText("Closure obligations");
  });

  test("filter by topic exhibitions shows 2 decisions", async ({ page }) => {
    await page.getByTestId("topic-filter").selectOption("exhibitions");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
  });

  test("filter by all topics restores list", async ({ page }) => {
    await page.getByTestId("topic-filter").selectOption("exhibitions");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
    await page.getByTestId("topic-filter").selectOption("all");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
  });

  test("topic filter shows sorted options", async ({ page }) => {
    const select = page.getByTestId("topic-filter");
    const options = await select.locator("option").allTextContents();
    expect(options).toEqual(["All topics", "exhibitions", "governance", "operations"]);
  });
});
