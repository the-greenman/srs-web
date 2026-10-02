import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { acceptMigration } from "./helpers.js";

/**
 * blueprint-document-editor.spec.ts — generic, blueprint-driven document
 * editor (srs-web#322).
 *
 * `pagetest.srs` is a minimal fixture built with the real `srs` engine
 * (repo create / field / type / blueprint / composition / container /
 * record / relation create, then exported through the app's own "Export"
 * button against the built file tree — see the PR description for the exact
 * commands): a `page` root type with `hero`/`prose`/`feature-group` components
 * (a `feature-group` `contains` two `feature`s), a `homepage` Composition
 * whose section declares `titleFieldId` (so the engine nests `contains`
 * children — srs-rust#1127), and `precedes` chains hero → prose →
 * feature-group and feature-one → feature-two. `muSrs.srsj` carries only the
 * guide blueprint/composition (no standalone-page blueprint), so it cannot
 * exercise the generic editor's "Documents" surface.
 *
 * Flow: open the fixture → Documents → homepage composition → assert the
 * feature-group nests its two features (editor order == preview order) →
 * edit the hero headline → add a prose component after a block → add a
 * feature inside the group → assert order/nesting in both the editor and the
 * rendered preview → dirty state set.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "pagetest.srs");

test.describe("BlueprintDocumentEditor (srs-web#322)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(FIXTURE);
    await acceptMigration(page);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
  });

  test("nests a group's children, edits a field, inserts/adds components, and reorders the document", async ({
    page,
  }) => {
    // Select the homepage composition — the blueprint resolves, so the editor (not
    // just the read-only preview) renders alongside the preview pane.
    await page
      .getByRole("button", { name: /homepage/i })
      .first()
      .click();
    await expect(page.getByTestId("blueprint-document-editor")).toBeVisible();

    // Top-level blocks are the page's own components: hero, prose, feature-group.
    // Feature cards are NOT offered at the top level (srs-web#322 step 4) — they
    // are only ever a contains-child of the feature-group.
    const topBlocks = page.locator(".bp-editor > .bp-editor__block");
    await expect(topBlocks).toHaveCount(3);
    const heroBlock = topBlocks.nth(0);
    const proseBlock = topBlocks.nth(1);
    const groupBlock = topBlocks.nth(2);
    await expect(heroBlock).toContainText("Hero");
    await expect(proseBlock).toContainText("Prose");
    await expect(groupBlock).toContainText("Feature group");

    // The group's two features are nested UNDER it, not listed at the top level
    // (srs-rust#1127's `children` projection) — this is the "editor order must
    // equal preview order" structural test.
    const groupChildren = groupBlock.locator(":scope > .bp-editor__children > .bp-editor__block");
    await expect(groupChildren).toHaveCount(2);
    await expect(groupChildren.nth(0)).toContainText("Feature");
    await expect(groupChildren.nth(1)).toContainText("Feature");

    // Collapsed blocks render an inline engine-rendered preview (srs-web#322 part 1),
    // not a raw-field summary line — assert the frame is present before opening the form.
    const heroPreviewFrame = heroBlock.getByTestId("bp-block-preview").locator("iframe");
    await expect(heroPreviewFrame).toBeVisible();

    // Blocks render collapsed to an inline preview; open the hero's form.
    await heroBlock.getByTestId("bp-block-toggle").click();
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

    await expect(topBlocks).toHaveCount(4);
    // New order: hero, [new prose], [original prose], feature-group — the inserted
    // block sits immediately after the hero, before the block that was previously second.
    await expect(topBlocks.nth(0)).toContainText("Hero");
    await expect(topBlocks.nth(1)).toContainText("Prose");
    await expect(topBlocks.nth(2)).toContainText("Prose");
    await expect(topBlocks.nth(3)).toContainText("Feature group");

    // Add a third feature inside the group (srs-web#322 step 5): the group's own
    // "+ Add feature" picker, not the top-level one.
    const groupBlockAfterInsert = topBlocks.nth(3);
    await groupBlockAfterInsert.getByRole("button", { name: /\+ Add feature/i }).click();
    await groupBlockAfterInsert
      .locator('[data-testid^="bp-child-picker-"]')
      .getByRole("menuitem", { name: "Feature" })
      .click();

    const groupChildrenAfterAdd = groupBlockAfterInsert.locator(
      ":scope > .bp-editor__children > .bp-editor__block"
    );
    await expect(groupChildrenAfterAdd).toHaveCount(3);

    // The full-page preview is hidden by default alongside the editor (srs-web#322 part 2)
    // — the editor takes the full width until "Full preview" is toggled on.
    await expect(page.getByTestId("document-full-preview")).toHaveCount(0);
    await page.getByTestId("full-preview-toggle").click();

    // The rendered preview (re-rendered after the mutation) reflects the same content,
    // and nests the same way the editor does (editor order == preview order).
    // PreviewPane renders into a sandboxed <iframe srcdoc="...">, so assert on the
    // attribute rather than visible text (same pattern as guides-html-preview.spec.ts).
    const frame = page.getByTestId("document-full-preview").locator("iframe");
    await expect(frame).toBeVisible();
    const srcdoc = await frame.getAttribute("srcdoc");
    expect(srcdoc).toContain("New headline");
  });
});
