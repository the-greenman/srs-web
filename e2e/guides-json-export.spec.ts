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

import { FIXTURE_GUIDE_VIEW_ID } from "./fixtures/fixture-constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_FIXTURE = path.join(__dirname, "fixtures", "muSrs.srsj");

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

    // Projection envelope from the guide-body composition (RFC-041/
    // rfc-decision-92d2da05: documentViewId -> compositionId, srs-rust#910).
    expect(projection.compositionId).toBe(FIXTURE_GUIDE_VIEW_ID);
    expect(typeof projection.containerTitle).toBe("string");
    expect(projection.containerTitle.length).toBeGreaterThan(0);
    expect(Array.isArray(projection.sections)).toBe(true);
    expect(projection.sections.length).toBeGreaterThan(0);

    // Records carry resolved field content + ordering metadata.
    const records = projection.sections.flatMap((s: { records?: unknown[] }) => s.records ?? []);
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r).toHaveProperty("typeName");
      expect(r).toHaveProperty("fields");
      expect(r).toHaveProperty("orderedFieldKeys");
      // srs-web#301: typeVersion is required by the canonical
      // document-view-output.json schema (RFC-032/RFC-039 PINNED binding)
      // but the srs-client.ts ProjectedRecord mirror had gone stale and
      // omitted it — assert it's really emitted, not just declared.
      expect(r).toHaveProperty("typeVersion");
      expect(typeof (r as { typeVersion: unknown }).typeVersion).toBe("number");
    }

    // The projection includes the guide root and at least one section type.
    const typeNames = new Set(records.map((r: { typeName: string }) => r.typeName));
    expect(typeNames.has("guide")).toBe(true);
    const hasSection = [...typeNames].some((t) => String(t).startsWith("section."));
    expect(hasSection).toBe(true);

    // srs-web#301 also fixed `relations`/`properties` on ProjectedRecord —
    // assert their shape too, not just typeVersion, so a regression on
    // either is actually caught. The fixture's guide-body-view section
    // declares a `precedes` relationsPresentation and a `createdAt`
    // RecordPropertyView row specifically so these are populated.
    type RelationRow = {
      relationType: string;
      direction: string;
      label: string;
      targets: unknown[];
    };
    type PropertyRow = { property: string; label: string; value: string | string[] };
    const recordsWithRelations = records.filter(
      (r: { relations?: RelationRow[] }) => r.relations && r.relations.length > 0
    );
    expect(recordsWithRelations.length).toBeGreaterThan(0);
    for (const relation of recordsWithRelations[0].relations as RelationRow[]) {
      expect(relation).toHaveProperty("relationType");
      expect(relation).toHaveProperty("direction");
      expect(["forward", "inverse"]).toContain(relation.direction);
      expect(Array.isArray(relation.targets)).toBe(true);
    }

    const recordsWithProperties = records.filter(
      (r: { properties?: PropertyRow[] }) => r.properties && r.properties.length > 0
    );
    expect(recordsWithProperties.length).toBeGreaterThan(0);
    for (const property of recordsWithProperties[0].properties as PropertyRow[]) {
      expect(property).toHaveProperty("property");
      expect(property).toHaveProperty("label");
      expect(typeof property.value === "string" || Array.isArray(property.value)).toBe(true);
    }
  });

  test("no export error is shown on a successful export", async ({ page }) => {
    await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("guides-export-guide-json").click(),
    ]);
    await expect(page.getByTestId("guides-export-error")).not.toBeVisible();
  });
});
