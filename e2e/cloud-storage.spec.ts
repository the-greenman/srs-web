import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, "fixtures", "sample.srsj"), "utf8");

type FakeMode = "success" | "cancel" | "auth-error" | "malformed" | "conflict";

async function installFakeProviders(page: Page, mode: FakeMode = "success"): Promise<void> {
  await page.addInitScript(
    ({ sampleText, fakeMode }) => {
      const documentHandle = (provider: "dropbox" | "google-drive" | "github", name: string) => ({
        provider,
        id: `${provider}-file`,
        name,
        revision: "revision-1",
        kind: "text",
        capabilities: { read: true, write: true },
        read: async () => (fakeMode === "malformed" ? "{not-json" : sampleText),
        write: async () => {
          // A stale-write surfaces as a conflict rather than clobbering.
          if (fakeMode === "conflict") throw { code: "conflict", message: "changed upstream" };
          return { revision: "revision-2" };
        },
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
          list: async () => [
            {
              id: "db-file",
              name: "dropbox-sample.srsj",
              kind: "file",
              path: "/dropbox-sample.srsj",
              revision: "revision-1",
            },
          ],
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
        github: {
          id: "github",
          label: "GitHub",
          configured: true,
          authenticate: async () => failIfNeeded(),
          // "" → repos; "owner/repo" → branches; "owner/repo:branch" → files.
          list: async (path?: string) => {
            if (!path) {
              return [
                { id: "octo/gov", name: "octo/gov", kind: "folder", path: "octo/gov" },
                { id: "octo/notes", name: "octo/notes", kind: "folder", path: "octo/notes" },
              ];
            }
            if (!path.includes(":")) {
              return [
                { id: `${path}:main`, name: "main", kind: "folder", path: `${path}:main` },
                { id: `${path}:dev`, name: "dev", kind: "folder", path: `${path}:dev` },
              ];
            }
            return [
              {
                id: `${path}:repo.srsj`,
                name: "repo.srsj",
                kind: "file",
                path: `${path}:repo.srsj`,
                revision: "sha-1",
              },
            ];
          },
          // A git-aware handle (branch from the browse path) so Save opens the dialog.
          open: async (entry: { path?: string }) => {
            const [repoPart = "octo/gov", branch = "main"] = (entry.path ?? "").split(":");
            return {
              ...documentHandle("github", "repo.srsj"),
              branch,
              repoLabel: repoPart,
              saveToBranch: async (_content: string, opts: { branch: string }) => {
                if (fakeMode === "conflict")
                  throw { code: "conflict", message: "changed upstream" };
                return { revision: opts.branch === branch ? "sha-2" : "sha-branch" };
              },
            };
          },
        },
      };
    },
    { sampleText: SAMPLE_TEXT, fakeMode: mode }
  );
}

test.describe("Cloud storage sources", () => {
  test("opens a Dropbox repository in Governance mode", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-dropbox").click();
    await page.getByRole("button", { name: /dropbox-sample\.srsj/ }).click();

    // Repo identity renders as the leading breadcrumb (span[title="Opened from …"]).
    await expect(page.getByTitle("Opened from dropbox")).toHaveText("dropbox-sample");
  });

  test("opens a Drive repository in Guides mode", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await page.getByTestId("mode-guides").click();
    await page.getByTestId("source-google-drive").click();

    await expect(page.getByTestId("guides-shell")).toBeVisible();
    await expect(page.getByTitle("Opened from google-drive")).toHaveText("drive-sample");
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

  test("unconfigured providers are disabled while local files remain available", async ({
    page,
  }) => {
    // Inject explicitly-unconfigured providers so the assertion is deterministic
    // regardless of any ambient .env.local a developer may have.
    await page.addInitScript(() => {
      const stub = (id: string, label: string) => ({
        id,
        label,
        configured: false,
        authenticate: async () => {},
        open: async () => {
          throw new Error("unconfigured");
        },
      });
      // biome-ignore lint/suspicious/noExplicitAny: test injection shape
      (window as any).__SRS_STORAGE_PROVIDERS__ = {
        dropbox: stub("dropbox", "Dropbox"),
        googleDrive: stub("google-drive", "Google Drive"),
        github: stub("github", "GitHub"),
      };
    });
    await page.goto("/");
    await page.getByTestId("mode-governance").click();

    await expect(page.getByTestId("source-dropbox")).toBeDisabled();
    await expect(page.getByTestId("source-google-drive")).toBeDisabled();
    await expect(page.getByTestId("source-github")).toBeDisabled();
    await expect(page.locator("#srsj-file")).toBeAttached();
  });

  test("opens a GitHub repository by browsing repo → branch → file", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-github").click();
    // "" → repos; pick repo → branches; pick branch → the .srsj.
    await page.getByRole("button", { name: /octo\/gov/ }).click();
    await expect(page.getByRole("button", { name: /^Folder\s+main$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Folder\s+dev$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Folder\s+main$/ }).click();
    await page.getByRole("button", { name: /repo\.srsj/ }).click();

    await expect(page.getByTitle("Opened from github")).toHaveText("repo");
  });

  test("filters the repository list by name", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-github").click();
    await expect(page.getByRole("button", { name: /octo\/gov/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /octo\/notes/ })).toBeVisible();

    await page.getByTestId("cloud-browser-filter").fill("notes");
    await expect(page.getByRole("button", { name: /octo\/gov$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /octo\/notes/ })).toBeVisible();
  });

  async function openGitHubDoc(page: Page): Promise<void> {
    await page.getByTestId("mode-governance").click();
    await page.getByTestId("source-github").click();
    await page.getByRole("button", { name: /octo\/gov/ }).click(); // repo
    await page.getByRole("button", { name: /^Folder\s+main$/ }).click(); // branch
    await page.getByRole("button", { name: /repo\.srsj/ }).click(); // file
  }

  test("Save opens a branch dialog and commits to the current branch", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await openGitHubDoc(page);

    await page.getByTestId("save-document").click();
    await expect(page.getByTestId("git-save-modal")).toBeVisible();
    // Current-branch commit is the default.
    await page.getByTestId("git-save-confirm").click();
    await expect(page.getByTestId("save-status")).toContainText("Saved.");
    await expect(page.getByTestId("git-save-modal")).toHaveCount(0);
  });

  test("Save can create a new branch", async ({ page }) => {
    await installFakeProviders(page);
    await page.goto("/");
    await openGitHubDoc(page);

    await page.getByTestId("save-document").click();
    await page.getByTestId("git-save-mode-new").check();
    await page.getByTestId("git-save-branch-input").fill("governance-edits");
    await page.getByTestId("git-save-confirm").click();
    await expect(page.getByTestId("save-status")).toContainText("new branch");
  });

  test("a stale GitHub save surfaces a conflict in the dialog", async ({ page }) => {
    await installFakeProviders(page, "conflict");
    await page.goto("/");
    await openGitHubDoc(page);

    await page.getByTestId("save-document").click();
    await page.getByTestId("git-save-confirm").click();
    // The dialog stays open (install hint visible) and shows the conflict.
    await expect(page.getByTestId("git-save-error")).toContainText("changed since you opened it");
    await expect(page.getByTestId("git-save-modal")).toBeVisible();
  });
});
