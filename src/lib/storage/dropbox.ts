import {
  StorageAuthenticationError,
  StorageCancelledError,
  StorageConfigurationError,
  StorageConflictError,
  StorageFetchError,
} from "./errors.js";
import type { DocumentHandle, StorageEntry, StorageProvider, WriteResult } from "./types.js";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";
const OAUTH_STATE = "srs.dropbox.oauth.state";
const OAUTH_VERIFIER = "srs.dropbox.oauth.verifier";
const OAUTH_MESSAGE = "srs.dropbox.oauth.complete";
const DROPBOX_SCOPES = ["files.metadata.read", "files.content.read", "files.content.write"].join(
  " "
);

interface DropboxToken {
  access_token: string;
  expires_in: number;
}

interface DropboxMetadata {
  ".tag": "file" | "folder";
  id: string;
  name: string;
  path_lower?: string;
  rev?: string;
}

interface DropboxListResponse {
  entries: DropboxMetadata[];
  cursor: string;
  has_more: boolean;
}

interface DropboxAuthMessage {
  type: typeof OAUTH_MESSAGE;
  state: string;
  accessToken?: string;
  expiresAt?: number;
  error?: string;
}

export interface DropboxConfig {
  appKey: string;
  redirectUri: string;
}

export interface DropboxOAuthCallback {
  code: string | null;
  state: string | null;
  error: string | null;
}

export function parseDropboxOAuthCallback(url: string): DropboxOAuthCallback {
  const parsed = new URL(url);
  return {
    code: parsed.searchParams.get("code"),
    state: parsed.searchParams.get("state"),
    error: parsed.searchParams.get("error_description") ?? parsed.searchParams.get("error"),
  };
}

function randomUrlSafe(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error_summary?: string; error_description?: string };
    return parsed.error_description ?? parsed.error_summary ?? text;
  } catch {
    return text || response.statusText;
  }
}

export async function completeDropboxOAuthCallback(config: DropboxConfig): Promise<boolean> {
  const { code, state, error: oauthError } = parseDropboxOAuthCallback(window.location.href);
  if ((!code && !oauthError) || !state || !window.opener) return false;

  const expectedState = sessionStorage.getItem(OAUTH_STATE);
  const verifier = sessionStorage.getItem(OAUTH_VERIFIER);
  const message: DropboxAuthMessage = { type: OAUTH_MESSAGE, state };

  try {
    if (oauthError) throw new Error(oauthError);
    if (state !== expectedState || !verifier) throw new Error("Dropbox OAuth state was invalid.");

    const body = new URLSearchParams({
      code: code ?? "",
      grant_type: "authorization_code",
      client_id: config.appKey,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    });
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(await parseError(response));
    const token = (await response.json()) as DropboxToken;
    message.accessToken = token.access_token;
    message.expiresAt = Date.now() + token.expires_in * 1000;
  } catch (error) {
    message.error = error instanceof Error ? error.message : String(error);
  } finally {
    sessionStorage.removeItem(OAUTH_STATE);
    sessionStorage.removeItem(OAUTH_VERIFIER);
  }

  window.opener.postMessage(message, window.location.origin);
  window.close();
  return true;
}

export class DropboxDocumentHandle implements DocumentHandle {
  readonly provider = "dropbox" as const;
  readonly capabilities = { read: true, write: true } as const;
  private currentRevision: string | null;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly path: string,
    revision: string | null,
    private readonly token: () => string
  ) {
    this.currentRevision = revision;
  }

  get revision(): string | null {
    return this.currentRevision;
  }

  async read(): Promise<string> {
    const response = await fetch(`${CONTENT}/files/download`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token()}`,
        "Dropbox-API-Arg": JSON.stringify({ path: this.id }),
      },
    });
    if (!response.ok) {
      throw new StorageFetchError(`Dropbox download failed: ${await parseError(response)}`);
    }
    return response.text();
  }

  async write(
    content: string,
    expectedRevision: string | null = this.currentRevision
  ): Promise<WriteResult> {
    const mode = expectedRevision ? { ".tag": "update", update: expectedRevision } : "overwrite";
    const response = await fetch(`${CONTENT}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: this.path,
          mode,
          autorename: false,
          mute: false,
        }),
      },
      body: content,
    });
    if (response.status === 409) throw new StorageConflictError();
    if (!response.ok) {
      throw new StorageFetchError(`Dropbox upload failed: ${await parseError(response)}`);
    }
    const metadata = (await response.json()) as DropboxMetadata;
    this.currentRevision = metadata.rev ?? null;
    return { revision: this.currentRevision };
  }
}

