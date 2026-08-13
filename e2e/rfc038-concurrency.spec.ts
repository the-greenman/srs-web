import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";

/**
 * rfc038-concurrency.spec.ts — the srs#291 two-writer property, in E2E terms.
 *
 * RFC-038 makes every record and every relation an independent file, so two
 * writers starting from one exploded-tree base produce *disjoint* file patches
 * and a merge of the two exposes both objects. srs-rust proves this against
 * the store in `crates/srs-repository/tests/two_branch_merge.rs`; this spec
 * proves the same property survives the whole web path — real WASM, the tree
 * load/export round-trip, and the app's own save flow.
 *
 * Deliberately NOT a replacement for srs-web#251: two writers editing the *same*
 * semantic file still need three-way merge/conflict UX, which #251 owns. What is
 * covered here is only the case RFC-038 removes conflicts from — different
 * objects, hence different files.
 *
 * Refs the-greenman/srs#291, the-greenman/srs#297.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The exploded base tree, derived from `gallery.srsj`.
 *
 * A generation-2 `.srsj` is already a path-keyed tree — `data` holds exactly the
 * file layout an exploded repository has, with the envelope carrying the single
 * manifest ([R19]). Exploding it here keeps one source of truth for the fixture:
 * the tree the writers start from is provably the same repository the rest of
 * the suite loads as a document, so a divergence cannot creep between them.
 */
function explodeSrsj(file: string): Record<string, string> {
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
    srsj: string;
    manifest: unknown;
    data: Record<string, unknown>;
  };
  if (doc.srsj !== "2") throw new Error(`${file}: expected srsj "2", got ${doc.srsj}`);
  const tree: Record<string, string> = {
    ".srs/.gitkeep": "",
    "manifest.json": Buffer.from(JSON.stringify(doc.manifest, null, 2)).toString("base64"),
  };
  for (const [p, obj] of Object.entries(doc.data)) {
    tree[p] = Buffer.from(JSON.stringify(obj, null, 2)).toString("base64");
  }
  return tree;
}

const BASE_TREE = explodeSrsj(path.join(__dirname, "fixtures", "gallery.srsj"));

type CommitCall = { changed: string[]; filesB64: Record<string, string> };

/**
 * A minimal write-capable GitHub tree provider serving `treeB64`. Mirrors the
 * retained-base diff GitHubRepoTreeHandle does (byte comparison rather than blob
 * SHA — same effect), and records the changed-path set plus the full exported
 * tree so the test can merge two writers' work in Node.
 */
