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

    // gallery.srsj has 7 decisions
    await expect(page.locator(".record-list__item").first()).toBeVisible();
    await expect(page.locator(".empty-state")).not.toBeVisible();
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

  test("clicking a record card selects it", async ({ page }) => {
    // Click the first article card — should add selected class
    const firstCard = page.locator(".record-list__item").first();
    await firstCard.click();
    await expect(firstCard).toHaveClass(/record-list__item--selected/);
  });

  test("selecting an article shows its fields in the inspector", async ({ page }) => {
    // Click first article card
    await page.locator(".record-list__item").first().click();

    // The first inspector section is the record detail — it must contain "Article text"
    await expect(page.locator(".inspector__section").first()).toContainText("Article text");

    // The placeholder text must not appear anywhere
    await expect(page.locator("text=Coming in B5")).not.toBeVisible();
    await expect(page.locator("text=Detail view not yet implemented")).not.toBeVisible();
  });

  test("selecting a decision shows its fields in the inspector", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await page.locator(".record-list__item").first().click();

    // Decision-specific field labels must appear in the first inspector section
    await expect(page.locator(".inspector__section").first()).toContainText("Decision statement");
  });

  test("selecting a role shows its fields in the inspector", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await page.locator(".record-list__item").first().click();

    // Role-specific field labels must appear in the first inspector section
    await expect(page.locator(".inspector__section").first()).toContainText("Role holder");
  });

  test("deselecting a card clears the inspector record section", async ({ page }) => {
    const firstCard = page.locator(".record-list__item").first();
    await firstCard.click(); // select
    await expect(page.locator(".inspector__section").first()).toContainText("Article text");

    await firstCard.click(); // deselect (toggle)
    // After deselect the record section disappears; Validation becomes the first section
    await expect(page.locator(".inspector__section").first()).toContainText("Validation");
    await expect(page.locator("text=Article text")).not.toBeVisible();
  });

  test("repo filename shown in topbar", async ({ page }) => {
    await expect(page.locator(".topbar__repo")).toContainText("gallery");
  });
});
