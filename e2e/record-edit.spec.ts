import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * record-edit.spec.ts — end-to-end tests for B9 record create/update/delete.
 *
 * Tests cover all three governance types (articles, decisions, roles) and
 * verify that the form appears, can be cancelled, and that WASM mutations
 * persist in the record list.
 *
 * B9 edit forms: https://github.com/the-greenman/srs-web/issues/5
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Record edit forms (B9)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM boot, then choose governance mode
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    // Wait for loaded state — nav shows Articles link
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  // --------------------------------------------------------------------------
  // Test 1: "New Article" button is visible after loading
  // --------------------------------------------------------------------------
  test('"New Article" button is visible after loading', async ({ page }) => {
    await expect(page.locator("button.topbar__new")).toBeVisible();
    await expect(page.locator("button.topbar__new")).toContainText("New Article");
  });

  // --------------------------------------------------------------------------
  // Test 2: Clicking "New Article" shows the form
  // --------------------------------------------------------------------------
  test("Clicking 'New Article' shows a form with Title field", async ({ page }) => {
    await page.locator("button.topbar__new").click();

    // Form should show a Title field
    await expect(
      page.locator(".field").filter({ hasText: "Title" }).locator("input")
    ).toBeVisible();

    // Record list should NOT be visible
    await expect(page.locator(".record-list")).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 3: Cancel returns to list
  // --------------------------------------------------------------------------
  test("Cancel returns to the record list", async ({ page }) => {
    await page.locator("button.topbar__new").click();

    // Verify form is shown
    await expect(
      page.locator(".field").filter({ hasText: "Title" }).locator("input")
    ).toBeVisible();

    // Click Cancel
    await page.locator("button", { hasText: "Cancel" }).click();

    // Record list should be visible again
    await expect(page.locator(".record-list")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 4: Create article successfully
  // --------------------------------------------------------------------------
  test("Create article successfully — appears in list", async ({ page }) => {
    await page.locator("button.topbar__new").click();

    // Fill Title
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Test Article E2E");

    // Fill Article Text
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Test body text");

    // Select Status "draft"
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");

    // Submit
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close and record list appears
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });

    // New article should appear somewhere in the list
    await expect(page.locator(".record-list")).toContainText("Test Article E2E");
  });

  // --------------------------------------------------------------------------
  // Test 5: Create decision successfully
  // --------------------------------------------------------------------------
  test("Create decision successfully — appears in list", async ({ page }) => {
    // Navigate to Decision Log
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();

    // New Decision opens the DecisionFlow mode chooser (B12)
    await page.locator("button.topbar__new").click();

    // Select Quick Capture mode
    await page.getByRole("button", { name: "Quick Capture" }).click();

    // Fill Title
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Test Decision E2E");

    // Fill Decision Statement
    await page.locator(".field").filter({ hasText: "Decision Statement" }).locator("textarea").fill("We decided to test");

    // Select Status "draft"
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");

    // Submit
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close and record appears in list
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list")).toContainText("Test Decision E2E");
  });

  // --------------------------------------------------------------------------
  // Test 6: Edit existing record
  // Note: gallery articles are all "active" (immutable state), so we create a
  // fresh draft article first, then edit it.
  // --------------------------------------------------------------------------
  test("Edit existing record — updated title appears in list", async ({ page }) => {
    // Create a new draft article to edit (gallery articles are all active and guarded)
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("To Be Edited");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Original body");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Wait for list to show the new record
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list")).toContainText("To Be Edited");

    // Select the new draft card (it should be auto-selected after creation)
    const newCard = page.locator(".record-list__item").filter({ hasText: "To Be Edited" });
    const editBtn = page.locator("button.inspector__btn", { hasText: "Edit" });
    if (!(await editBtn.isVisible())) {
      await newCard.click();
    }

    // Click Edit in the inspector — the draft record is not immutable, so the form opens
    await editBtn.click();

    // Form should be visible (not the modal)
    await expect(
      page.locator(".field").filter({ hasText: "Title" }).locator("input")
    ).toBeVisible({ timeout: 5000 });

    // Update the title
    const titleInput = page.locator(".field").filter({ hasText: "Title" }).locator("input");
    await titleInput.clear();
    await titleInput.fill("Edited Title E2E");

    // Submit
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close and updated title appears
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list")).toContainText("Edited Title E2E");
    await expect(page.locator(".record-list")).not.toContainText("To Be Edited");
  });

  // --------------------------------------------------------------------------
  // Test 7: Delete a newly-created record
  // Pre-existing gallery articles are part of sequence relations and cannot be
  // deleted. Instead, create a fresh article (no relations), then delete it.
  // --------------------------------------------------------------------------
  test("Delete a newly-created record — record count decreases by 1", async ({ page }) => {
    // Count articles before creating
    const initialCount = await page.locator(".record-list__item").count();

    // Create a new article (no relations, so deletable)
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("To Be Deleted");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Delete me");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Wait for list with new article
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list__item")).toHaveCount(initialCount + 1, { timeout: 3000 });

    // After save, the new record is pre-selected (selectedId = created.instanceId).
    // The inspector should already show Edit/Delete buttons.
    // If it's not visible, click the new card to select it.
    const deleteBtn = page.locator("button.inspector__btn--danger", { hasText: "Delete" });
    if (!(await deleteBtn.isVisible())) {
      await page.locator(".record-list__item").filter({ hasText: "To Be Deleted" }).click();
    }
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });

    // Click Delete in the inspector
    await deleteBtn.click();

    // Wait for list to update — count should be back to initial
    await expect(page.locator(".record-list__item")).toHaveCount(initialCount, { timeout: 3000 });
  });

  // --------------------------------------------------------------------------
  // Test 8: Create role successfully
  // --------------------------------------------------------------------------
  test("Create role successfully — appears in list", async ({ page }) => {
    // Navigate to Roles
    await page.getByRole("link", { name: /Roles/ }).click();
    await expect(page.getByRole("heading", { name: "Roles", level: 2 })).toBeVisible();

    await page.locator("button.topbar__new").click();

    // Fill Title
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Test Role E2E");

    // Fill Authority
    await page.locator(".field").filter({ hasText: "Authority" }).locator("textarea").fill("Test authority");

    // Fill Boundary
    await page.locator(".field").filter({ hasText: "Boundary" }).locator("textarea").fill("Test boundary");

    // Select Status "draft"
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");

    // Submit
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close and role appears in list
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list")).toContainText("Test Role E2E");
  });
});
