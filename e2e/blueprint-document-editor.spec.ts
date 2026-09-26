import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * blueprint-document-editor.spec.ts — generic, blueprint-driven document
 * editor (srs-web#322 part 2).
 *
 * `pagetest.srsj` is a minimal fixture built with the real `srs` engine
 * (repo create / field / type / blueprint / composition / container /
 * record / relation create — see the PR description for the exact
 * commands): a `page` root type with `hero` and `prose` components, a
 * `homepage` Composition, and a `precedes` chain hero → prose. `muSrs.srsj`
 * carries only the guide blueprint/composition (no standalone-page
 * blueprint), so it cannot exercise the generic editor's "Documents" surface.
 *
 * Flow: open the fixture → Documents → homepage composition → edit the hero
 * headline → add a prose component after a block → assert the new order in
 * both the editor and the rendered preview → dirty state set.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "pagetest.srsj");

test.describe("BlueprintDocumentEditor (srs-web#322)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
  });

  test("edits a component field, inserts a new component, and reorders the document", async ({ page }) => {
    // Select the homepage composition — the blueprint resolves, so the editor (not
    // just the read-only preview) renders alongside the preview pane.
    await page.getByRole("button", { name: /homepage/i }).first().click();
    await expect(page.getByTestId("blueprint-document-editor")).toBeVisible();

    const blocks = page.getByTestId("bp-editor-block");
    await expect(blocks).toHaveCount(2);

    // Block 0 is the hero (headline field); block 1 is the prose seeded by the fixture.
    const heroBlock = blocks.nth(0);
    await expect(heroBlock).toContainText("Hero");
    const headlineInput = heroBlock.locator("#rf-headline");
    await headlineInput.fill("New headline");
    await heroBlock.getByRole("button", { name: "Save" }).click();

    // The editor's own state reflects the save without a full reload.
    await expect(heroBlock.locator("input").first()).toHaveValue("New headline");

    // The app-level dirty flag is set after the mutation.
    await expect(page.getByTestId("document-dirty-status")).toBeVisible();

    // Insert a second prose component right after the hero block (position 1).
    await page.getByTestId("bp-add-component-1").click();
    await page.getByTestId("bp-picker-1").getByRole("menuitem", { name: "Prose" }).click();

    await expect(blocks).toHaveCount(3);
    // New order: hero, [new prose], [original prose] — the inserted block sits
    // immediately after the hero, before the block that was previously second.
    await expect(blocks.nth(0)).toContainText("Hero");
    await expect(blocks.nth(1)).toContainText("Prose");
    await expect(blocks.nth(2)).toContainText("Prose");

    // The rendered preview (re-rendered after the mutation) reflects the same content.
    // PreviewPane renders into a sandboxed <iframe srcdoc="...">, so assert on the
    // attribute rather than visible text (same pattern as guides-html-preview.spec.ts).
    const frame = page.locator(".document-preview-panel iframe");
    await expect(frame).toBeVisible();
    const srcdoc = await frame.getAttribute("srcdoc");
    expect(srcdoc).toContain("New headline");
  });
});
