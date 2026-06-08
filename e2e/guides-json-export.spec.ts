import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * guides-json-export.spec.ts — C10: export a guide as a JSON document-view projection.
 *
 * Selects a guide, triggers "Export guide JSON", captures the download, parses it,
 * and asserts it is a complete DocumentViewProjection: it carries the guide-body
 * document-view id, a container title, ordered sections, and records with fields +
 * orderedFieldKeys (incl. the guide and its section types).
 *
 * C10 export guide JSON document-view: https://github.com/the-greenman/srs-web/issues/28
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_FIXTURE = path.join(__dirname, "fixtures", "muSrs.srsj");
const GUIDE_VIEW_ID = "2aba4d85-317b-44e1-a600-d38a743b4cb4";

async function readDownload(download: import("@playwright/test").Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test.describe("Guide JSON-view export (C10)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("mode-guides").click();
    await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS_FIXTURE);
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    // Select the first guide.
    await page.getByTestId("guides-guide-item").first().click();
  });

  test("Export guide JSON button is visible for a selected guide", async ({ page }) => {
    await expect(page.getByTestId("guides-export-guide-json")).toBeVisible();
  });

  test("exporting downloads a valid DocumentViewProjection JSON", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("guides-export-guide-json").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.guide-view\.json$/);

    const projection = JSON.parse(await readDownload(download));

    // Projection envelope from the guide-body document view.
    expect(projection.documentViewId).toBe(GUIDE_VIEW_ID);
    expect(typeof projection.containerTitle).toBe("string");
    expect(projection.containerTitle.length).toBeGreaterThan(0);
    expect(Array.isArray(projection.sections)).toBe(true);
    expect(projection.sections.length).toBeGreaterThan(0);

    // Records carry resolved field content + ordering metadata.
    const records = projection.sections.flatMap(
      (s: { records?: unknown[] }) => s.records ?? []
    );
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r).toHaveProperty("typeName");
      expect(r).toHaveProperty("fields");
      expect(r).toHaveProperty("orderedFieldKeys");
    }

    // The projection includes the guide root and at least one section type.
    const typeNames = new Set(records.map((r: { typeName: string }) => r.typeName));
    expect(typeNames.has("guide")).toBe(true);
    const hasSection = [...typeNames].some((t) => String(t).startsWith("section."));
    expect(hasSection).toBe(true);
  });

  test("no export error is shown on a successful export", async ({ page }) => {
    await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("guides-export-guide-json").click(),
    ]);
    await expect(page.getByTestId("guides-export-error")).not.toBeVisible();
  });
});
