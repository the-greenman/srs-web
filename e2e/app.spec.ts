import { expect, test } from "@playwright/test";

/**
 * app.spec.ts — basic app load tests.
 *
 * Verifies the app reaches the idle (file-picker) state and shows the
 * expected heading. No file is loaded in these tests.
 */

test.describe("App baseline", () => {
  test("shows the mode picker in idle state", async ({ page }) => {
    await page.goto("/");

    // Wait for WASM to initialise — app transitions boot → idle (mode picker)
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("mode-governance")).toBeVisible();
    await expect(page.getByTestId("mode-guides")).toBeVisible();
  });

  test("shows the SRS Governance Viewer heading after choosing governance", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });

    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows the file input after choosing governance", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await expect(fileInput).toBeAttached();
  });

  test("does not show three-pane layout in idle state", async ({ page }) => {
    await page.goto("/");

    // Mode picker should be visible; the governance nav is only shown after loading
    await expect(page.getByTestId("mode-picker")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /^Articles$/ })).not.toBeVisible();
  });
});
