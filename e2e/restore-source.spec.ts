import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { openPackageEditor, waitForRecoveryCopy } from "./helpers.js";

const SOURCE = { kind: "github", where: "acme/corpus:main:", commitSha: "abc123" };

/** Read the stored recovery copy, first setting its source when one is given. */
function workingCopy(page: Page, source?: typeof SOURCE) {
  return page.evaluate(
    (source) =>
      new Promise<{ source?: unknown }>((resolve, reject) => {
        const open = indexedDB.open("srs-web", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction("working-copy", "readwrite").objectStore("working-copy");
          const get = store.get("current");
          get.onsuccess = () => {
            const entry = source ? { ...get.result, source } : get.result;
            store.put(entry, "current").onsuccess = () => resolve(entry);
          };
        };
      }),
    source
  );
}

// srs-web#732: a recovery copy taken from a GitHub repository goes back there after a reload. Committing is
// covered by tests/storage.test.ts; a real commit here would mean faking GitHub's sign-in popup.
test("a restored session keeps its GitHub source, and Save opens the Git dialog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page
    .locator('input[type="file"]#srsj-file')
    .setInputFiles(path.join(import.meta.dirname, "fixtures", "gallery.srsj"));
  await openPackageEditor(page, "governance");
  await page.getByTestId("attachments-file-input").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello attachment"),
  });
  await waitForRecoveryCopy(page);
  await workingCopy(page, SOURCE);

  await page.reload();
  await page.getByTestId("restore-notice").getByTestId("restore-session").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });

  // The rewritten copy still knows its source, so a second reload does not lose it.
  await expect.poll(async () => (await workingCopy(page)).source).toEqual(SOURCE);

  await page.getByTestId("save-document").click();
  const dialog = page.getByTestId("git-save-modal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("acme/corpus");
  await expect(dialog.getByTestId("git-save-mode-new")).toBeVisible();
});

test("a recovery copy with no source still asks where to save", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page
    .locator('input[type="file"]#srsj-file')
    .setInputFiles(path.join(import.meta.dirname, "fixtures", "gallery.srsj"));
  await openPackageEditor(page, "governance");
  await page.getByTestId("attachments-file-input").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello attachment"),
  });
  await waitForRecoveryCopy(page);

  await page.reload();
  await page.getByTestId("restore-notice").getByTestId("restore-session").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("save-document").click();
  await expect(page.getByTestId("git-save-modal")).toHaveCount(0);
});
