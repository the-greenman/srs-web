import {
  StorageAuthenticationError,
  StorageCancelledError,
  StorageConfigurationError,
  StorageConflictError,
  StorageFetchError,
} from "./errors.js";
import { loadScript } from "./script-loader.js";
import type { DocumentHandle, StorageEntry, StorageProvider, WriteResult } from "./types.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken(config?: { prompt?: string }): void;
}

interface GooglePickerDocument {
  id: string;
  name: string;
}

interface GooglePickerResponse {
  action: string;
  docs?: GooglePickerDocument[];
}

interface GoogleRuntime {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }): GoogleTokenClient;
    };
  };
  picker?: {
    Action: { PICKED: string; CANCEL: string };
    DocsView: new () => {
      setIncludeFolders(value: boolean): unknown;
      setMimeTypes(value: string): unknown;
      setMode(value: string): unknown;
    };
    DocsViewMode: { LIST: string };
    PickerBuilder: new () => {
      addView(view: unknown): unknown;
      setOAuthToken(token: string): unknown;
      setDeveloperKey(key: string): unknown;
      setAppId(id: string): unknown;
      setCallback(callback: (data: GooglePickerResponse) => void): unknown;
      build(): { setVisible(visible: boolean): void };
    };
  };
}

interface GapiRuntime {
  load(name: string, callback: () => void): void;
}

declare global {
  interface Window {
    google?: GoogleRuntime;
    gapi?: GapiRuntime;
  }
}

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  appId: string;
}

async function responseMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    return parsed.error?.message ?? text;
  } catch {
    return text || response.statusText;
  }
}

export class GoogleDriveDocumentHandle implements DocumentHandle {
  readonly provider = "google-drive" as const;
  readonly capabilities = { read: true, write: true } as const;
  private currentRevision: string | null;

  constructor(
    readonly id: string,
    readonly name: string,
    revision: string | null,
    private readonly token: () => Promise<string>
  ) {
    this.currentRevision = revision;
  }

  get revision(): string | null {
    return this.currentRevision;
  }

