import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openPackageEditor } from "./helpers.js";

/**
 * musrs-fixture.spec.ts — C6 smoke test for the muSrs.srsj fixture.
 *
 * Proves the muDemocracy guides repository, exported to a portable .srsj
 * bundle, loads end-to-end through the WASM engine in the browser. Every repo
 * now lands in the generic shell first (srs-web#322); Guides is reached from
 * there as an in-shell package editor (available because the fixture declares
 * the com.mudemocracy guide package). This is the fixture every later Track C
 * guides spec (C8–C10) builds on, so a parse failure must surface here,
 * isolated, rather than inside a feature spec.
 *
 * Regenerate the fixture with muDemocracy.org/scripts/generate-musrs-fixture.sh.
 *
 * C6 srsj generation + fixture: https://github.com/the-greenman/muDemocracy.org/issues/6
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSRS_FIXTURE = path.join(__dirname, "fixtures", "muSrs.srsj");

test.describe("muSrs fixture (C6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  });

  test("muSrs.srsj loads through the WASM engine into the generic shell", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_FIXTURE);

    // A clean parse transitions to the generic shell. A WASM load failure would
    // instead surface the error splash — assert we reached the shell.
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("alert")).not.toBeVisible();
  });

  test("muSrs.srsj loads through the WASM engine in Guides mode", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_FIXTURE);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
    await openPackageEditor(page, "guides");

    // A clean parse transitions to the guides shell. A WASM load failure would
    // instead surface the error splash — assert we reached the shell.
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("alert")).not.toBeVisible();
  });
});
