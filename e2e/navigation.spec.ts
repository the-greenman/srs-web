import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * navigation.spec.ts — nav section switching tests.
 *
 * After loading the fixture, verifies that clicking each nav item changes the
 * active section heading shown in the main content area.
 *
 * Uses gallery.srsj, not sample.srsj: sample.srsj is deliberately left
 * without manifest.container.identityInstanceId set (migrations.spec.ts's
 * fixture, exercising the "needs migration" state) — as of srs-rust
 * build.297, repository_navigation() surfaces that as a diagnostic, and
 * GovernanceShell's loadContainerNav() falls back to the legacy
 * listContainers() path whenever any diagnostic is present, whose first
 * entry is the repo's own identity-shaped record rather than "Articles".
 * That's a real, RFC-029-permitted "no identity node" state for an
 * unmigrated document (not a content-loss bug) — this spec just doesn't
 * need to exercise it, so it uses the already-migrated gallery fixture
 * instead, like gallery.spec.ts / decision-link.spec.ts already do.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM boot, then choose governance mode
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Wait for loaded state — use the nav link as the signal
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("Articles is the default active section", async ({ page }) => {
    // The section heading h2 should say "Articles"
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible();
  });

  test("clicking Decision Log shows Decision Log section heading", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();
  });

  test("clicking Roles shows Roles section heading", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await expect(page.getByRole("heading", { name: "Roles", level: 2 })).toBeVisible();
  });

  test("clicking Articles after another section returns to Articles heading", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();

    await page.getByRole("link", { name: /Articles/ }).click();
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible();
  });
});
