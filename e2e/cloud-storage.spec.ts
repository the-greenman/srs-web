import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, "fixtures", "sample.srsj"), "utf8");

type FakeMode = "success" | "cancel" | "auth-error" | "malformed";

async function installFakeProviders(page: Page, mode: FakeMode = "success"): Promise<void> {
  await page.addInitScript(
    ({ sampleText, fakeMode }) => {
      const documentHandle = (provider: "dropbox" | "google-drive", name: string) => ({
        provider,
        id: `${provider}-file`,
        name,
        revision: "revision-1",
        capabilities: { read: true, write: true },
        read: async () => fakeMode === "malformed" ? "{not-json" : sampleText,
        write: async () => ({ revision: "revision-2" }),
      });
      const failIfNeeded = () => {
        if (fakeMode === "cancel") throw { code: "cancelled", message: "cancelled" };
        if (fakeMode === "auth-error") throw new Error("Provider authorization failed");
      };
      window.__SRS_STORAGE_PROVIDERS__ = {
        dropbox: {
          id: "dropbox",
          label: "Dropbox",
          configured: true,
          authenticate: async () => failIfNeeded(),
          list: async () => [{
            id: "db-file",
            name: "dropbox-sample.srsj",
            kind: "file",
            path: "/dropbox-sample.srsj",
            revision: "revision-1",
          }],
          open: async () => documentHandle("dropbox", "dropbox-sample.srsj"),
        },
        googleDrive: {
          id: "google-drive",
          label: "Google Drive",
          configured: true,
          authenticate: async () => failIfNeeded(),
          select: async () => {
            failIfNeeded();
            return documentHandle("google-drive", "drive-sample.srsj");
          },
          open: async () => documentHandle("google-drive", "drive-sample.srsj"),
        },
      };
    },
    { sampleText: SAMPLE_TEXT, fakeMode: mode },
  );
}

test.describe("Cloud storage sources", () => {
  test("opens a Dropbox repository in Governance mode", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-dropbox").click();
    await page.getByRole("button", { name: /dropbox-sample\.srsj/ }).click();

    await expect(page.locator(".topbar__repo")).toHaveText("dropbox-sample");
    await expect(page.locator(".topbar__repo")).toHaveAttribute("title", "Opened from dropbox");
  });

  test("opens a Drive repository in Guides mode", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await page.getByTestId("mode-guides").click();
    await page.getByTestId("source-google-drive").click();

    await expect(page.getByTestId("guides-shell")).toBeVisible();
    await expect(page.locator(".topbar__repo")).toHaveText("drive-sample");
    await expect(page.locator(".topbar__repo")).toHaveAttribute(
      "title",
      "Opened from google-drive",
    );
  });

  test("provider cancellation leaves the chooser open without an error", async ({ page }) => {
    await installFakeProviders(page, "cancel");
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-google-drive").click();

    await expect(page.getByTestId("source-chooser")).toBeVisible();
    await expect(page.getByRole("alert")).not.toBeVisible();
  });

  test("provider authentication failures are shown inline", async ({ page }) => {
    await installFakeProviders(page, "auth-error");
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-dropbox").click();

    await expect(page.getByRole("alert")).toHaveText("Provider authorization failed");
    await expect(page.getByTestId("governance-file-picker")).toBeVisible();
  });

  test("malformed cloud files do not leave the source chooser", async ({ page }) => {
    await installFakeProviders(page, "malformed");
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-google-drive").click();

    await expect(page.getByRole("alert")).toContainText("Failed to load repository");
    await expect(page.getByTestId("governance-file-picker")).toBeVisible();
  });

  test("unconfigured providers are disabled while local files remain available", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click();

    await expect(page.getByTestId("source-dropbox")).toBeDisabled();
    await expect(page.getByTestId("source-google-drive")).toBeDisabled();
    await expect(page.locator("#srsj-file")).toBeAttached();
  });
});
