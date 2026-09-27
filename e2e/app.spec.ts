import { expect, test } from "@playwright/test";

/**
 * app.spec.ts — basic app load tests.
 *
 * Verifies the app reaches the generic idle file-picker state. No file is
 * loaded in these tests.
 */

test.describe("App baseline", () => {
  test("shows the generic file picker in idle state", async ({ page }) => {
    await page.goto("/");

    // Wait for WASM to initialise — app transitions boot → idle.
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Viewer" })).toBeVisible();
  });

  test("shows the file input without selecting a package editor", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await expect(fileInput).toBeAttached({ timeout: 15000 });
  });

  test("does not show three-pane layout in idle state", async ({ page }) => {
    await page.goto("/");

    // The generic picker is visible; repository navigation appears only after loading.
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /^Articles$/ })).not.toBeVisible();
  });
});
