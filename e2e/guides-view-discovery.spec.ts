import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * guides-view-discovery.spec.ts — blueprint↔view discovery (srs-web#43 Phase C).
 *
 * Verifies that GuidesShell discovers the guide blueprint and its document view
 * at runtime (ADR-004 string-convention join), without relying on hardcoded UUID
 * literals. The fixture assertion UUID is kept local to this test for explicit
 * round-trip verification only; it is not an application constant.
 *
 * Scenarios:
 *  Happy path: blueprint + view discovered → preview renders for a selected guide.
 *  ViewPicker hidden: only one view available for the guide blueprint → picker absent.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_FIXTURE = path.join(__dirname, "fixtures", "muSrs.srsj");

/** Fixture assertion: the guide-body-view ID in the muSrs package. Not an app constant. */
const FIXTURE_GUIDE_VIEW_ID = "2aba4d85-317b-44e1-a600-d38a743b4cb4";

test.describe("Blueprint↔view discovery (srs-web#43)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("mode-guides").click();
    await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS_FIXTURE);
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
  });

  test("guides shell loads without a schema error (blueprint discovered)", async ({ page }) => {
    // If the blueprint is NOT discovered, a schema error banner appears.
    // Its absence confirms discovery succeeded.
    await expect(page.locator(".guides-error[role='alert']")).not.toBeVisible();
  });

  test("preview pane renders after selecting a guide (view discovered)", async ({ page }) => {
    // Select the first guide — this triggers refreshPreview() using the discovered view.
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("guides-preview-frame")).toBeVisible({ timeout: 3000 });
  });

  test("ViewPicker is hidden when only one view is available", async ({ page }) => {
    // muSrs has exactly one document view for the guide blueprint.
    // ViewPicker renders nothing when views.length <= 1.
    await expect(page.getByTestId("view-picker")).not.toBeVisible();
  });

  test("export produces a projection with the discovered view ID", async ({ page }) => {
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("guides-section-item").first()).toBeVisible({ timeout: 5000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("guides-export-guide-json").click(),
    ]);

    const chunks: Buffer[] = [];
    const stream = await download.createReadStream();
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const projection = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    // The exported projection's documentViewId must match the fixture view,
    // confirming the view was discovered by name (not a hardcoded literal in the app).
    expect(projection.documentViewId).toBe(FIXTURE_GUIDE_VIEW_ID);
  });
});