async function installTreeProvider(page: Page, treeB64: Record<string, string>): Promise<void> {
  await page.addInitScript((tree: Record<string, string>) => {
    function decodeBytes(b64: string): Uint8Array {
      const binary = atob(b64);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    function encodeBytes(bytes: Uint8Array): string {
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    const baseTree: Record<string, Uint8Array> = {};
    for (const [treePath, b64] of Object.entries(tree)) baseTree[treePath] = decodeBytes(b64);

    const commitCalls: Array<{ changed: string[]; filesB64: Record<string, string> }> = [];
    // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
    (window as any).__TREE_COMMIT_CALLS__ = commitCalls;

    function bytesEqual(a: Uint8Array | undefined, b: Uint8Array): boolean {
      if (!a || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }

    const treeHandle = () => {
      let retainedBase: Record<string, Uint8Array> | null = null;
      return {
        provider: "github" as const,
        id: "octo/gov:main:governance#repo",
        name: "governance",
        kind: "tree" as const,
        capabilities: { read: true, write: true },
        revision: "tree-commit-1",
        branch: "main",
        repoLabel: "octo/gov",
        saveToBranch: async () => {
          throw new Error("Tree-mode documents commit via commitTree().");
        },
        readTree: async () => {
          retainedBase = { ...baseTree };
          return { ...baseTree };
        },
        commitTree: async (files: Record<string, Uint8Array>) => {
          const base = retainedBase ?? {};
          const changed = Object.keys(files).filter((p) => !bytesEqual(base[p], files[p]));
          for (const p of Object.keys(base)) if (!(p in files)) changed.push(p);
          const filesB64: Record<string, string> = {};
          for (const [p, bytes] of Object.entries(files)) filesB64[p] = encodeBytes(bytes);
          commitCalls.push({ changed: changed.sort(), filesB64 });
          return { revision: "tree-commit-2" };
        },
      };
    };

    const unconfigured = (id: string, label: string) => ({
      id,
      label,
      configured: false,
      authenticate: async () => {},
      open: async () => {
        throw new Error("unconfigured");
      },
    });

    // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
    (window as any).__SRS_STORAGE_PROVIDERS__ = {
      dropbox: unconfigured("dropbox", "Dropbox"),
      googleDrive: unconfigured("google-drive", "Google Drive"),
      github: {
        id: "github",
        label: "GitHub",
        configured: true,
        authenticate: async () => {},
        // "" → repos; "octo/gov" → branches; "octo/gov:main" → the governance
        // folder; "octo/gov:main:governance" → the synthetic repository entry.
        list: async (p?: string) => {
          if (!p) return [{ id: "octo/gov", name: "octo/gov", kind: "folder", path: "octo/gov" }];
          if (!p.includes(":"))
            return [{ id: `${p}:main`, name: "main", kind: "folder", path: `${p}:main` }];
          if (p === "octo/gov:main")
            return [
              {
                id: `${p}:governance`,
                name: "governance",
                kind: "folder",
                path: `${p}:governance`,
              },
            ];
          if (p === "octo/gov:main:governance")
            return [
              {
                id: "octo/gov:main:governance#repo",
                name: "Open as SRS repository",
                kind: "repository",
                path: "octo/gov:main:governance",
              },
            ];
          return [];
        },
        open: async () => treeHandle(),
        openTree: async () => treeHandle(),
      },
    };
  }, treeB64);
}

async function openExplodedTree(page: Page): Promise<void> {
  await page.getByTestId("mode-governance").click();
  await page.getByTestId("source-github").click();
  await page.getByRole("button", { name: /octo\/gov/ }).click();
  await page.getByRole("button", { name: /^Folder\s+main$/ }).click();
  await page.getByRole("button", { name: /^Folder\s+governance$/ }).click();
  await page.getByRole("button", { name: /Open as SRS repository/ }).click();
  await expect(page.getByRole("link", { name: /Migrations/ })).toBeVisible({ timeout: 15000 });
}

async function saveAndCaptureCommit(page: Page): Promise<CommitCall> {
  await page.getByTestId("save-document").click();
  await expect(page.getByTestId("git-save-modal")).toBeVisible();
  await page.getByTestId("git-save-confirm").click();
  await expect(page.getByTestId("save-status")).toContainText("Saved.");
  const calls = await page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
    () => (window as any).__TREE_COMMIT_CALLS__ as CommitCall[],
  );
  expect(calls).toHaveLength(1);
  return calls[0];
}

async function createArticle(page: Page, title: string): Promise<void> {
  // The "New <section>" action only exists once a section is active.
  await page.getByRole("link", { name: /Articles/ }).click();
  await page.locator("button.topbar__new").click();
  await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill(title);
  await page
    .locator(".field")
    .filter({ hasText: "Article Text" })
    .locator("textarea")
    .fill(`Body for ${title}.`);
  await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
  await page.locator("button[type=submit]", { hasText: "Save" }).click();
  await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 10000 });
}

