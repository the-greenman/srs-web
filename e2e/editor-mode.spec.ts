import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openPackageEditor } from "./helpers.js";

/**
 * editor-mode.spec.ts — generic-first shell selection tests (C7, updated for srs-web#322).
 *
 * The mode picker (choose Governance/Guides before opening a file) was replaced by a
 * single generic file picker: any repository opens into GenericSrsShell, and
 * Governance/Guides are optional package editors reached from inside the loaded shell,
 * gated on the repo actually installing a type each shell depends on (package-editors.ts)
 * rather than a package namespace label.
 *
 * sample.srsj is a bare fixture with no governance or guide types, so it's used only
 * for the purely generic assertions below. gallery.srsj (installs the decision type)
 * and muSrs.srsj (installs the com.mudemocracy guide type) exercise the package editors.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FIXTURE = path.join(__dirname, "fixtures", "sample.srsj");
const GALLERY_FIXTURE = path.join(__dirname, "fixtures", "gallery.srsj");
const MUSRS_FIXTURE = path.join(__dirname, "fixtures", "muSrs.srsj");

test.describe("Editor mode selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  });

  test("shows the generic file picker on idle", async ({ page }) => {
    await expect(page.getByTestId("generic-file-picker")).toBeVisible();
    await expect(page.locator('input[type="file"]#srsj-file')).toBeAttached();
  });

  test("loading a repo shows the generic shell", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(SAMPLE_FIXTURE);

    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("generic-file-picker")).not.toBeVisible();
  });

  test("Governance package editor switches to the governance shell (no regression)", async ({
    page,
  }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_FIXTURE);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });

    await openPackageEditor(page, "governance");

    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("generic-srs-shell")).not.toBeVisible();
  });

  test("Guides package editor switches to the guides shell", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_FIXTURE);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });

    await openPackageEditor(page, "guides");

    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("generic-srs-shell")).not.toBeVisible();
  });

  test("Open another file from guides returns to the generic file picker", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(MUSRS_FIXTURE);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
    await openPackageEditor(page, "guides");
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Open another file" }).click();
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 3000 });
  });
});
