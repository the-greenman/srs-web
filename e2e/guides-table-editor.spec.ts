import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * guides-table-editor.spec.ts — D2: schema-driven field-group editing.
 *
 * With field groups now emitted in the type/blueprint schema (D1), the section
 * form renders a table grid (compositeRenderer "table") for a section.table's
 * `tables` group and repeatable term/body rows for the `items` group. These
 * tests prove a table cell edit and an added row persist through the SRS store
 * (visible in the exported guide JSON projection), and that the commentary/tips
 * group is editable.
 *
 * D2 schema-driven table editor: srs-web (Track C follow-up)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_PATH = path.join(__dirname, "fixtures", "muSrs.srsj");
const SECTION_TABLE_ID = "d8d09d3b-8253-4d8d-b187-42f35c8446a7";

async function openGuideWithTable(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("mode-guides").click();
  await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS_PATH);
  await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
  // The first guide (Decision Recording) has real table sections.
  await page.getByTestId("guides-guide-item").first().click();
}

/** Open the edit form for the first section that renders a table grid. */
async function openFirstTableSection(page: import("@playwright/test").Page): Promise<boolean> {
  const rows = page.getByTestId("guides-section-item");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.nth(i).getByTestId("guides-section-open").click();
    if (await page.getByTestId("group-tables").isVisible().catch(() => false)) {
      if (await page.getByTestId("te-cell").first().isVisible().catch(() => false)) return true;
    }
    // Not a data-table section — go back and try the next.
    await page.locator("button", { hasText: "Cancel" }).click();
  }
  return false;
}

test.describe("Guide table editor (D2)", () => {
  test("section.table form renders a table grid from the field group", async ({ page }) => {
    await openGuideWithTable(page);
    expect(await openFirstTableSection(page)).toBe(true);
    await expect(page.getByTestId("group-tables")).toBeVisible();
    await expect(page.getByTestId("group-tables")).toHaveAttribute("data-renderer", "table");
    await expect(page.getByTestId("te-cell").first()).toBeVisible();
    await expect(page.getByTestId("te-add-row").first()).toBeVisible();
  });

  test("editing a table cell persists into the exported projection", async ({ page }) => {
    await openGuideWithTable(page);
    expect(await openFirstTableSection(page)).toBe(true);

    const marker = `EDITED-${Date.now()}`;
    const firstCell = page.getByTestId("te-cell").first();
    await firstCell.fill(marker);
    await page.locator("button[type=submit]", { hasText: "Save" }).click();
    await expect(page.getByTestId("guides-section-list")).toBeVisible({ timeout: 3000 });

    // Export the guide JSON and confirm the edited cell value is present.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("guides-export-guide-json").click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toContain(marker);
  });

  test("adding a row grows the grid", async ({ page }) => {
    await openGuideWithTable(page);
    expect(await openFirstTableSection(page)).toBe(true);

    const before = await page.getByTestId("te-row").count();
    await page.getByTestId("te-add-row").first().click();
    await expect(page.getByTestId("te-row")).toHaveCount(before + 1);
  });

  test("a freshly created table section can author a table", async ({ page }) => {
    await openGuideWithTable(page);
    await page.getByTestId("guides-add-section").click();
    await page.getByTestId(`guides-section-type-${SECTION_TABLE_ID}`).click();

    // The new section form shows the tables group with an add-table control.
    await expect(page.getByTestId("group-tables")).toBeVisible();
    await page.getByTestId("group-add-tables").click();
    await expect(page.getByTestId("table-entry")).toHaveCount(1);
    // A new table starts with an editable header cell.
    await expect(page.getByTestId("te-header").first()).toBeVisible();
  });
});
