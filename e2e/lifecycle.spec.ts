import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * lifecycle.spec.ts — end-to-end tests for B11 lifecycle transitions and
 * immutability guard / successor creation.
 *
 * The gallery fixture has 6 articles all with status "active", so tests that
 * need an immutable record can use gallery records directly, and tests that
 * need a draft record create one first.
 *
 * B11 lifecycle & supersession: https://github.com/the-greenman/srs-web/issues/7
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Lifecycle transitions (B11)", () => {
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
  // Test 1: Lifecycle transition buttons appear for an active record
  // All gallery articles are "active", so transitions → closed and → superseded
  // should appear.
  // --------------------------------------------------------------------------
  test("Lifecycle transition buttons appear for selected active record", async ({ page }) => {
    // Select the first article (all gallery articles are active)
    await page.locator(".record-list__item").first().click();

    // Inspector should show transition buttons for "active" state
    // active → closed and active → superseded
    const transitionsDiv = page.locator(".inspector__transitions");
    await expect(transitionsDiv).toBeVisible({ timeout: 3000 });

    // At least one transition button should be present
    const transitionBtns = page.locator(".inspector__btn--transition");
    await expect(transitionBtns.first()).toBeVisible();

    // Specifically check for "→ closed" and "→ superseded"
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ closed" })).toBeVisible();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ superseded" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 2: Transition buttons appear for a draft record (create one first)
  // --------------------------------------------------------------------------
  test("Draft record shows draft→proposed/active/deferred transitions", async ({ page }) => {
    // Create a new draft article
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Draft Article for Lifecycle Test");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Test body");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });

    // Should show transitions for draft: → proposed, → active, → deferred
    const transitionsDiv = page.locator(".inspector__transitions");
    await expect(transitionsDiv).toBeVisible({ timeout: 3000 });

    await expect(page.locator(".inspector__btn--transition", { hasText: "→ proposed" })).toBeVisible();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ active" })).toBeVisible();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ deferred" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 3: Clicking a transition button changes the record's status
  // Start with a draft article, click "→ proposed", check status badge updates.
  // --------------------------------------------------------------------------
  test("Clicking a transition button changes the record status", async ({ page }) => {
    // Create a draft article
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Transition Test Article");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Body");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });

    // Click "→ proposed"
    await page.locator(".inspector__btn--transition", { hasText: "→ proposed" }).click();

    // Click back to verify the list card shows the updated status.
    await page.getByTestId("record-reading-back").click();
    await expect(
      page.locator(".record-list__item").filter({ hasText: "Transition Test Article" })
    ).toContainText("proposed", { timeout: 3000 });
  });

  // --------------------------------------------------------------------------
  // Test 4: Active record shows successor modal instead of Edit form
  // All gallery records are active, so click Edit on first article.
  // --------------------------------------------------------------------------
  test("Clicking Edit on an active record shows the successor modal", async ({ page }) => {
    // Select first article (active)
    await page.locator(".record-list__item").first().click();

    // Inspector should be visible with Edit button
    const editBtn = page.locator("button.inspector__btn", { hasText: "Edit" });
    await expect(editBtn).toBeVisible({ timeout: 3000 });

    // Click Edit — should show the successor modal instead of the form
    await editBtn.click();

    // The modal overlay should appear
    await expect(page.locator(".modal-overlay")).toBeVisible({ timeout: 3000 });

    // Modal should contain "Create Successor" button
    await expect(page.locator("button", { hasText: "Create Successor" })).toBeVisible();

    // Modal should contain "Cancel" button
    await expect(page.locator("button", { hasText: "Cancel" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 5: Cancelling the successor modal dismisses it without changes
  // --------------------------------------------------------------------------
  test("Cancelling the successor modal dismisses it", async ({ page }) => {
    // Select first active article
    await page.locator(".record-list__item").first().click();

    // Click Edit to trigger the modal
    await page.locator("button.inspector__btn", { hasText: "Edit" }).click();
    await expect(page.locator(".modal-overlay")).toBeVisible({ timeout: 3000 });

    // Click Cancel
    await page.locator("button", { hasText: "Cancel" }).click();

    // Modal should be gone
    await expect(page.locator(".modal-overlay")).not.toBeVisible();

    // Inspector should still show the original record (Edit button still there)
    await expect(page.locator("button.inspector__btn", { hasText: "Edit" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 6: Creating a successor adds a new draft record to the list
  // --------------------------------------------------------------------------
  test("Creating a successor increases article count by 1 with a draft record", async ({ page }) => {
    // Initial article count (gallery has 6)
    const initialCount = await page.locator(".record-list__item").count();

    // Select first active article
    await page.locator(".record-list__item").first().click();

    // Click Edit — modal appears
    await page.locator("button.inspector__btn", { hasText: "Edit" }).click();
    await expect(page.locator(".modal-overlay")).toBeVisible({ timeout: 3000 });

    // Click "Create Successor"
    await page.locator("button", { hasText: "Create Successor" }).click();

    // Modal should be gone
    await expect(page.locator(".modal-overlay")).not.toBeVisible();

    // The successor is auto-selected — reading view opens for the new draft.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });

    // Click back to verify the list count increased by 1.
    await page.getByTestId("record-reading-back").click();
    await expect(page.locator(".record-list__item")).toHaveCount(initialCount + 1, { timeout: 3000 });
  });

  // --------------------------------------------------------------------------
  // Test 7: Terminal states show no transition buttons
  // Transition a record to "closed" and verify no transition buttons appear.
  // --------------------------------------------------------------------------
  test("Terminal state 'closed' shows no transition buttons", async ({ page }) => {
    // Create a draft article and transition it to closed via active
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("To Be Closed");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Terminal test");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("active");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });

    // Should show active → closed and active → superseded
    await expect(page.locator(".inspector__transitions")).toBeVisible({ timeout: 3000 });

    // Transition to "closed"
    await page.locator(".inspector__btn--transition", { hasText: "→ closed" }).click();

    // No transition buttons should be visible in the inspector (closed is terminal)
    await expect(page.locator(".inspector__transitions")).not.toBeVisible();

    // Click back to verify the list card shows the updated "closed" status.
    await page.getByTestId("record-reading-back").click();
    await expect(
      page.locator(".record-list__item").filter({ hasText: "To Be Closed" })
    ).toContainText("closed", { timeout: 3000 });
  });
});
