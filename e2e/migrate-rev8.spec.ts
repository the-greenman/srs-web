import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * migrate-rev8.spec.ts — a revision-8 essay (built with the build.425 CLI). The engine migrates a
 * pre-10 .srsj in memory on open and refuses writes until the user accepts (srs-rust#1454), so
 * srs-web asks first (srs-web#611). Opened from a writable (Dropbox) handle: accepting marks the
 * document Unsaved, a reply is written with an attributed actor (the engine refuses actor writes
 * below revision 9), and Save writes the migrated document at revision 10.
 */
const FIXTURE = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "rev8", "essay-rev8.srsj"),
  "utf8"
);

test("a rev-8 essay asks, migrates on consent, takes an attributed reply and saves at revision 10", async ({ page }) => {
  await page.addInitScript((text) => {
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
        list: async () => [{ id: "f", name: "essay-rev8.srsj", kind: "file", path: "/essay-rev8.srsj", revision: "revision-1" }],
        open: async () => handle,
      },
      googleDrive: { id: "google-drive", label: "Google Drive", configured: false },
      github: { id: "github", label: "GitHub", configured: false },
    };
  }, FIXTURE);
  await page.goto("/");
  await page.getByTestId("source-dropbox").click();
  await page.getByRole("button", { name: /essay-rev8\.srsj/ }).click();

  await expect(page.getByTestId("migration-source-revision")).toHaveText("8");
  await expect(page.getByTestId("migration-prompt")).toContainText("rfc046-actor-provenance, rfc052-root-container");
  await page.getByTestId("migration-apply").click();
  await expect(page.getByTestId("save-status")).toContainText("Unsaved");
  await expect(page.getByTestId("document-dirty-status")).toHaveText("Unsaved changes");

  await page.getByTestId("package-editor-essay").click();
  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Your name").fill("Ada");
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
  expect(JSON.parse(saved).manifest.dataModelRevision).toBe(10);
  expect(saved).toContain("After migration.");
});
