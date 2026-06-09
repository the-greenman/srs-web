import { type DropboxConfig, DropboxProvider } from "./dropbox.js";
import { type GoogleDriveConfig, GoogleDriveProvider } from "./google-drive.js";
import type { StorageProvider } from "./types.js";

export * from "./errors.js";
export * from "./local.js";
export * from "./types.js";
export { completeDropboxOAuthCallback } from "./dropbox.js";

export interface StorageProviders {
  dropbox: StorageProvider;
  googleDrive: StorageProvider;
}

declare global {
  interface Window {
    __SRS_STORAGE_PROVIDERS__?: StorageProviders;
  }
}

export function createStorageProviders(
  dropbox: DropboxConfig,
  googleDrive: GoogleDriveConfig
): StorageProviders {
  return {
    dropbox: new DropboxProvider(dropbox),
    googleDrive: new GoogleDriveProvider(googleDrive),
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
    }
  );
}
