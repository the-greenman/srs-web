import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { openPackageEditor } from "./helpers.js";

/**
 * local-folder.spec.ts — opening an exploded SRS repository from the local
 * device (srs-web#248).
 *
 * Drives the `webkitdirectory` fallback, because Playwright cannot answer a
 * real File System Access picker dialog. Deleting `showDirectoryPicker` makes
 * SourceChooser render that branch, and `setInputFiles` on a directory uploads
 * the whole tree with `webkitRelativePath` populated — the same FileList a
 * Firefox/Safari user produces.
 *
 * The point of doing this end to end rather than in a unit test: it is the only
 * check that the tree we build is actually something `load_tree()` accepts.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPLODED_DIR = path.join(__dirname, "fixtures", "exploded");

/** Read every file under a directory into a { relativePath: base64 } map. */
function readTreeFixture(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const relative = path.relative(dir, full).split(path.sep).join("/");
        files[relative] = fs.readFileSync(full).toString("base64");
      }
    }
  }
  walk(dir);
  return files;
}
const EXPLODED_TREE = readTreeFixture(EXPLODED_DIR);

/**
 * Install a fake File System Access picker over an in-page directory backed by
 * the exploded fixture, recording every write and removal on
 * `window.__DISK_WRITES__`. This is the only way to exercise the write side end
 * to end: Playwright cannot answer the real native picker dialog.
 */
async function installFakeDirectoryPicker(page: Page, tree: Record<string, string>) {
  await page.addInitScript((files: Record<string, string>) => {
    const disk = new Map<string, Uint8Array>(
      Object.entries(files).map(([p, b64]) => [
        p,
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      ])
    );
    const writes: string[] = [];
    const removals: string[] = [];
    (window as unknown as Record<string, unknown>).__DISK_WRITES__ = writes;
    (window as unknown as Record<string, unknown>).__DISK_REMOVALS__ = removals;
    (window as unknown as Record<string, unknown>).__DISK__ = disk;

    const makeFile = (full: string) => ({
      kind: "file",
      name: full.split("/").pop(),
      getFile: () => Promise.resolve(new Blob([disk.get(full) ?? new Uint8Array()])),
      createWritable: () =>
        Promise.resolve({
          write: async (chunk: ArrayBuffer | Blob) => {
            writes.push(full);
            const buf = chunk instanceof Blob ? await chunk.arrayBuffer() : chunk;
            disk.set(full, new Uint8Array(buf));
          },
          close: () => Promise.resolve(),
        }),
    });

    const makeDir = (prefix: string): unknown => ({
      kind: "directory",
      name: prefix === "" ? "governance" : prefix.replace(/\/$/, "").split("/").pop(),
      async *entries() {
        const seen = new Set<string>();
        for (const full of disk.keys()) {
          if (!full.startsWith(prefix)) continue;
          const [head, ...tail] = full.slice(prefix.length).split("/");
          if (seen.has(head)) continue;
          seen.add(head);
          yield tail.length > 0
            ? [head, makeDir(`${prefix}${head}/`)]
            : [head, makeFile(`${prefix}${head}`)];
        }
      },
      getDirectoryHandle: (child: string) => Promise.resolve(makeDir(`${prefix}${child}/`)),
      getFileHandle: (child: string) => Promise.resolve(makeFile(`${prefix}${child}`)),
      removeEntry: (child: string) => {
        removals.push(`${prefix}${child}`);
        disk.delete(`${prefix}${child}`);
        return Promise.resolve();
      },
    });

    (window as unknown as Record<string, unknown>).showDirectoryPicker = () =>
      Promise.resolve(makeDir(""));
  }, tree);
}

test.describe("Open a folder from this device", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // biome-ignore lint/performance/noDelete: removing the property is the point
      delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
    });
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  });

  test("falls back to a directory input when the File System Access API is absent", async ({
    page,
  }) => {
    await expect(page.getByTestId("source-local-folder-input")).toBeAttached();
    await expect(page.getByTestId("source-local-folder")).toHaveCount(0);
  });

  test("loads the exploded fixture tree through the real WASM engine", async ({ page }) => {
    await page.getByTestId("source-local-folder-input").setInputFiles(EXPLODED_DIR);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
    await openPackageEditor(page, "governance");

    await expect(page.getByRole("link", { name: /Migrations/ })).toBeVisible({ timeout: 15000 });
    // No catalog-diagnostics banner: every object in the tree was catalogued.
    await expect(page.locator('[data-testid="catalog-diagnostics"]')).toHaveCount(0);
  });

  test("a folder opened read-only offers no Save", async ({ page }) => {
    await page.getByTestId("source-local-folder-input").setInputFiles(EXPLODED_DIR);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
    await openPackageEditor(page, "governance");
    await expect(page.getByRole("link", { name: /Migrations/ })).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
  });

  test("rejects a folder that is not an SRS repository", async ({ page }) => {
    await page
      .getByTestId("source-local-folder-input")
      .setInputFiles(path.join(__dirname, "fixtures"));

    await expect(page.getByText(/not an SRS repository/)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Save a folder back to disk (File System Access)", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeDirectoryPicker(page, EXPLODED_TREE);
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("source-local-folder").click();
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
    await openPackageEditor(page, "governance");
    await expect(page.getByRole("link", { name: /Migrations/ })).toBeVisible({ timeout: 15000 });
  });

  test("offers the picker button when the File System Access API is present", async ({ page }) => {
    await expect(page.getByTestId("source-local-folder-input")).toHaveCount(0);
  });

  test("saving an unmodified tree writes nothing — load_tree/export_tree round-trips byte-identically", async ({
    page,
  }) => {
    // The same guarantee cloud-storage.spec.ts checks for GitHub, on the disk path:
    // untouched files must come back out of real WASM byte-for-byte, or every save
    // would rewrite the whole repository and destroy the git diff.
    await page.getByTestId("save-document").click();
    await expect(page.getByTestId("save-status")).toContainText("Saved.");

    const writes = await page.evaluate(
      () => (window as unknown as { __DISK_WRITES__: string[] }).__DISK_WRITES__
    );
    const removals = await page.evaluate(
      () => (window as unknown as { __DISK_REMOVALS__: string[] }).__DISK_REMOVALS__
    );
    expect(writes).toEqual([]);
    expect(removals).toEqual([]);
  });

  test("saves straight to disk without opening the git branch dialog", async ({ page }) => {
    await page.getByTestId("save-document").click();
    await expect(page.getByTestId("save-status")).toContainText("Saved.");
    // A local folder has no branch: the dialog must never appear. If the "tree"
    // branch in saveDirect() were missing, the provider fan-out would instead
    // route this handle at GitHub.
    await expect(page.getByTestId("git-save-modal")).toHaveCount(0);
  });
});
