import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * decision-flow.spec.ts — end-to-end tests for decision create via generic RecordForm.
 *
 * Quick Capture and Full Deliberation modes are permanently removed (srs-web#103).
 * Decisions now go through the same RecordForm path as all other record types.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Decision create (generic RecordForm, srs-web#103)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM boot, then choose governance mode
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    // Wait for loaded state — nav shows Decision Log link
    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
  });

  async function goToDecisions(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 5000 });
  }

  // --------------------------------------------------------------------------
  // Test 1: "New" button opens generic RecordForm
  // --------------------------------------------------------------------------
  test("New button opens generic RecordForm", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();

    await expect(page.getByTestId("record-form")).toBeVisible({ timeout: 3000 });
  });

  // --------------------------------------------------------------------------
  // Test 2: RecordForm create saves decision and shows it in the list
  // --------------------------------------------------------------------------
  test("RecordForm create saves decision and shows it in the list", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await expect(page.getByTestId("record-form")).toBeVisible({ timeout: 3000 });

    // Fill both required fields (Title + Decision Statement) — the form
    // enforces the schema's required flags natively.
    await page
      .locator('[data-testid="record-form"] .field')
      .filter({ hasText: "Title" })
      .locator("input")
      .fill("E2E RecordForm Decision");
    await page
      .locator('[data-testid="record-form"] .field')
      .filter({ hasText: "Decision Statement" })
      .locator("textarea")
      .fill("We adopt the generic RecordForm path for decision capture.");

    // Submit
    await page.locator("button[type=submit]").click();

    // After save, the new record is auto-selected and the reading view opens
    await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("record-reading")).toContainText("E2E RecordForm Decision");

    // Click back — decision log view should contain the new decision
    await page.getByTestId("record-reading-back").click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("decision-log-view")).toContainText("E2E RecordForm Decision");
  });

  // --------------------------------------------------------------------------
  // Test 3: Cancel from RecordForm returns to decision log list
  // --------------------------------------------------------------------------
  test("Cancel from RecordForm returns to decision log list", async ({ page }) => {
    await goToDecisions(page);

    await page.locator("button.topbar__new").click();
    await expect(page.getByTestId("record-form")).toBeVisible({ timeout: 3000 });

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 3000 });
  });
});
