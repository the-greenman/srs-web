import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openInspectorDrawer, openPackageEditor, navItem, newRecord } from "./helpers.js";

/**
 * notices.spec.ts — srs-web#441: one notice system (toast, Notice, grouped Diagnostics).
 * r23.srsj: a `contains` chain 7 deep rendered as html, so the engine emits the SAME
 * "[R23] computed heading level 7 exceeds 6 ..." diagnostic ten times (no stubs).
 * essay-catalog.srsj: the essay fixture plus one deliberately malformed object (a catalog error).
 */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const R23 = path.join(dir, "r23.srsj");

async function open(page: Page, fixture: string) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(fixture);
}

test.describe("Grouped diagnostics", () => {
  test("a repeated R23 is one collapsed line, expands to one group with a count, and dismiss is per document", async ({
    page,
  }) => {
    await open(page, R23);
    const notice = page.getByTestId("document-diagnostics");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("10 warnings");
    await expect(notice.locator(".diag-list")).toBeHidden();

    await notice.getByRole("button", { name: "Show diagnostics" }).click();
    await expect(notice.locator('[data-part="group"]')).toHaveCount(1);
    await expect(notice.locator('[data-part="count"]')).toHaveText("x10");
    await expect(notice.getByText("[R23] computed heading level 7")).toBeVisible();

    await notice.getByRole("button", { name: "Dismiss" }).click();
    await expect(notice).toHaveCount(0);

    // away and back: still dismissed for this document (session scope)
    await page.getByRole("button", { name: "Records" }).click();
    await page.getByRole("button", { name: /tree-document/ }).click();
    await expect(page.getByRole("heading", { name: "tree-document" })).toBeVisible();
    await expect(page.getByTestId("document-diagnostics")).toHaveCount(0);

    // a reload starts a new session: shown again
    await open(page, R23);
    await expect(page.getByTestId("document-diagnostics")).toBeVisible();
  });
});

