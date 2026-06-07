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
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
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

  test("repo filename shown in topbar", async ({ page }) => {
    await expect(page.locator(".topbar__repo")).toContainText("gallery");
  });
});
