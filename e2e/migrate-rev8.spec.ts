import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { openMenu } from "./helpers.js";

/**
 * migrate-rev8.spec.ts — a revision-8 essay (built with the build.425 CLI). The engine migrates a
 * pre-10 .srsj in memory on open and refuses writes until the user accepts (srs-rust#1454), so
 * srs-web asks first (srs-web#611). Opened from a writable (Dropbox) handle: accepting marks the
 * document Unsaved, a reply is written with an attributed actor (the engine refuses actor writes
 * below revision 9), and Save writes the migrated document at revision 11.
 */
const FIXTURE = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "rev8", "essay-rev8.srsj"),
  "utf8"
);

/**
 * A writable fake Dropbox holding the rev-8 essay. With `canCreate` it also creates files (Save a copy);
 * without, Save writes the .srsj back in place, so the written text can be read.
 */
async function installDropbox(page: Page, canCreate = false): Promise<void> {
  await page.addInitScript(
    ([text, create]) => {
      const handle = {
        provider: "dropbox",
        id: "dropbox-file",
        name: "essay-rev8.srsj",
        revision: "revision-1",
        kind: "text",
        capabilities: { read: true, write: true },
        read: async () => text,
        write: async (content: string) => {
          // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
          (window as any).__WRITTEN__ = content;
          return { revision: "revision-2" };
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
      (window as any).__SRS_STORAGE_PROVIDERS__ = {
        dropbox: {
          id: "dropbox",
          label: "Dropbox",
          configured: true,
          authenticate: async () => {},
          list: async () => [
            {
              id: "f",
              name: "essay-rev8.srsj",
              kind: "file",
              path: "/essay-rev8.srsj",
              revision: "revision-1",
            },
          ],
          open: async () => handle,
          create: create
            ? async (name: string, bytes: Uint8Array) => {
                // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
                (window as any).__CREATED__ = bytes.length;
                return { ...handle, id: "dropbox-copy", name };
              }
            : undefined,
        },
        googleDrive: { id: "google-drive", label: "Google Drive", configured: false },
        github: { id: "github", label: "GitHub", configured: false },
      };
    },
    [FIXTURE, canCreate] as const
  );
}

test("a rev-8 essay asks, migrates on consent, takes an attributed reply and saves at revision 11", async ({
  page,
}) => {
  await installDropbox(page);
  await page.goto("/");
  await page.getByTestId("source-dropbox").click();
  await page.getByRole("button", { name: /essay-rev8\.srsj/ }).click();

  await expect(page.getByTestId("migration-source-revision")).toHaveText("8");
  await expect(page.getByTestId("migration-prompt")).toContainText(
    "rfc046-actor-provenance, rfc052-root-container, rfc051-container-entries"
  );
  await page.getByTestId("migration-apply").click();
  await expect(page.getByTestId("save-status")).toContainText("Unsaved");
  await expect(page.getByTestId("document-dirty-status")).toHaveText("Unsaved changes");

  await page.getByTestId("package-editor-essay").click();
  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Reply").fill("After migration.");
  await first.getByRole("button", { name: "Comment", exact: true }).click();
  const c = first.getByTestId("comment");
  await expect(c.getByTestId("actor-name")).toHaveText("Ada");
  await expect(c.getByTestId("actor-kind")).toHaveText("human");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);

  await page.getByTestId("save-document").click();
  await expect(page.getByTestId("save-status")).toContainText("Saved.");
  // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
  const saved = await page.evaluate(() => (window as any).__WRITTEN__ as string);
  expect(JSON.parse(saved).manifest.dataModelRevision).toBe(11);
  expect(saved).toContain("After migration.");
});

test("a declined rev-8 essay saved as a copy becomes editable, with no second prompt", async ({
  page,
}) => {
  await installDropbox(page, true);
  await page.goto("/");
  await page.locator('input[type="file"]#srsj-file').setInputFiles({
    name: "essay-rev8.srsj",
    mimeType: "application/json",
    buffer: Buffer.from(FIXTURE),
  });
  await page.getByTestId("migration-read-only").click();
  await expect(page.getByTestId("read-only-note")).toContainText("Not migrated");
  await expect(page.getByTestId("package-editor-essay")).toHaveCount(0);

  await openMenu(page, "Document");
  await page.getByTestId("save-copy").click();
  await page.getByTestId("save-to-dropbox").click();
  await expect(page.getByTestId("save-status")).toContainText("Saved as");
  // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
  expect(await page.evaluate(() => (window as any).__CREATED__ as number)).toBeGreaterThan(0);

  await page.getByTestId("package-editor-essay").click();
  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Reply").fill("On the copy.");
  await first.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(first.getByTestId("comment").getByTestId("actor-name")).toHaveText("Ada");
  await expect(page.getByTestId("migration-prompt")).toHaveCount(0);
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
});