export class DropboxProvider implements StorageProvider {
  readonly id = "dropbox" as const;
  readonly label = "Dropbox";
  readonly configured: boolean;
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly config: DropboxConfig) {
    this.configured = Boolean(config.appKey && config.redirectUri);
  }

  async authenticate(): Promise<void> {
    if (!this.configured) {
      throw new StorageConfigurationError("Dropbox is not configured.");
    }
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;

    const state = randomUrlSafe();
    const verifier = randomUrlSafe(64);
    sessionStorage.setItem(OAUTH_STATE, state);
    sessionStorage.setItem(OAUTH_VERIFIER, verifier);
    const challenge = await challengeFor(verifier);
    const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
    authUrl.search = new URLSearchParams({
      client_id: this.config.appKey,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      token_access_type: "online",
      scope: DROPBOX_SCOPES,
      state,
    }).toString();

    const popup = window.open(authUrl, "srs-dropbox-oauth", "popup,width=640,height=720");
    if (!popup) throw new StorageAuthenticationError("Dropbox sign-in popup was blocked.");

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new StorageCancelledError("Dropbox sign-in was cancelled."));
        }
      }, 300);
      const onMessage = (event: MessageEvent<DropboxAuthMessage>) => {
        if (event.origin !== window.location.origin || event.data.type !== OAUTH_MESSAGE) return;
        if (event.data.state !== state) return;
        cleanup();
        if (event.data.error || !event.data.accessToken) {
          reject(new StorageAuthenticationError(event.data.error ?? "Dropbox sign-in failed."));
          return;
        }
        this.accessToken = event.data.accessToken;
        this.expiresAt = event.data.expiresAt ?? 0;
        resolve();
      };
      const cleanup = () => {
        window.clearInterval(timeout);
        window.removeEventListener("message", onMessage);
        sessionStorage.removeItem(OAUTH_STATE);
        sessionStorage.removeItem(OAUTH_VERIFIER);
      };
      window.addEventListener("message", onMessage);
    });
  }

  async list(path = ""): Promise<StorageEntry[]> {
    await this.authenticate();
    const entries: DropboxMetadata[] = [];
    let response = await this.api<DropboxListResponse>("/files/list_folder", { path });
    entries.push(...response.entries);
    while (response.has_more) {
      response = await this.api<DropboxListResponse>("/files/list_folder/continue", {
        cursor: response.cursor,
      });
      entries.push(...response.entries);
    }
    return entries
      .filter((entry) => entry[".tag"] === "folder" || /\.(srsj|json)$/i.test(entry.name))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        kind: entry[".tag"],
        path: entry.path_lower,
        revision: entry.rev ?? null,
      }))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1
      );
  }

  async open(entry: StorageEntry): Promise<DocumentHandle> {
    await this.authenticate();
    if (entry.kind !== "file" || !entry.path) {
      throw new StorageFetchError("Dropbox did not return a usable file path.");
    }
    return new DropboxDocumentHandle(entry.id, entry.name, entry.path, entry.revision ?? null, () =>
      this.requireToken()
    );
  }

  private requireToken(): string {
    if (!this.accessToken) throw new StorageAuthenticationError("Dropbox is not signed in.");
    return this.accessToken;
  }

  private async api<T>(route: string, body: object): Promise<T> {
    const response = await fetch(`${API}${route}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const message = await parseError(response);
      if (message.includes("missing_scope")) {
        throw new StorageAuthenticationError(
          "Dropbox authorization is missing a required file scope. Enable files.metadata.read, files.content.read, and files.content.write in the Dropbox app console, click Submit, then reconnect."
        );
      }
      throw new StorageFetchError(`Dropbox request failed: ${message}`);
    }
    return response.json() as Promise<T>;
  }
}
