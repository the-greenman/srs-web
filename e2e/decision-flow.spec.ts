import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * decision-flow.spec.ts — end-to-end tests for B12 decision protocol.
 *
 * Tests cover the mode chooser, Quick Capture flow, Full Deliberation wizard,
 * and the Decision Summary Card.
 *
 * B12 decision protocol: https://github.com/the-greenman/srs-web/issues/8
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Decision Flow (B12)", () => {
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

  // Navigate to Decision Log section
  async function goToDecisions(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();
  }

  // --------------------------------------------------------------------------
  // Test 1: "New Decision" shows mode chooser
  // --------------------------------------------------------------------------
  test('"New Decision" shows mode chooser with Quick Capture and Full Deliberation options', async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();

    await expect(page.getByRole("button", { name: "Quick Capture" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Full Deliberation" })).toBeVisible();
    await expect(page.getByText("Record a decision that's already clear")).toBeVisible();
    await expect(page.getByText("Walk through the deliberation process step by step")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 2: Quick Capture creates a decision
  // --------------------------------------------------------------------------
  test("Quick Capture creates a decision that appears in the Decision Log list", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Quick Capture" }).click();

    // Fill Title
    await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Quick Decision E2E");

    // Fill Decision Statement
    await page.locator(".field").filter({ hasText: "Decision Statement" }).locator("textarea").fill("We will use TypeScript");

    // Fill Rationale
    await page.locator(".field").filter({ hasText: "Rationale" }).locator("textarea").fill("It's safer");

    // Select Status
    await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");

    // Click Save
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("record-reading")).toContainText("Quick Decision E2E");

    // Click back — record list should contain the new decision.
    await page.getByTestId("record-reading-back").click();
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list")).toContainText("Quick Decision E2E");
  });

  // --------------------------------------------------------------------------
  // Test 3: Quick Capture shows summary card when both fields are filled
  // --------------------------------------------------------------------------
  test("Quick Capture shows Decision Summary Card once decision_statement and rationale are filled", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Quick Capture" }).click();

    // Summary should not be visible yet
    await expect(page.locator(".decision-summary")).not.toBeVisible();

    // Fill Decision Statement
    await page.locator(".field").filter({ hasText: "Decision Statement" }).locator("textarea").fill("We will use TypeScript");

    // Still not visible — only one field filled
    await expect(page.locator(".decision-summary")).not.toBeVisible();

    // Fill Rationale
    await page.locator(".field").filter({ hasText: "Rationale" }).locator("textarea").fill("It's safer");

    // Now summary card should be visible
    await expect(page.locator(".decision-summary")).toBeVisible();
    await expect(page.locator(".decision-summary")).toContainText("We will use TypeScript");
    await expect(page.locator(".decision-summary")).toContainText("It's safer");
  });

  // --------------------------------------------------------------------------
  // Test 4: Full Deliberation shows stage 1
  // --------------------------------------------------------------------------
  test("Full Deliberation shows Stage 1 progress indicator and Decision Question field", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Full Deliberation" }).click();

    // Stage 1 progress label
    await expect(page.locator(".decision-flow__progress-label")).toContainText("Stage 1 of 9: Decision Question");
    // Field label for Decision Question
    await expect(page.locator(".field__label", { hasText: "Decision Question" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 5: Full Deliberation navigates between stages
  // --------------------------------------------------------------------------
  test("Full Deliberation navigates from stage 1 to stage 2 via Next button", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Full Deliberation" }).click();

    // Stage 1: fill Decision Question field
    await page.locator("#del-stage-field").fill("Should we adopt TypeScript?");

    // Click Next
    await page.getByRole("button", { name: "Next" }).click();

    // Stage 2 should now show
    await expect(page.locator(".decision-flow__progress-label")).toContainText("Stage 2 of 9: Context");
    // Field label for Context
    await expect(page.locator(".field__label", { hasText: "Context" })).toBeVisible();
    // Back button should now be visible
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 6: Full Deliberation creates a decision on final Save
  // --------------------------------------------------------------------------
  test("Full Deliberation creates a decision after completing all stages", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await page.getByRole("button", { name: "Full Deliberation" }).click();

    // Fill persistent title
    await page.locator("#del-title").fill("Full Deliberation E2E Decision");

    const stageTexts = [
      "What to decide?",       // Stage 1: Decision Question
      "Background context",    // Stage 2: Context
      "Some friction",         // Stage 3: Friction
      "Option A vs B",         // Stage 4: Alternatives Considered
      "Must be fast",          // Stage 5: Key Requirements
      "We chose option A",     // Stage 6: Decision Statement
      "Option A is faster",    // Stage 7: Rationale
      "Revisit in 6 months",   // Stage 8: Revisit When
      "Ship it",               // Stage 9: Next Steps
    ];

    for (let i = 0; i < stageTexts.length; i++) {
      await page.locator("#del-stage-field").fill(stageTexts[i]);

      if (i < stageTexts.length - 1) {
        await page.getByRole("button", { name: "Next" }).click();
        await expect(page.locator(".decision-flow__progress-label")).toContainText(`Stage ${i + 2} of 9`);
      }
    }

    // Final stage — Save button should be present
    await expect(page.locator("button[type=submit]", { hasText: "Save" })).toBeVisible();

    // Select status (persistent header)
    await page.locator("#del-status").selectOption("draft");

    // Click Save
    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // After save, the new record is auto-selected and the reading view opens.
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("record-reading")).toContainText("Full Deliberation E2E Decision");

    // Click back — record list should contain the new decision.
    await page.getByTestId("record-reading-back").click();
    await expect(page.locator(".record-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".record-list")).toContainText("Full Deliberation E2E Decision");
  });

  // --------------------------------------------------------------------------
  // Test 7: Cancel from mode chooser returns to list
  // --------------------------------------------------------------------------
  test("Cancel from mode chooser returns to Decision Log list", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();

    // Should see mode chooser
    await expect(page.getByRole("button", { name: "Quick Capture" })).toBeVisible();

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Decision Log list should be visible again
    await expect(page.locator(".record-list")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();
  });
});
