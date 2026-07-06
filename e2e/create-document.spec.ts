import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Download, type Page } from "@playwright/test";

/**
 * create-document.spec.ts — "Create new governance document" onboarding (#141).
 *
 * Cases:
 * (a) local create → download intercepted → migrated-seed envelope assertions →
 *     app lands in the loaded editor with no validation errors
 * (b) create → capture the first decision (through the UI; the scaffold
 *     pre-creates none) → export → re-import → decision still present
 * (c) cloud create via injected fake provider → provider.create() receives the
 *     slugged filename + valid srsj content, app transitions to loaded with a
 *     writable handle
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function openGovernancePicker(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("mode-governance").click({ timeout: 15000 });
  await expect(page.getByTestId("governance-file-picker")).toBeVisible({ timeout: 5000 });
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function createLocal(page: Page, name: string): Promise<string> {
  await page.getByTestId("create-name").fill(name);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("create-local").click(),
  ]);
  return downloadText(download);
}

test.describe("Create new governance document (#141)", () => {
  test("local create downloads a migrated, valid srsj and opens the editor", async ({ page }) => {
    await openGovernancePicker(page);

    await page.getByTestId("create-name").fill("My Test Org");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("create-local").click(),
    ]);

    expect(download.suggestedFilename()).toBe("my-test-org.srsj");
    const parsed = JSON.parse(await downloadText(download));
    expect(parsed).toHaveProperty("srsj", "1");
    // Migrated-seed marker: top-level upstreamPackage with a contentHash
    expect(typeof parsed.manifest?.upstreamPackage?.contentHash).toBe("string");
    expect(parsed.manifest.upstreamPackage.contentHash).toMatch(/^sha256:/);
    expect(parsed.manifest.title).toBe("My Test Org");
    // Scaffold output: identity + decision log + root container members exist
    expect(parsed.manifest.instanceIndex.length).toBeGreaterThanOrEqual(2);

    // App transitioned to the loaded editor
    await expect(page.getByRole("link", { name: /Decision/ })).toBeVisible({ timeout: 5000 });
    // No validation errors surfaced for the fresh document
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test("create → first decision → export → re-import keeps the decision", async ({ page }) => {
    await openGovernancePicker(page);
    await createLocal(page, "Round Trip Org");
    await expect(page.getByRole("link", { name: /Decision/ })).toBeVisible({ timeout: 5000 });

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
    await page.getByRole("button", { name: "Save" }).click();
    // Decisions render in the Decision Log table; the new row appears selected.
    await expect(page.getByRole("row", { name: /First Decision/ })).toBeVisible({ timeout: 5000 });

    // Export the mutated document
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .srsj" }).click(),
    ]);
    const exportedText = await downloadText(download);
    expect(exportedText).toContain("First Decision");

    // Re-import through the open flow
    await page.getByRole("button", { name: "Open another file" }).click();
    await page.getByTestId("mode-governance").click({ timeout: 5000 });
    const tmpPath = path.join(__dirname, "fixtures", "_create_roundtrip_tmp.srsj");
    const fs = await import("node:fs/promises");
    await fs.writeFile(tmpPath, exportedText, "utf8");
    try {
      await page.locator('input[type="file"]#srsj-file').setInputFiles(tmpPath);
      await expect(page.getByRole("link", { name: /Decision/ })).toBeVisible({ timeout: 5000 });
      await expect(page.locator("text=First Decision").first()).toBeVisible({ timeout: 5000 });
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });

  test("cloud create hands the exported srsj to provider.create and loads the editor", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const recorded: Array<{ name: string; content: string }> = [];
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
      (window as any).__CREATE_CALLS__ = recorded;
      const writableHandle = (provider: "dropbox" | "google-drive", name: string) => ({
        provider,
        id: `${provider}-created`,
        name,
        revision: "revision-1",
        capabilities: { read: true, write: true },
        read: async () => recorded[recorded.length - 1]?.content ?? "",
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
          create: async (name: string, content: string) => {
            recorded.push({ name, content });
            return writableHandle("dropbox", name);
          },
        },
        googleDrive: {
          id: "google-drive",
          label: "Google Drive",
          configured: true,
          authenticate: async () => {},
          open: async () => writableHandle("google-drive", "unused.srsj"),
          create: async (name: string, content: string) => {
            recorded.push({ name, content });
            return writableHandle("google-drive", name);
          },
        },
      };
    });

    await openGovernancePicker(page);
    await page.getByTestId("create-name").fill("Cloud Org");
    await page.getByTestId("create-dropbox").click();

    // App lands in the loaded editor backed by the created handle
    await expect(page.getByRole("link", { name: /Decision/ })).toBeVisible({ timeout: 10000 });

    const calls = await page.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam
      () => (window as any).__CREATE_CALLS__ as Array<{ name: string; content: string }>
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("cloud-org.srsj");
    const parsed = JSON.parse(calls[0].content);
    expect(parsed).toHaveProperty("srsj", "1");
    expect(parsed.manifest.title).toBe("Cloud Org");
  });
});