test.describe("RFC-038 two-writer concurrency (srs#291)", () => {
  test("two writers adding different records produce disjoint file patches that merge", async ({
    browser,
  }) => {
    const writers: CommitCall[] = [];
    for (const title of ["Writer A Article", "Writer B Article"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await installTreeProvider(page, BASE_TREE);
      await page.goto("/");
      await openExplodedTree(page);
      await createArticle(page, title);
      writers.push(await saveAndCaptureCommit(page));
      await context.close();
    }
    const [a, b] = writers;

    // Each writer's patch adds exactly one new record file...
    for (const w of writers) {
      const records = w.changed.filter((p) => p.startsWith("records/"));
      expect(records).toHaveLength(1);
      // ...and rewrites no shared inventory. This is the property the cutover
      // buys: membership is the tree, so adding a record touches no manifest
      // and no relation collection.
      expect(w.changed).not.toContain("manifest.json");
      expect(w.changed.filter((p) => p.includes("relations-collection"))).toHaveLength(0);
    }

    // The record files themselves are disjoint — neither writer can clobber the
    // other's record.
    const recordsA = a.changed.filter((p) => p.startsWith("records/"));
    const recordsB = b.changed.filter((p) => p.startsWith("records/"));
    expect(recordsA.filter((p) => recordsB.includes(p))).toEqual([]);

    // Residual shared state: creating a record in a section also appends to that
    // section Container's memberInstanceIds, so both writers rewrite the same
    // container file. RFC-038 makes records and relations independent; Container
    // membership is still a shared mutable array, so this case needs the
    // semantic (union) merge below rather than a textual one. Asserting the
    // overlap is *only* containers keeps that boundary honest — if a manifest or
    // a collection ever reappears here, this fails loudly.
    // Same coupling as the-greenman/srs-rust#834; the merge UX is srs-web#251.
    const shared = a.changed.filter((p) => b.changed.includes(p));
    expect(shared.every((p) => p.startsWith("containers/"))).toBe(true);

    // Merge: union the disjoint files, and union the membership of any container
    // both writers touched.
    const merged: Record<string, string> = { ...BASE_TREE };
    for (const w of writers) {
      for (const p of w.changed) if (!shared.includes(p)) merged[p] = w.filesB64[p];
    }
    for (const p of shared) {
      const av = JSON.parse(Buffer.from(a.filesB64[p], "base64").toString("utf8"));
      const bv = JSON.parse(Buffer.from(b.filesB64[p], "base64").toString("utf8"));
      av.memberInstanceIds = [
        ...new Set([...(av.memberInstanceIds ?? []), ...(bv.memberInstanceIds ?? [])]),
      ];
      merged[p] = Buffer.from(JSON.stringify(av, null, 2)).toString("base64");
    }
    expect(Object.keys(merged).length).toBe(Object.keys(BASE_TREE).length + 2);

    const context = await browser.newContext();
    const page = await context.newPage();
    await installTreeProvider(page, merged);
    await page.goto("/");
    await openExplodedTree(page);
    await page.getByRole("link", { name: /Articles/ }).click();
    await expect(page.getByText("Writer A Article")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Writer B Article")).toBeVisible();
    await context.close();
  });

  test("two writers adding different relations produce disjoint file patches that merge", async ({
    browser,
  }) => {
    const writers: CommitCall[] = [];
    // Two writers linking *different* source decisions: two distinct relations,
    // hence two distinct files under relations/.
    for (const sourceIndex of [0, 1]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await installTreeProvider(page, BASE_TREE);
      await page.goto("/");
      await openExplodedTree(page);

      await page.getByRole("link", { name: /Decision Log/ }).click();
      await page.getByTestId("decision-summary-card").nth(sourceIndex).click();
      await page.getByTestId("add-relation-btn").click();
      await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({
        timeout: 5000,
      });
      await page.getByTestId("link-relation-type").selectOption("precedes");
      await page.getByTestId("link-decision-item").first().click();
      await expect(page.getByTestId("link-confirm")).toBeEnabled();
      await page.getByTestId("link-confirm").click();
      await expect(page.getByTestId("relation-item").first()).toBeVisible({ timeout: 5000 });

      writers.push(await saveAndCaptureCommit(page));
      await context.close();
    }
    const [a, b] = writers;

    for (const w of writers) {
      // One new relation file, and no shared relation collection anywhere:
      // RFC-038 [R11] retires collections, so a relation write is a file add.
      expect(w.changed.filter((p) => p.startsWith("relations/"))).toHaveLength(1);
      expect(w.changed).not.toContain("manifest.json");
      expect(w.changed.filter((p) => p.includes("relations-collection"))).toHaveLength(0);
    }

    expect(a.changed.filter((p) => b.changed.includes(p))).toEqual([]);

    const baseRelations = Object.keys(BASE_TREE).filter((p) => p.startsWith("relations/"));
    const merged: Record<string, string> = { ...BASE_TREE };
    for (const w of writers) for (const p of w.changed) merged[p] = w.filesB64[p];
    const mergedRelations = Object.keys(merged).filter((p) => p.startsWith("relations/"));

    // The merge is a pure union: both new relations land alongside every
    // pre-existing one, and neither writer's file overwrote the other's.
    expect(mergedRelations).toHaveLength(baseRelations.length + 2);
    for (const w of writers) {
      for (const p of w.changed) expect(mergedRelations).toContain(p);
    }
  });
});