test.describe("Catalog notice", () => {
  test("shows below the bar in the generic shell and in a registered editor shell, as a status", async ({
    page,
  }) => {
    await open(page, path.join(dir, "essay-catalog.srsj"));
    const notice = page.getByTestId("catalog-diagnostics");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("role", "status");
    await expect(notice).toContainText("1 error");
    await expect(page.getByRole("alert")).toHaveCount(0);

    await openPackageEditor(page, "essay");
    await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
    await expect(page.getByTestId("catalog-diagnostics")).toBeVisible();
    // below the bar, above the scroller: real DOM order inside the main column
    const order = await page.evaluate(() => {
      const main = document.querySelector(".app__main") as HTMLElement;
      const kids = [...main.children];
      const at = (sel: string) => kids.findIndex((k) => k.matches(sel));
      return [at(".toolbar"), at('[data-testid="catalog-diagnostics"]'), at(".workspace")];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });
});

test.describe("Errors stay inline", () => {
  test("a Guides export failure is an inline, strong, role=alert Notice that persists and is no toast", async ({
    page,
  }) => {
    await page.clock.install();
    // the download path is the failure: no repository data is stubbed
    await page.addInitScript(() => {
      URL.createObjectURL = () => {
        throw new Error("blocked by the test");
      };
    });
    await open(page, path.join(dir, "muSrs.srsj"));
    await openPackageEditor(page, "guides");
    await expect(page.getByTestId("guides-shell")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("guides-guide-item").first().click();
    await page.getByTestId("guides-export-guide-json").click();

    const error = page.getByTestId("guides-export-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toContainText("Export failed");
    await expect(page.locator(".toast")).toHaveCount(0);

    await page.clock.runFor(60_000);
    await expect(error).toBeVisible();
  });
});

// ── Toasts (copy link, layout, drawer, sticky save failure) ─────────────────────────────────

/**
 * The RGB of one pixel of a PNG screenshot (8-bit, non-interlaced). `elementFromPoint` cannot answer
 * "is the toast above the scrim?": a modal dialog makes the toast inert, so hit-testing skips it. The
 * pixels can: a toast above the scrim paints its own light surface, beneath it a dimmed one.
 */
function pixel(png: Buffer, x: number, y: number): [number, number, number] {
  let off = 8;
  let width = 0;
  let bpp = 4;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    const body = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      bpp = body[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(body);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  for (let row = 0; row <= y; row++) {
    const start = row * (stride + 1);
    const filter = raw[start];
    const cur = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cur[i] = (cur[i] + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
    prev = cur;
  }
  return [prev[x * bpp], prev[x * bpp + 1], prev[x * bpp + 2]];
}
/** True when the toast paints its own light surface (above the scrim), not a dimmed page. */
async function toastIsAboveScrim(page: Page, toast: import("@playwright/test").Locator) {
  const box = (await toast.boundingBox())!;
  const shot = await page.screenshot({ type: "png" });
  const [r, g, b] = pixel(shot, Math.round(box.x + 5), Math.round(box.y + box.height / 2));
  return r > 200 && g > 200 && b > 200;
}

const ESSAY = path.join(dir, "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const toasts = (page: Page) => page.locator(".toast-host .toast");
const firstChildY = async (page: Page) =>
  (await page.locator(".app__main .workspace > *").first().boundingBox())!.y;

async function openEssay(page: Page) {
  await open(page, ESSAY);
  await openPackageEditor(page, "essay");
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}
async function copyLink(page: Page) {
  await items(page).nth(1).hover();
  await items(page).nth(1).getByRole("button", { name: /^Copy link to/ }).click({ force: true });
}

test.describe("Toast", () => {
  test("Copy link: one toast, announced once, no stacking, no layout shift, gone after its time", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.clock.install();
    await openEssay(page);
    const before = await firstChildY(page);

    await copyLink(page);
    await expect(page.getByTestId("address-notice")).toHaveText(/Link copied/);
    await expect(toasts(page)).toHaveCount(1);
    await expect(page.getByTestId("live-polite")).toHaveText("Link copied");
    expect(await firstChildY(page)).toBe(before);

    await copyLink(page); // a second click inside the window replaces, never stacks
    await expect(toasts(page)).toHaveCount(1);

    await page.clock.runFor(5000);
    await expect(toasts(page)).toHaveCount(0);
    await expect(page.getByTestId("live-polite")).toHaveText("");
    expect(await firstChildY(page)).toBe(before);
  });

  test("the toast is painted above the inspector drawer scrim (900px)", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.clock.install();
    await openEssay(page);
    await copyLink(page);
    await expect(toasts(page)).toHaveCount(1);
    await page.clock.pauseAt(new Date(Date.now() + 1000)); // freeze: the toast outlives the drawer opening
    await openInspectorDrawer(page);

    expect(await toastIsAboveScrim(page, toasts(page).first())).toBe(true);
  });
});

// A save failure is the one error that is a (sticky) toast. Driven through a fake File System Access
// directory whose writes fail while `__FAIL_WRITES__` is set (the real picker cannot be answered).
/** gallery.srsj exploded to a tree (a generation-2 .srsj is already the path-keyed file layout). */
function explodeSrsj(file: string): Record<string, string> {
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
    manifest: unknown;
    data: Record<string, unknown>;
  };
  const tree: Record<string, string> = {
    ".srs/.gitkeep": "",
    "manifest.json": Buffer.from(JSON.stringify(doc.manifest, null, 2)).toString("base64"),
  };
  for (const [p, obj] of Object.entries(doc.data)) {
    tree[p] = Buffer.from(JSON.stringify(obj, null, 2)).toString("base64");
  }
  return tree;
}
async function installFailingDirectory(page: Page) {
  await page.addInitScript((files: Record<string, string>) => {
    const w = window as unknown as Record<string, unknown>;
    const disk = new Map<string, Uint8Array>(
      Object.entries(files).map(([p, b64]) => [p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))])
    );
    const makeFile = (full: string) => ({
      kind: "file",
      name: full.split("/").pop(),
      getFile: () => Promise.resolve(new Blob([disk.get(full) ?? new Uint8Array()])),
      createWritable: () =>
        Promise.resolve({
          write: async (chunk: ArrayBuffer | Blob) => {
            if (w.__FAIL_WRITES__) throw new Error("disk full");
            disk.set(full, new Uint8Array(chunk instanceof Blob ? await chunk.arrayBuffer() : chunk));
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
          yield tail.length > 0 ? [head, makeDir(`${prefix}${head}/`)] : [head, makeFile(`${prefix}${head}`)];
        }
      },
      getDirectoryHandle: (c: string) => Promise.resolve(makeDir(`${prefix}${c}/`)),
      getFileHandle: (c: string) => Promise.resolve(makeFile(`${prefix}${c}`)),
      removeEntry: (c: string) => {
        disk.delete(`${prefix}${c}`);
        return Promise.resolve();
      },
    });
    w.showDirectoryPicker = () => Promise.resolve(makeDir(""));
  }, explodeSrsj(path.join(dir, "gallery.srsj")));
}
async function openFolderAndEdit(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("source-local-folder").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
  await openPackageEditor(page, "governance");
  await navItem(page, /Articles/).click();
  await newRecord(page);
  await page.locator(".field").filter({ hasText: "Title" }).locator("input").fill("Toast article");
  await page.locator(".field").filter({ hasText: "Article Text" }).locator("textarea").fill("Body.");
  await page.locator(".field").filter({ hasText: "Status" }).locator("select").selectOption("draft");
  await page.locator("button[type=submit]", { hasText: "Save" }).click();
  await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 10000 });
}

test.describe("Save failure", () => {
  test("is a sticky error toast above an opening drawer, survives the clock, and the next save replaces it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.clock.install();
    await installFailingDirectory(page);
    await openFolderAndEdit(page);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__FAIL_WRITES__ = true;
    });
    await page.getByTestId("save-document").click();

    const toast = page.getByTestId("save-status");
    await expect(toast).toContainText("Save failed");
    await expect(toast).toBeVisible();
    await expect(page.getByTestId("live-assertive")).toContainText("Save failed");
    await expect(page.locator('[role="alert"]')).toHaveCount(0); // no always-present alert node

    await openInspectorDrawer(page); // raised BEFORE the drawer: it must re-stack above the scrim
    expect(await toastIsAboveScrim(page, toast)).toBe(true);

    await page.clock.runFor(60_000);
    await expect(toast).toBeVisible(); // sticky
    await page.keyboard.press("Escape"); // close the drawer, then the next save replaces the error
    await expect(page.getByTestId("shell-drawer-inspector")).toBeHidden();
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__FAIL_WRITES__ = false;
    });
    await page.getByTestId("save-document").click();
    await expect(page.getByTestId("save-status")).toContainText("Saved.");
    await expect(page.getByTestId("save-status")).toHaveCount(1);
    await expect(page.getByTestId("live-assertive")).toHaveText("");
  });
});
