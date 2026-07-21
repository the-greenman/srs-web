import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * guides-editor.spec.ts — C8: blueprint-schema-driven guides renderer.
 *
 * Loads muSrs.srsj via the Guides editor mode and verifies:
 *  - Guide list renders from the repository.
 *  - Section type forms are driven by the blueprint schema (correct fields per type).
 *  - Creating and editing a section record persists correctly.
 *  - Export + reload round-trips the created/edited section.
 *
 * C8 blueprint-schema-driven guides renderer: srs-web#26
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_PATH = path.join(__dirname, "fixtures", "muSrs.srsj");

// ---------------------------------------------------------------------------
// Section type UUIDs (stable — from muDemocracy package)
// ---------------------------------------------------------------------------
const SECTION_TEXT_ID = "4408a98e-d23e-4bc6-aef5-d8678571e2f6";
const SECTION_LIST_ID = "76cdc3fb-8460-4efc-90f5-3c4a15b86cad";
const SECTION_TABLE_ID = "d8d09d3b-8253-4d8d-b187-42f35c8446a7";
const SECTION_COMMENTARY_ID = "474e299c-5809-4f92-a40d-b3ae1be3ad17";

// ---------------------------------------------------------------------------
// Shared setup: load muSrs.srsj in Guides mode
// ---------------------------------------------------------------------------
test.describe("Guides editor (C8)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM to boot and mode picker to appear, then choose Guides.
    await page.getByTestId("mode-guides").click({ timeout: 15000 });
    await expect(page.getByTestId("guides-file-picker")).toBeVisible({ timeout: 5000 });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_PATH);

    // Guides shell should appear once WASM loads the repo.
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
  });

  // --------------------------------------------------------------------------
  // Test 1: Guide list renders from the loaded repository
  // --------------------------------------------------------------------------
  test("Guide list is visible and shows guides from muSrs.srsj", async ({ page }) => {
    const list = page.getByTestId("guides-guide-list");
    await expect(list).toBeVisible();

    // muSrs.srsj has 4 guides; at least one well-known title must appear.
    await expect(list).toContainText("Deciding which decisions to record");
    await expect(list).toContainText("Recognising decisions");
  });

  // --------------------------------------------------------------------------
  // Test 2: section.text form has correct blueprint-schema fields
  // --------------------------------------------------------------------------
  test("section.text form renders heading (input) and body (textarea) from schema", async ({
    page,
  }) => {
    // Select the first guide to enable "Add Section".
    await page.getByTestId("guides-guide-item").first().click();

    // Open the section type picker and choose section.text.
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_TEXT_ID}`).click();

    // Form should be visible (title "Text section" from blueprint label).
    await expect(page.getByRole("heading", { name: "New Text section" })).toBeVisible();

    // Heading field → plain text input (not textarea).
    const headingField = page.locator(".field").filter({ hasText: "Display heading for a section" });
    await expect(headingField.locator("input")).toBeVisible();

    // Body field → textarea (x-srs-widget: textarea).
    const bodyField = page.locator(".field").filter({ hasText: "Main body content" });
    await expect(bodyField.locator("textarea")).toBeVisible();

    // Callout field → textarea.
    const calloutField = page.locator(".field").filter({ hasText: "Highlighted callout" });
    await expect(calloutField.locator("textarea")).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).click();
  });

  // --------------------------------------------------------------------------
  // Test 3: section.list form has correct blueprint-schema fields
  // --------------------------------------------------------------------------
  test("section.list form renders heading + list-items (textarea) from schema", async ({
    page,
  }) => {
    await page.getByTestId("guides-guide-item").first().click();
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_LIST_ID}`).click();

    await expect(page.getByRole("heading", { name: "New List section" })).toBeVisible();

    // list-items field is required → textarea (aria name "Items required").
    await expect(page.getByRole("textbox", { name: "Items required" })).toBeVisible();

    // Heading field → input.
    const headingField = page.locator(".field").filter({ hasText: "Display heading for a section" });
    await expect(headingField.locator("input")).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).click();
  });

  // --------------------------------------------------------------------------
  // Test 4: section.table form has heading field from schema
  // --------------------------------------------------------------------------
  test("section.table form renders heading field from blueprint schema", async ({ page }) => {
    await page.getByTestId("guides-guide-item").first().click();
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_TABLE_ID}`).click();

    await expect(page.getByRole("heading", { name: "New Table section" })).toBeVisible();

    // Heading field → plain input.
    const headingField = page.locator(".field").filter({ hasText: "Display heading for a section" });
    await expect(headingField.locator("input")).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).click();
  });

  // --------------------------------------------------------------------------
  // Test 5: section.commentary form has heading field from schema
  // --------------------------------------------------------------------------
  test("section.commentary form renders heading field from blueprint schema", async ({ page }) => {
    await page.getByTestId("guides-guide-item").first().click();
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_COMMENTARY_ID}`).click();

    await expect(page.getByRole("heading", { name: "New Commentary section" })).toBeVisible();

    // Heading field → plain input.
    const headingField = page.locator(".field").filter({ hasText: "Display heading for a section" });
    await expect(headingField.locator("input")).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).click();
  });

  // --------------------------------------------------------------------------
  // Test 5b: guide root form surfaces the introduction with a clear label
  //
  // Regression guard for muDemocracy.org#14: the guide stores its intro in the
  // shared `body` field, which previously inherited that field's generic
  // section-oriented description ("Main body content of a text or list section")
  // as its form label — so the intro was unrecognisable/uneditable. The guide
  // type now sets displayLabel "Introduction / body" on that assignment.
  // --------------------------------------------------------------------------
  test("guide root form labels the introduction field 'Introduction / body'", async ({ page }) => {
    // Select the Decision Recording guide by label (nav order is not guaranteed).
    const items = page.getByTestId("guides-guide-item");
    const count = await items.count();
    let target = items.first();
    for (let i = 0; i < count; i++) {
      if (/decision recording/i.test(await items.nth(i).innerText())) {
        target = items.nth(i);
        break;
      }
    }
    await target.click();

    await page.getByTestId("guides-edit-guide").click();
    await expect(page.getByTestId("record-form")).toBeVisible();

    // The introduction field must be present, clearly labelled, and editable,
    // pre-filled with the guide's existing intro prose.
    const introField = page.locator(".field").filter({ hasText: "Introduction / body" });
    await expect(introField).toHaveCount(1);
    const introTextarea = introField.locator("textarea");
    await expect(introTextarea).toBeVisible();
    await expect(introTextarea).toHaveValue(/When a group finally makes a decision/);

    await page.locator("button", { hasText: "Cancel" }).click();
  });

  // --------------------------------------------------------------------------
  // Test 6: Create section, edit body, and save
  // --------------------------------------------------------------------------
  test("Create section.text, edit body and save — section appears in list", async ({ page }) => {
    await page.getByTestId("guides-guide-item").first().click();

    // Create a new section.text with heading + body.
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_TEXT_ID}`).click();

    await expect(page.getByRole("heading", { name: "New Text section" })).toBeVisible();

    const headingInput = page
      .locator(".field")
      .filter({ hasText: "Display heading for a section" })
      .locator("input");
    await headingInput.fill("C8 Test Section");

    const bodyTextarea = page
      .locator(".field")
      .filter({ hasText: "Main body content" })
      .locator("textarea");
    await bodyTextarea.fill("Original body text");

    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Form should close — section list should be back.
    await expect(page.getByTestId("guides-section-list")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("guides-section-list")).toContainText("C8 Test Section");

    // Now click the newly created section to edit it.
    await page.getByTestId("guides-section-item").filter({ hasText: "C8 Test Section" }).click();

    // Edit form opens — heading is pre-filled.
    await expect(page.getByRole("heading", { name: "Edit Text section" })).toBeVisible();

    // Update the body.
    const editBodyTextarea = page
      .locator(".field")
      .filter({ hasText: "Main body content" })
      .locator("textarea");
    await editBodyTextarea.clear();
    await editBodyTextarea.fill("Updated body text after edit");

    await page.locator("button[type=submit]", { hasText: "Save" }).click();

    // Section list returns — the section is still there.
    await expect(page.getByTestId("guides-section-list")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("guides-section-list")).toContainText("C8 Test Section");
  });

  // --------------------------------------------------------------------------
  // Test 7: Export .srsj round-trip — created section survives export + reload
  // --------------------------------------------------------------------------
  test("Export .srsj and reload — created section persists", async ({ page }) => {
    await page.getByTestId("guides-guide-item").first().click();

    // Create a section to include in the export.
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_TEXT_ID}`).click();

    await page
      .locator(".field")
      .filter({ hasText: "Display heading for a section" })
      .locator("input")
      .fill("Export Round-Trip Section");

    await page
      .locator(".field")
      .filter({ hasText: "Main body content" })
      .locator("textarea")
      .fill("Body for round-trip test");

    await page.locator("button[type=submit]", { hasText: "Save" }).click();
    await expect(page.getByTestId("guides-section-list")).toBeVisible({ timeout: 3000 });

    // Export .srsj (legacy text format) for round-trip — capture the download.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export .srsj" }).click();
    const download = await downloadPromise;

    // Read the downloaded .srsj content.
    const exportedContent = await download.createReadStream().then(
      (stream) =>
        new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          stream.on("error", reject);
        })
    );

    // The exported .srsj must be valid JSON.
    const exportedRepo = JSON.parse(exportedContent);
    expect(exportedRepo).toBeTruthy();

    // Reload by navigating back to the mode picker and re-uploading the export.
    await page.getByRole("button", { name: "Open another file" }).click();
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 3000 });

    await page.getByTestId("mode-guides").click();
    await expect(page.getByTestId("guides-file-picker")).toBeVisible();

    // Write exported content to a temp file and upload it.
    const tmpPath = path.join(__dirname, "fixtures", "_export-roundtrip-tmp.srsj");
    const fs = await import("node:fs/promises");
    await fs.writeFile(tmpPath, exportedContent, "utf8");

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(tmpPath);
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });

    // Click the first guide — section list should contain the round-tripped section.
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("guides-section-list")).toContainText("Export Round-Trip Section");

    // Clean up temp file.
    await fs.unlink(tmpPath).catch(() => {});
  });

  // --------------------------------------------------------------------------
  // Test 8: select field (theme) renders as a dropdown, not a text input (#46)
  // --------------------------------------------------------------------------
  test("section.text theme (select) field renders as a <select> dropdown", async ({ page }) => {
    await page.getByTestId("guides-guide-item").first().click();
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_TEXT_ID}`).click();

    await expect(page.getByRole("heading", { name: "New Text section" })).toBeVisible();

    // `theme` (com.mudemocracy/theme) is the only select field on section.text,
    // with allowedValues default/inverted/highlight. Before #46 it fell through
    // to a plain <input>; it must now render as a <select> combobox.
    const form = page.getByTestId("section-form");
    const dropdown = form.getByRole("combobox");
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator("option")).toHaveCount(3);
    await expect(dropdown.locator("option", { hasText: "inverted" })).toHaveCount(1);
    // initialFields() defaults a select to its first allowedValue.
    await expect(dropdown).toHaveValue("default");

    await page.locator("button", { hasText: "Cancel" }).click();
  });
});
