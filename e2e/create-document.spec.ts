import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Download, type Page, expect, test } from "@playwright/test";
import { openNavDrawer, openPackageEditor, navItem } from "./helpers.js";

/**
 * create-document.spec.ts — "Create new governance document" onboarding (#141).
 *
 * Cases:
 * (a) create → no download, app lands in the loaded editor with no validation errors;
 *     Save → To this device → a valid .srs download that re-imports with its content
 * (b) create → capture the first decision (through the UI; the scaffold
 *     pre-creates none) → export → re-import → decision still present
 * (c) create → Save → Dropbox via injected fake provider → provider.create() receives
 *     the slugged filename + archive bytes, and the document gains a writable handle
 *
 * The "create a new document" panel now lives on the generic splash (srs-web#322):
 * creating one lands in GenericSrsShell, and Governance is reached as an in-shell
 * package editor rather than a picked mode.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function openGovernancePicker(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function create(page: Page, name: string, editor?: string): Promise<void> {
  await page.getByTestId("create-name").fill(name);
  if (editor) await page.getByTestId(`create-editor-${editor}`).check();
  await page.getByTestId("create-repository").click();
}

/** Save → To this device; returns the downloaded .srs. */
async function saveToDevice(page: Page): Promise<Download> {
  await page.getByRole("button", { name: /^Save$/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("save-to-local").click(),
  ]);
  return download;
}

test.describe("New repository (#141, #341)", () => {
  test("create opens the editor without downloading; Save > To this device downloads a valid .srs", async ({
    page,
  }) => {
    await openGovernancePicker(page);
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });

    await create(page, "My Test Org", "governance");

    // The chosen editor opens directly, with nothing saved.
    await expect(navItem(page, /Decision/)).toBeVisible({ timeout: 5000 });
    expect(downloaded).toBe(false);
    // No validation errors surfaced for the fresh document
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    const download = await saveToDevice(page);
    // New documents are created as .srs archives (SRSzip).
    expect(download.suggestedFilename()).toBe("my-test-org.srs");
    const bytes = await downloadBytes(download);
    // A .srs is a zip.
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    await expect(page.getByTestId("save-to-modal")).toHaveCount(0);

    // Re-import the saved archive.
    await page.getByRole("button", { name: "Open another file" }).click();
    const tmpPath = path.join(__dirname, "fixtures", "_create_saved_tmp.srs");
    const fs = await import("node:fs/promises");
    await fs.writeFile(tmpPath, bytes);
    try {
      await page.locator('input[type="file"]#srsj-file').setInputFiles(tmpPath);
      await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
      await openPackageEditor(page, "governance");
      await expect(navItem(page, /Decision/)).toBeVisible({ timeout: 5000 });
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });

  test("create → first decision → export → re-import keeps the decision", async ({ page }) => {
    await openGovernancePicker(page);
    await create(page, "Round Trip Org", "governance");
    await expect(navItem(page, /Decision/)).toBeVisible({ timeout: 5000 });

    // Capture the first decision through the UI — the scaffold pre-creates none.
    await page.getByRole("button", { name: "New Decision" }).click();
    await page
      .locator(".field")
      .filter({ hasText: "Title" })
      .first()
      .locator("input")
      .fill("First Decision");
    await page
      .locator(".field")
      .filter({ hasText: "Decision Statement" })
      .locator("textarea")
      .fill("We will keep our decisions in a governance document.");
    await page.getByTestId("record-form").getByRole("button", { name: "Save" }).click();
    // After save, the new record is auto-selected and the reading view opens (Phase A, srs-web#39).
    await expect(page.getByTestId("record-reading")).toContainText("First Decision", {
      timeout: 5000,
    });

    // Export the mutated document
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .srsj" }).click(),
    ]);
    const exportedText = await downloadText(download);
    expect(exportedText).toContain("First Decision");

    // Re-import through the open flow
    await page.getByRole("button", { name: "Open another file" }).click();
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 5000 });
    const tmpPath = path.join(__dirname, "fixtures", "_create_roundtrip_tmp.srsj");
    const fs = await import("node:fs/promises");
    await fs.writeFile(tmpPath, exportedText, "utf8");
    try {
      await page.locator('input[type="file"]#srsj-file').setInputFiles(tmpPath);
      await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
      await openPackageEditor(page, "governance");
      await expect(navItem(page, /Decision/)).toBeVisible({ timeout: 5000 });
      await expect(page.locator("text=First Decision").first()).toBeVisible({ timeout: 5000 });
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });

  test("Save > Dropbox hands the archive to provider.create and keeps a writable handle", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const recorded: Array<{ name: string; isBinary: boolean }> = [];
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
      (window as any).__CREATE_CALLS__ = recorded;
      const writableHandle = (provider: "dropbox" | "google-drive", name: string) => ({
        provider,
        id: `${provider}-created`,
        name,
        revision: "revision-1",
        kind: "text",
        capabilities: { read: true, write: true },
        read: async () => "",
        write: async () => ({ revision: "revision-2" }),
      });
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
      (window as any).__SRS_STORAGE_PROVIDERS__ = {
        dropbox: {
          id: "dropbox",
          label: "Dropbox",
          configured: true,
          authenticate: async () => {},
          list: async () => [],
          open: async () => writableHandle("dropbox", "unused.srsj"),
          // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
          create: async (name: string, content: any) => {
            recorded.push({ name, isBinary: content instanceof Uint8Array });
            return writableHandle("dropbox", name);
          },
        },
        googleDrive: {
          id: "google-drive",
          label: "Google Drive",
          configured: true,
          authenticate: async () => {},
          open: async () => writableHandle("google-drive", "unused.srsj"),
          // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
          create: async (name: string, content: any) => {
            recorded.push({ name, isBinary: content instanceof Uint8Array });
            return writableHandle("google-drive", name);
          },
        },
      };
    });

    await openGovernancePicker(page);
    await create(page, "Cloud Org", "governance");
    await expect(navItem(page, /Decision/)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Save$/ }).click();
    await page.getByTestId("save-to-dropbox").click();
    await expect(page.getByTestId("save-to-modal")).toHaveCount(0);

    const calls = await page.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
      () => (window as any).__CREATE_CALLS__ as Array<{ name: string; isBinary: boolean }>
    );
    expect(calls).toHaveLength(1);
    // New documents are created as .srs archives.
    expect(calls[0].name).toBe("cloud-org.srs");
    expect(calls[0].isBinary).toBe(true);

    // A later Save goes to the created file, not the chooser.
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByTestId("save-to-modal")).toHaveCount(0);
  });

  test("new repository with Essay opens the essay editor", async ({ page }) => {
    await openGovernancePicker(page);
    await create(page, "Essay Repo", "essay");
    await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 10000 });
  });

  test("blank repository installs Essay from the generic shell", async ({ page }) => {
    await openGovernancePicker(page);
    await create(page, "Blank Repo");
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

    await openNavDrawer(page);
    await page.getByTestId("package-editor-essay-install").click();
    await expect(page.getByRole("button", { name: "New essay" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  });
});
