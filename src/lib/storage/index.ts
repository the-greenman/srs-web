import { type DropboxConfig, DropboxProvider } from "./dropbox.js";
import { type GitHubConfig, GitHubProvider } from "./github.js";
import { type GoogleDriveConfig, GoogleDriveProvider } from "./google-drive.js";
import type { DocumentHandle, GitBranchAware, StorageProvider } from "./types.js";

export * from "./errors.js";
export * from "./local.js";
export * from "./types.js";

/** A handle that supports branch-aware git saves (currently GitHub). */
export function isGitBranchAware(
  handle: DocumentHandle | null | undefined
): handle is DocumentHandle & GitBranchAware {
  return (
    handle != null &&
    typeof (handle as Partial<GitBranchAware>).saveToBranch === "function" &&
    typeof (handle as Partial<GitBranchAware>).branch === "string"
  );
}
export { completeDropboxOAuthCallback } from "./dropbox.js";
export { completeGitHubOAuthCallback, type GitHubConfig } from "./github.js";

export interface StorageProviders {
  dropbox: StorageProvider;
  googleDrive: StorageProvider;
  /** Optional so test fixtures injecting only {dropbox, googleDrive} stay valid;
   * the live registry always constructs it. Additional git providers slot in here. */
  github?: StorageProvider;
}

declare global {
  interface Window {
    __SRS_STORAGE_PROVIDERS__?: StorageProviders;
  }
}

export function createStorageProviders(
  dropbox: DropboxConfig,
  googleDrive: GoogleDriveConfig,
  github: GitHubConfig
): StorageProviders {
  return {
    dropbox: new DropboxProvider(dropbox),
    googleDrive: new GoogleDriveProvider(googleDrive),
    github: new GitHubProvider(github),
  };
}

export function createStorageProvidersFromEnv(): StorageProviders {
  if (window.__SRS_STORAGE_PROVIDERS__) return window.__SRS_STORAGE_PROVIDERS__;
  return createStorageProviders(
    {
      appKey: import.meta.env.VITE_DROPBOX_APP_KEY ?? "",
      redirectUri: import.meta.env.VITE_DROPBOX_REDIRECT_URI ?? `${window.location.origin}/`,
    },
    {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? "",
      appId: import.meta.env.VITE_GOOGLE_APP_ID ?? "",
    },
    {
      clientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? "",
      redirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI ?? `${window.location.origin}/`,
    }
  );
}