  async read(): Promise<string> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(this.id)}?alt=media`,
      { headers: { Authorization: `Bearer ${await this.token()}` } }
    );
    if (!response.ok) {
      throw new StorageFetchError(
        `Google Drive download failed: ${await responseMessage(response)}`
      );
    }
    return response.text();
  }

  async write(
    content: string,
    expectedRevision: string | null = this.currentRevision
  ): Promise<WriteResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.token()}`,
      "Content-Type": "application/json",
    };
    if (expectedRevision) headers["If-Match"] = expectedRevision;
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(this.id)}?uploadType=media&fields=id,name,version`,
      { method: "PATCH", headers, body: content }
    );
    if (response.status === 409 || response.status === 412) throw new StorageConflictError();
    if (!response.ok) {
      throw new StorageFetchError(`Google Drive upload failed: ${await responseMessage(response)}`);
    }
    this.currentRevision = response.headers.get("etag");
    return { revision: this.currentRevision };
  }
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = "google-drive" as const;
  readonly label = "Google Drive";
  readonly configured: boolean;
  private tokenClient: GoogleTokenClient | null = null;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private pickerReady: Promise<void> | null = null;
  private tokenReject: ((error: StorageAuthenticationError) => void) | null = null;

  constructor(private readonly config: GoogleDriveConfig) {
    this.configured = Boolean(config.clientId && config.apiKey && config.appId);
  }

  async authenticate(): Promise<void> {
    await this.ensureRuntime();
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;
    await this.requestToken(this.accessToken ? "" : "consent");
  }

  async select(): Promise<DocumentHandle> {
    await this.authenticate();
    await this.ensurePicker();
    const google = window.google;
    const pickerApi = google?.picker;
    if (!pickerApi || !this.accessToken) {
      throw new StorageAuthenticationError("Google Picker did not initialize.");
    }

    return new Promise<DocumentHandle>((resolve, reject) => {
      const view = new pickerApi.DocsView();
      view.setIncludeFolders(false);
      view.setMimeTypes("application/json,application/octet-stream,text/plain");
      view.setMode(pickerApi.DocsViewMode.LIST);
      const builder = new pickerApi.PickerBuilder();
      builder.addView(view);
      builder.setOAuthToken(this.accessToken ?? "");
      builder.setDeveloperKey(this.config.apiKey);
      builder.setAppId(this.config.appId);
      builder.setCallback((data) => {
        if (data.action === pickerApi.Action.CANCEL) {
          reject(new StorageCancelledError());
          return;
        }
        if (data.action !== pickerApi.Action.PICKED) return;
        const selected = data.docs?.[0];
        if (!selected || !/\.(srsj|json)$/i.test(selected.name)) {
          reject(new StorageFetchError("Choose a .srsj or .json file."));
          return;
        }
        void this.open({ id: selected.id, name: selected.name, kind: "file" }).then(
          resolve,
          reject
        );
      });
      builder.build().setVisible(true);
    });
  }

  async open(entry: StorageEntry): Promise<DocumentHandle> {
    await this.authenticate();
    const token = await this.requireToken();
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(entry.id)}?fields=id,name,mimeType,version`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new StorageFetchError(
        `Google Drive metadata failed: ${await responseMessage(response)}`
      );
    }
    const metadata = (await response.json()) as { id: string; name: string; mimeType: string };
    if (metadata.mimeType.startsWith("application/vnd.google-apps.")) {
      throw new StorageFetchError("Google Workspace documents cannot contain an .srsj repository.");
    }
    const revision = response.headers.get("etag");
    return new GoogleDriveDocumentHandle(metadata.id, metadata.name, revision, () =>
      this.requireToken()
    );
  }

  private async ensureRuntime(): Promise<void> {
    if (!this.configured) {
      throw new StorageConfigurationError("Google Drive is not configured.");
    }
    await loadScript("https://accounts.google.com/gsi/client");
    const oauth = window.google?.accounts.oauth2;
    if (!oauth)
      throw new StorageAuthenticationError("Google Identity Services did not initialize.");
    if (!this.tokenClient) {
      this.tokenClient = oauth.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_SCOPE,
        callback: () => undefined,
        error_callback: (error) => {
          this.tokenReject?.(
            new StorageAuthenticationError(
              error.type === "popup_closed"
                ? "Google sign-in was cancelled."
                : "Google sign-in popup failed."
            )
          );
          this.tokenReject = null;
        },
      });
    }
  }

  private async ensurePicker(): Promise<void> {
    if (window.google?.picker) return;
    if (!this.pickerReady) {
      this.pickerReady = loadScript("https://apis.google.com/js/api.js").then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (!window.gapi) {
              reject(new StorageFetchError("Google API loader did not initialize."));
              return;
            }
            window.gapi.load("picker", resolve);
          })
      );
    }
    await this.pickerReady;
  }

  private requestToken(prompt: string): Promise<void> {
    const client = this.tokenClient;
    if (!client)
      return Promise.reject(new StorageAuthenticationError("Google OAuth is unavailable."));
    return new Promise<void>((resolve, reject) => {
      this.tokenReject = reject;
      client.callback = (response) => {
        this.tokenReject = null;
        if (response.error || !response.access_token) {
          reject(
            new StorageAuthenticationError(
              response.error_description ?? response.error ?? "Google authorization failed."
            )
          );
          return;
        }
        this.accessToken = response.access_token;
        this.expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        resolve();
      };
      try {
        client.requestAccessToken({ prompt });
      } catch (error) {
        reject(new StorageAuthenticationError("Google authorization failed.", { cause: error }));
      }
    });
  }

  private async requireToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.expiresAt - 30_000) {
      await this.authenticate();
    }
    if (!this.accessToken) throw new StorageAuthenticationError("Google Drive is not signed in.");
    return this.accessToken;
  }
}
