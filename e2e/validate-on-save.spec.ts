import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * validate-on-save.spec.ts — B13: diagnostics refresh after every mutation.
 *
 * Verifies that the Validation inspector section updates in real-time after
 * create, edit, and delete operations, and that instanceCount stays in sync.
 *
 * B13 validate-on-save: https://github.com/the-greenman/srs-web/issues/9
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Validate on save (B13)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    // Wait for loaded state — nav shows Articles link
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  // --------------------------------------------------------------------------
  // Helper: scope to the Validation inspector section specifically by its title
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // Test 1: Validation panel shows "clean" after loading
  // --------------------------------------------------------------------------
  test("Validation panel shows clean after loading", async ({ page }) => {
    // Target the title-aside inside the section whose title reads "Validation"
    await expect(
      page.locator(".inspector__title").filter({ hasText: "Validation" }).locator(".inspector__title-aside")
    ).toContainText("clean");
  });

  // --------------------------------------------------------------------------
  // Test 2: Validation panel updates after creating a record
  // --------------------------------------------------------------------------
  test("Validation panel stays clean and record count increases after creating a record", async ({ page }) => {
    // Read the initial instanceCount from the Repository section aside
    const repoAside = page.locator(".inspector__title").filter({ hasText: "Repository" }).locator(".inspector__title-aside");
    const initialCountText = await repoAside.textContent();
    const initialCount = parseInt(initialCountText ?? "0", 10);

    // Create a new article
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Validation Test Article");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Body text for validation test");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close — record list returns
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });

    // Validation should still be clean
    await expect(
      page.locator(".inspector__title").filter({ hasText: "Validation" }).locator(".inspector__title-aside")
    ).toContainText("clean");

    // Repository section should show instanceCount incremented by 1
    const newCountText = await repoAside.textContent();
    const newCount = parseInt(newCountText ?? "0", 10);
    expect(newCount).toBe(initialCount + 1);
  });

  // --------------------------------------------------------------------------
  // Test 3: Validation panel updates after deleting a record
  // --------------------------------------------------------------------------
  test("Validation panel stays clean and record count decreases after deleting a record", async ({ page }) => {
    // First create a deletable record (no relations)
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("To Delete For Validation");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Will be deleted");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });

    // Read instanceCount after create
    const repoAside = page.locator(".inspector__title").filter({ hasText: "Repository" }).locator(".inspector__title-aside");
    const countAfterCreate = parseInt((await repoAside.textContent()) ?? "0", 10);

    // Select the newly created record (auto-selected after create, but verify)
    const deleteBtn = page.locator("button.inspector__btn--danger", { hasText: "Delete" });
    if (!(await deleteBtn.isVisible())) {
      await page.locator(".record-list__item").filter({ hasText: "To Delete For Validation" }).click();
    }
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });

    // Delete it
    await deleteBtn.click();

    // Validation section should still be clean
    await expect(
      page.locator(".inspector__title").filter({ hasText: "Validation" }).locator(".inspector__title-aside")
    ).toContainText("clean");

    // Record count should have decreased by 1
    const countAfterDelete = parseInt((await repoAside.textContent()) ?? "0", 10);
    expect(countAfterDelete).toBe(countAfterCreate - 1);
  });

  // --------------------------------------------------------------------------
  // Test 4: Validation panel updates after editing a record
  // --------------------------------------------------------------------------
  test("Validation panel stays clean after editing a record", async ({ page }) => {
    // Select the first article
    await page.locator(".record-list__item").first().click();

    // Click Edit in the inspector
    await page.locator("button.inspector__btn", { hasText: "Edit" }).click();

    // Change the title
    const titleInput = page.locator(".field").filter({ hasText: "Title" }).locator("input");
    await titleInput.clear();
    await titleInput.fill("Edited For Validation Test");

    // Save
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });

    // Validation section should still be clean
    await expect(
      page.locator(".inspector__title").filter({ hasText: "Validation" }).locator(".inspector__title-aside")
    ).toContainText("clean");
  });
});
