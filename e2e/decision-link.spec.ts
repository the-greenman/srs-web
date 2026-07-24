import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * decision-link.spec.ts — e2e tests for the decision link picker (srs-web#106).
 *
 * Tests the happy path: "Decision Links" inspector section appears for selected
 * decisions, the picker modal opens, and creating a relation persists in the list.
 *
 * The gallery fixture has 9 decision records, so the picker will always have
 * other decisions to show.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Decision link picker (srs-web#106)", () => {
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

    // Navigate to the Decision Log section
    await page.getByRole("link", { name: /Decision Log/ }).click();

    // Wait for decision list to render (gallery has 9 decisions)
    await expect(page.getByTestId("decision-summary-card").first()).toBeVisible({ timeout: 5000 });

    // Select the first decision — opens the full record and the Decision Links inspector
    await page.getByTestId("decision-summary-card").first().click();
  });

  // --------------------------------------------------------------------------
  // Test 1: "Decision Links" inspector section appears for a selected decision
  // --------------------------------------------------------------------------
  test("Decision Links inspector section appears for a selected decision", async ({ page }) => {
    // The "Link to decision" button should be visible in the inspector
    await expect(page.getByTestId("add-relation-btn")).toBeVisible({ timeout: 3000 });
  });

  // --------------------------------------------------------------------------
  // Test 2: Link picker modal opens and shows decisions
  // --------------------------------------------------------------------------
  test("Link picker opens and shows searchable decisions list", async ({ page }) => {
    // Click "Link to decision" button
    await page.getByTestId("add-relation-btn").click();

    // Modal title should be visible
    await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({
      timeout: 3000,
    });

    // Search input should be present
    await expect(page.getByTestId("link-search")).toBeVisible();

    // Relation type selector should be present
    await expect(page.getByTestId("link-relation-type")).toBeVisible();

    // At least one other decision should appear in the list
    await expect(page.getByTestId("link-decision-item").first()).toBeVisible({ timeout: 3000 });

    // "Add link" button should be disabled until a decision is selected
    await expect(page.getByTestId("link-confirm")).toBeDisabled();
  });

  // --------------------------------------------------------------------------
  // Test 3: Creating a relation persists in the relations list
  // --------------------------------------------------------------------------
  test("Creating a relation closes the modal and shows it in the relations list", async ({ page }) => {
    // Open the picker
    await page.getByTestId("add-relation-btn").click();
    await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({
      timeout: 3000,
    });

    // Use a relation type installed in the gallery package (precedes)
    await page.getByTestId("link-relation-type").selectOption("precedes");

    // Select the first available target decision
    await page.getByTestId("link-decision-item").first().click();

    // "Add link" button should now be enabled
    await expect(page.getByTestId("link-confirm")).toBeEnabled();

    // Confirm the link
    await page.getByTestId("link-confirm").click();

    // Modal should close
    await expect(page.locator(".modal-overlay")).not.toBeVisible({ timeout: 3000 });

    // Relations list should now show at least one relation item
    await expect(page.getByTestId("decision-relations-list")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("relation-item").first()).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Test 4: Deleting a relation removes it from the list (srs-web#116)
  // --------------------------------------------------------------------------
  test("Deleting a relation removes it from the relations list", async ({ page }) => {
    // Snapshot existing relation count before adding one
    const initialCount = await page.getByTestId("relation-item").count();

    // Create a relation (same as Test 3 setup)
    await page.getByTestId("add-relation-btn").click();
    await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({
      timeout: 3000,
    });
    await page.getByTestId("link-relation-type").selectOption("precedes");
    await page.getByTestId("link-decision-item").first().click();
    await page.getByTestId("link-confirm").click();
    await expect(page.locator(".modal-overlay")).not.toBeVisible({ timeout: 3000 });

    // Confirm the new relation appeared (count went up by 1)
    await expect(page.getByTestId("relation-item")).toHaveCount(initialCount + 1, {
      timeout: 3000,
    });

    // Delete the last relation in the list (the one just created ends up last)
    await page.getByTestId("delete-relation-btn").last().click();

    // Count should be back to the initial value
    await expect(page.getByTestId("relation-item")).toHaveCount(initialCount, { timeout: 3000 });
  });

  // --------------------------------------------------------------------------
  // Test 5: Relation type dropdown shows package-installed + core canonical types (srs-web#160)
  // --------------------------------------------------------------------------
  test("Relation type dropdown shows package-installed and core canonical types for gallery fixture", async ({ page }) => {
    // Open the link picker
    await page.getByTestId("add-relation-btn").click();
    await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({
      timeout: 3000,
    });

    const select = page.getByTestId("link-relation-type");
    await expect(select).toBeVisible();

    // The gallery package installs its own "delegates" extension type, plus
    // derived-from/evidences/precedes/supersedes (supersedes added for lifecycle
    // successor creation, srs-web#135). Since ADR-025's amendment (srs-rust#685),
    // the WASM engine also implicitly merges the seven canonical core relation
    // types (contains, depends-on, supersedes, refines, derived-from, evidences,
    // precedes) into every loaded package, so "depends-on" and friends now
    // legitimately appear too — don't assert an exact option count or exclude
    // canonical types, since the core set can grow independently of the package.
    const optionValues = await select.locator("option").evaluateAll(
      (els) => els.map((el) => (el as HTMLOptionElement).value)
    );
    expect(optionValues).toContain("delegates");
    expect(optionValues).toContain("derived-from");
    expect(optionValues).toContain("evidences");
    expect(optionValues).toContain("precedes");
    expect(optionValues).toContain("supersedes");
    expect(optionValues).toContain("contains");
    expect(optionValues).toContain("depends-on");
    expect(optionValues).toContain("refines");
  });
});

// ----------------------------------------------------------------------------
// Cross-container link rendering + navigation (srs-web#201, srs-web#202)
//
// The gallery fixture ships an `evidences` relation from the "Mounting system"
// decision to the "Care of the building" article — a peer in a *different*
// container. The label must resolve repo-wide (not fall back to a UUID), and
// clicking the peer must navigate to the linked record.
// ----------------------------------------------------------------------------
test.describe("Decision link labels and navigation (#201, #202)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });
    await page
      .locator('input[type="file"]#srsj-file')
      .setInputFiles(path.join(__dirname, "fixtures", "gallery.srsj"));
    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-summary-card").first()).toBeVisible({ timeout: 5000 });

    // Select the "Mounting system" decision (evidences → article "Care of the building")
    await page
      .getByTestId("decision-summary-card")
      .filter({ hasText: "Mounting system" })
      .first()
      .click();
    await expect(page.getByTestId("decision-relations-list")).toBeVisible({ timeout: 3000 });
  });

  test("cross-container peer shows the linked record's label, not a UUID (#201)", async ({ page }) => {
    const evidencesRow = page.getByTestId("relation-item").filter({ hasText: "evidences" });
    await expect(evidencesRow.first()).toContainText("Care of the building");
    // No truncated-UUID fallback anywhere in the list
    await expect(page.getByTestId("decision-relations-list")).not.toContainText(/[0-9a-f]{8}…/);
  });

  test("clicking a peer navigates to the linked record in its own section (#202)", async ({ page }) => {
    await page
      .getByTestId("relation-peer-link")
      .filter({ hasText: "Care of the building" })
      .first()
      .click();

    // The linked article opens in the reading view…
    await expect(page.getByTestId("record-reading")).toContainText("Care of the building", {
      timeout: 3000,
    });

    // …and the active section switched to Articles (visible once reading closes)
    await page.getByTestId("record-reading-back").click();
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible({
      timeout: 3000,
    });
  });
});
