import { expect, test } from "@playwright/test";

/**
 * app.spec.ts — basic app load tests.
 *
 * Verifies the app reaches the idle (file-picker) state and shows the
 * expected heading. No file is loaded in these tests.
 */

test.describe("App baseline", () => {
  test("shows the SRS Governance Viewer heading in idle state", async ({ page }) => {
    await page.goto("/");

    // Wait for WASM to initialise — app transitions boot → idle
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("shows the file input in idle state", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await expect(fileInput).toBeAttached();
  });

  test("does not show three-pane layout in idle state", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 15000,
    });

    // Nav items appear only after a repo is loaded
    await expect(page.getByText("Articles")).not.toBeVisible();
  });
});
