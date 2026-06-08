import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * musrs-fixture.spec.ts — C6 smoke test for the muSrs.srsj fixture.
 *
 * Proves the muDemocracy guides repository, exported to a portable .srsj
 * bundle, loads end-to-end through the WASM engine in the browser (Guides
 * mode). This is the fixture every later Track C guides spec (C8–C10) builds
 * on, so a parse failure must surface here, isolated, rather than inside a
 * feature spec.
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
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
  });

  test("muSrs.srsj loads through the WASM engine in Guides mode", async ({ page }) => {
    await page.getByTestId("mode-guides").click();
    await expect(page.getByTestId("guides-file-picker")).toBeVisible();

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_FIXTURE);

    // A clean parse transitions to the guides shell. A WASM load failure would
    // instead surface the error splash — assert we reached the shell.
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("alert")).not.toBeVisible();
  });

  test("muSrs.srsj does not load as an error in Governance mode either", async ({ page }) => {
    // The bundle is a valid SRS repository regardless of editor mode; loading
    // it in Governance mode must also parse without throwing to the error state.
    await page.getByTestId("mode-governance").click();
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible();

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_FIXTURE);

    // Governance shell has no muSrs sections, but the load itself must succeed:
    // the idle/file-picker heading disappears and no error alert is shown.
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).not.toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("alert")).not.toBeVisible();
  });
});
