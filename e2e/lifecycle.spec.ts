import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * lifecycle.spec.ts — end-to-end tests for B11 lifecycle transitions and
 * immutability guard / successor creation.
 *
 * The gallery fixture has 6 articles:
 * - 5 in `lifecycleState: "ratified"` — non-immutable (can transition → supersede / → close)
 * - 1 in `lifecycleState: "closed"` ("How we make decisions" / A-004) — final/immutable
 *   (Edit shows the successor modal)
 *
 * Lifecycle buttons now show transition *names* (e.g. "→ propose") not target states
 * (e.g. "→ proposed"), because the WASM binding returns transition names from the
 * lifecycle definition (GovernanceShell srs-web#135).
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
  // Test 1: Lifecycle transition buttons appear for a ratified record
  // All gallery articles with lifecycleState "ratified" have transitions
  // → supersede and → close (transition names, not target state names).
  // --------------------------------------------------------------------------
  test("Lifecycle transition buttons appear for selected ratified record", async ({ page }) => {
    // Select a ratified article — use one that is not "closed"
    await page.locator(".record-list__item").filter({ hasText: "What this is" }).click();

    // Inspector should show transition buttons for "ratified" state
    const transitionsDiv = page.locator(".inspector__transitions");
    await expect(transitionsDiv).toBeVisible({ timeout: 3000 });

    // At least one transition button should be present
    const transitionBtns = page.locator(".inspector__btn--transition");
    await expect(transitionBtns.first()).toBeVisible();

    // Specifically check for "→ supersede" and "→ close" (transition names, not target states)
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ supersede" })).toBeVisible();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ close" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 2: Transition buttons appear for a draft record (create one first)
  // New records start with lifecycleState "draft" (auto-set by Rust engine).
  // From draft, only one transition is available: → propose.
  // --------------------------------------------------------------------------
  test("Draft record shows only → propose transition", async ({ page }) => {
    // Navigate to Articles and create a new draft article
    await page.getByRole("link", { name: /Articles/ }).click();
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Draft Article for Lifecycle Test");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Test body");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });

    // Draft → only one transition: → propose (the governance lifecycle define only propose from draft)
    const transitionsDiv = page.locator(".inspector__transitions");
    await expect(transitionsDiv).toBeVisible({ timeout: 3000 });

    await expect(page.locator(".inspector__btn--transition", { hasText: "→ propose" })).toBeVisible();

    // There must NOT be old hardcoded transitions → active or → deferred
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ active" })).not.toBeVisible();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ deferred" })).not.toBeVisible();

    // Count: exactly 1 transition button (propose is the only transition from draft)
    await expect(page.locator(".inspector__btn--transition")).toHaveCount(1);
  });

  // --------------------------------------------------------------------------
  // Test 3: Clicking a transition button updates the available transitions
  // Start with a draft article, click "→ propose", verify the available
  // transitions change to those from the "proposed" state (→ revise, → ratify).
  // --------------------------------------------------------------------------
  test("Clicking → propose changes available transitions to proposed-state transitions", async ({ page }) => {
    // Navigate to Articles and create a draft article
    await page.getByRole("link", { name: /Articles/ }).click();
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Transition Test Article");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Body");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });

    // Click "→ propose" to transition to "proposed"
    await page.locator(".inspector__btn--transition", { hasText: "→ propose" }).click();

    // After proposing, the available transitions should change to those from "proposed":
    // → revise (back to draft) and → ratify (forward to ratified)
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ revise" })).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ ratify" })).toBeVisible();

    // "→ propose" should no longer be visible (we are no longer in draft)
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ propose" })).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 4: Closed record shows successor modal instead of Edit form
  // The closed article "How we make decisions" (A-004) has lifecycleState "closed"
  // which is a final/immutable state — clicking Edit must show the modal.
  // --------------------------------------------------------------------------
  test("Clicking Edit on a closed record shows the successor modal", async ({ page }) => {
    // Navigate to Articles and select the closed record
    await page.getByRole("link", { name: /Articles/ }).click();
    await page.locator(".record-list__item").filter({ hasText: "How we make decisions" }).click();

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
    // Select the closed article
    await page.getByRole("link", { name: /Articles/ }).click();
    await page.locator(".record-list__item").filter({ hasText: "How we make decisions" }).click();

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
    // Navigate to Articles
    await page.getByRole("link", { name: /Articles/ }).click();

    // Initial article count (gallery has 6)
    const initialCount = await page.locator(".record-list__item").count();

    // Select the closed article (immutable — Edit shows the modal)
    await page.locator(".record-list__item").filter({ hasText: "How we make decisions" }).click();

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
  // Transition a new record from draft → proposed → ratified → closed via
  // the governance lifecycle transitions. After closing, no buttons appear.
  // --------------------------------------------------------------------------
  test("Terminal state 'closed' shows no transition buttons", async ({ page }) => {
    // Create a new article (starts in lifecycle state "draft")
    await page.getByRole("link", { name: /Articles/ }).click();
    await page.locator("button.topbar__new").click();
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("To Be Closed");
    await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Terminal test");
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, reading view opens with draft transitions
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".inspector__transitions")).toBeVisible({ timeout: 3000 });

    // Step 1: draft → proposed
    await page.locator(".inspector__btn--transition", { hasText: "→ propose" }).click();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ ratify" })).toBeVisible({ timeout: 3000 });

    // Step 2: proposed → ratified
    await page.locator(".inspector__btn--transition", { hasText: "→ ratify" }).click();
    await expect(page.locator(".inspector__btn--transition", { hasText: "→ close" })).toBeVisible({ timeout: 3000 });

    // Step 3: ratified → closed (terminal/final state)
    await page.locator(".inspector__btn--transition", { hasText: "→ close" }).click();

    // No transition buttons should be visible (closed is a final state)
    await expect(page.locator(".inspector__transitions")).not.toBeVisible({ timeout: 3000 });
  });
});
