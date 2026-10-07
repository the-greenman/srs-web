import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

/**
 * srs-web#450: a bundled package that is older than the pinned bundle is offered an upgrade, however
 * the editors' minimums stand. Offered by a pinned notice ("Review upgrade") and Document > Packages…,
 * both opening the one plan dialog (a dry run); Apply upgrades through the write-observed repo.
 * Fixtures (build-essay-1.5.0-fixtures.mjs): essay 1.5.0 installed (reference copies present) and the
 * same without its reference copies (the live case, srs-rust#1325). essay-outdated.srsj is essay 1.2.0.
 */
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

async function open(page: import("@playwright/test").Page, fixture: string) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(path.join(FIXTURES, fixture));
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
}

test("the notice offers the upgrade; the plan is a dry run; Apply upgrades and the essay gains References", async ({ page }) => {
  await open(page, "essay-1.5.0.srsj");
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  const notice = page.getByTestId("package-upgrade-notice");
  await expect(notice).toContainText("essay 1.7.0 is available (installed 1.5.0).");

  await page.getByTestId("package-upgrade-notice-action").click();
  const modal = page.getByTestId("upgrade-modal");
  await expect(modal).toContainText("Upgrade essay 1.5.0 → 1.7.0");
  await expect(modal.getByTestId("upgrade-counts")).toContainText("updated");
  await page.screenshot({ path: process.env.SHOT_UPGRADE ?? "test-results/upgrade-modal.png" });

  // the plan is a dry run: cancelling leaves the document untouched and the offer standing
  await page.getByTestId("upgrade-cancel").click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  await expect(notice).toBeVisible();

  await page.getByTestId("package-upgrade-notice-action").click();
  await page.getByTestId("upgrade-apply").click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toContainText("Unsaved changes");
  await expect(notice).toHaveCount(0); // the core now says it is current

  await page.getByTestId("package-editor-essay").click();
  await page.getByRole("button", { name: "New essay" }).click();
  await expect(page.getByRole("heading", { name: "Untitled essay" })).toBeVisible();
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  await expect(page.getByText("References", { exact: true }).first()).toBeVisible();
});

test("Document > Packages… lists installed against bundled and upgrades through the same plan", async ({ page }) => {
  await open(page, "essay-1.5.0.srsj");
  await openMenu(page, "Document");
  await page.getByTestId("toolbar-packages").click();
  const dialog = page.getByTestId("packages-modal");
  await expect(dialog.getByTestId("package-row-essay")).toContainText("installed 1.5.0, 1.7.0 is available");
  await dialog.getByTestId("package-upgrade-essay").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("upgrade-modal")).toContainText("Upgrade essay 1.5.0 → 1.7.0");
});

test("definitions the engine cannot prove unmodified are opt-in, never ticked by default", async ({ page }) => {
  await open(page, "essay-1.5.0-no-refs.srsj");
  await page.getByTestId("package-upgrade-notice-action").click();
  const modal = page.getByTestId("upgrade-modal");
  await expect(modal).toBeVisible();
  // an engine with earlier-bundle proof (srs-rust#1325) verifies them; one without lists each for consent
  const verified = modal.getByTestId("upgrade-verified");
  if ((await verified.count()) > 0) {
    await expect(verified).toContainText("verified against 1.5.0");
  } else {
    const boxes = modal.getByTestId("upgrade-unproven").locator('input[type="checkbox"]');
    expect(await boxes.count()).toBeGreaterThan(0);
    for (const box of await boxes.all()) await expect(box).not.toBeChecked();
    await expect(modal).toContainText("Replace with the published definition (any local change to it is lost)");
  }
});

test("a read-only document is offered neither the notice nor Packages…", async ({ page }) => {
  const link = "https://semanticops.test/try/essay-1.5.0.srsj";
  await page.route(link, (route) =>
    route.fulfill({
      body: readFileSync(path.join(FIXTURES, "essay-1.5.0.srsj")),
      headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
    })
  );
  await page.goto(`/?open=${encodeURIComponent(link)}`);
  await expect(page.getByTestId("read-only-note")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("package-upgrade-notice")).toHaveCount(0);
  await openMenu(page, "Document");
  await expect(page.getByTestId("toolbar-packages")).toHaveCount(0);
});

test("an outdated editor's Upgrade uses the same plan and opens the editor", async ({ page }) => {
  await open(page, "essay-outdated.srsj");
  await expect(page.getByTestId("package-upgrade-notice")).toContainText("installed 1.2.0");
  await page.getByTestId("package-editor-essay-upgrade").click();
  const modal = page.getByTestId("upgrade-modal");
  await expect(modal).toContainText("Upgrade essay 1.2.0 → 1.7.0");
  await page.getByTestId("upgrade-cancel").click();
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  await page.getByTestId("package-editor-essay-upgrade").click();
  await page.getByTestId("upgrade-apply").click();
  await expect(page.getByRole("button", { name: "New essay" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("document-dirty-status")).toContainText("Unsaved changes");
});
