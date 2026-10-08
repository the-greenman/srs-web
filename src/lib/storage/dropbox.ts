import {
  StorageAuthenticationError,
  StorageCancelledError,
  StorageConfigurationError,
  StorageConflictError,
  StorageFetchError,
} from "./errors.js";
import { MANIFEST_FILE, isSrsArchiveName, listingHasRepoMarker } from "./srs-detect.js";
import { TREE_SKIP_DIRS, assertRepoTree, sameBytes } from "./tree-utils.js";
import type {
  DocumentCapabilities,
  DocumentHandle,
  RepoTreeAware,
  StorageEntry,
  StorageProvider,
  WriteResult,
} from "./types.js";

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
  path_display?: string;
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

/**
 * `Dropbox-API-Arg` is an HTTP header, so non-ASCII characters (tree paths can carry
 * any filename) must be JSON-escaped or the request is rejected.
 */
function apiArg(arg: object): string {
  return JSON.stringify(arg).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

/** Concurrent requests per tree read/commit — polite to Dropbox's rate limits. */
const TREE_CONCURRENCY = 6;

/** Run `fn` over `items` with bounded concurrency; resolves to every settled result. */
async function settleBounded<T>(
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        // biome-ignore lint/style/noNonNullAssertion: i < items.length
        await fn(items[i]!);
        results[i] = { status: "fulfilled", value: undefined };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(TREE_CONCURRENCY, items.length) }, worker));
  return results;
}

export async function completeDropboxOAuthCallback(config: DropboxConfig): Promise<boolean> {
  const { code, state, error: oauthError } = parseDropboxOAuthCallback(window.location.href);
  if ((!code && !oauthError) || !state || !window.opener) return false;

  const expectedState = sessionStorage.getItem(OAUTH_STATE);
  // Not our redirect (another provider opened this popup) — let the next handler try.
  if (expectedState === null) return false;
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
  readonly kind: "text" | "bytes";
  private currentRevision: string | null;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly path: string,
    revision: string | null,
    private readonly token: () => string
  ) {
    this.currentRevision = revision;
    this.kind = isSrsArchiveName(name) ? "bytes" : "text";
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

  async readBytes(): Promise<Uint8Array> {
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
    return new Uint8Array(await response.arrayBuffer());
  }

  async write(
    content: string,
    expectedRevision: string | null = this.currentRevision
  ): Promise<WriteResult> {
    return this._upload(content, expectedRevision);
  }

  async writeBytes(
    bytes: Uint8Array,
    expectedRevision: string | null = this.currentRevision
  ): Promise<WriteResult> {
    return this._upload(bytes, expectedRevision);
  }

  private async _upload(
    body: string | Uint8Array,
    expectedRevision: string | null
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
      body: body as BodyInit,
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

/** A file of the tree as last read or written: its bytes and the Dropbox revision they came from. */
interface TreeBaseFile {
  bytes: Uint8Array;
  rev: string | null;
}

/**
 * A whole exploded SRS repository in a Dropbox folder (srs-web#262), read and written
 * as a unit like the GitHub and local tree handles (ADR-016, ADR-018).
 *
 * Dropbox has no multi-file atomic commit, so `commitTree` writes only the paths whose
 * bytes changed, each guarded by the revision it was read at (`mode: update`), and
 * deletes removed paths guarded by `parent_rev`. A concurrent edit surfaces as the
 * same `StorageConflictError` the single-file path throws. A save that fails part-way
 * leaves the base reflecting exactly what landed, so a retry resends only the rest.
 */
export class DropboxTreeHandle implements DocumentHandle, RepoTreeAware {
  readonly provider = "dropbox" as const;
  readonly kind = "tree" as const;
  readonly revision = null;
  readonly capabilities: DocumentCapabilities = { read: true, write: true };

  constructor(
    readonly id: string,
    readonly name: string,
    /** The repository folder's Dropbox path ("" for the account root). */
    private readonly root: string,
    private base: Record<string, TreeBaseFile>,
    private readonly token: () => string
  ) {}

  readTree(): Promise<Record<string, Uint8Array>> {
    // Copies, not the base: the caller mutates the tree it gets back, and
    // commitTree() has to diff against what was actually on Dropbox.
    return Promise.resolve(
      Object.fromEntries(Object.entries(this.base).map(([path, f]) => [path, f.bytes]))
    );
  }

  async commitTree(files: Record<string, Uint8Array>): Promise<WriteResult> {
    const changed = Object.entries(files).filter(
      ([path, bytes]) => !sameBytes(this.base[path]?.bytes, bytes)
    );
    const removed = Object.keys(this.base).filter((path) => !(path in files));
    const next: Record<string, TreeBaseFile> = { ...this.base };

    const results = await settleBounded(
      [
        ...changed.map(([path, bytes]) => ({ path, bytes: bytes as Uint8Array | null })),
        ...removed.map((path) => ({ path, bytes: null as Uint8Array | null })),
      ],
      async ({ path, bytes }) => {
        if (bytes) {
          const rev = await this.upload(path, bytes, this.base[path]?.rev ?? null);
          next[path] = { bytes, rev };
        } else {
          await this.remove(path, this.base[path]?.rev ?? null);
          delete next[path];
        }
      }
    );
    this.base = next;

    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) throw failure.reason;
    return { revision: null };
  }

  read(): Promise<string> {
    return Promise.reject(
      new StorageFetchError("Tree-mode documents are read via readTree(), not read().")
    );
  }

  write(): Promise<WriteResult> {
    return Promise.reject(
      new StorageFetchError("Tree-mode documents are committed via commitTree(), not write().")
    );
  }

  private pathOf(relative: string): string {
    return `${this.root}/${relative}`;
  }

  private async upload(
    path: string,
    bytes: Uint8Array,
    rev: string | null
  ): Promise<string | null> {
    const response = await fetch(`${CONTENT}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": apiArg({
          path: this.pathOf(path),
          mode: rev ? { ".tag": "update", update: rev } : "add",
          autorename: false,
          mute: false,
        }),
      },
      body: bytes as BodyInit,
    });
    if (response.status === 409) throw new StorageConflictError();
    if (!response.ok) {
      throw new StorageFetchError(
        `Dropbox upload of ${path} failed: ${await parseError(response)}`
      );
    }
    return ((await response.json()) as DropboxMetadata).rev ?? null;
  }

  private async remove(path: string, rev: string | null): Promise<void> {
    const response = await fetch(`${API}/files/delete_v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: this.pathOf(path), ...(rev ? { parent_rev: rev } : {}) }),
    });
    if (response.ok) return;
    const message = await parseError(response);
    // Already gone is the outcome we wanted.
    if (message.includes("not_found")) return;
    if (response.status === 409) throw new StorageConflictError();
    throw new StorageFetchError(`Dropbox delete of ${path} failed: ${message}`);
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
    // Complete listing — SRS-relevance filtering is presentation and lives in the
    // picker UI (ADR-018), so "Show all files" can actually show everything.
    const raw: StorageEntry[] = entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: entry[".tag"],
      path: entry.path_lower,
      revision: entry.rev ?? null,
    }));
    // A folder carrying a repo marker is an exploded SRS repository root: surface a
    // synthetic "Open as SRS repository" entry. manifest.json is then hidden — opened
    // alone it is never a valid .srsj payload (same treatment as GitHub).
    const isRepoRoot = listingHasRepoMarker(raw);
    const sorted = raw
      .filter((entry) => !(isRepoRoot && entry.kind === "file" && entry.name === MANIFEST_FILE))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1
      );
    if (isRepoRoot) {
      sorted.unshift({
        id: `${path}#repo`,
        name: "Open as SRS repository",
        kind: "repository",
        path,
        revision: null,
      });
    }
    return sorted;
  }

  /** Open a `kind: "repository"` entry (a folder holding an SRS repo) as a tree-mode handle. */
  async openTree(entry: StorageEntry): Promise<DropboxTreeHandle> {
    await this.authenticate();
    if (entry.kind !== "repository" || entry.path === undefined) {
      throw new StorageFetchError("Dropbox did not return a usable repository path.");
    }
    const root = entry.path;
    const listed: DropboxMetadata[] = [];
    let response = await this.api<DropboxListResponse>("/files/list_folder", {
      path: root,
      recursive: true,
    });
    listed.push(...response.entries);
    while (response.has_more) {
      response = await this.api<DropboxListResponse>("/files/list_folder/continue", {
        cursor: response.cursor,
      });
      listed.push(...response.entries);
    }

    const prefix = root.toLowerCase();
    const wanted: { lower: string; relative: string; rev: string | null }[] = [];
    for (const item of listed) {
      if (item[".tag"] !== "file" || !item.path_lower || !item.path_display) continue;
      if (!item.path_lower.startsWith(`${prefix}/`)) continue;
      // path_display keeps the real case; path_lower only guides the prefix strip.
      const relative = item.path_display.slice(prefix.length + 1);
      if (
        relative
          .split("/")
          .slice(0, -1)
          .some((seg) => TREE_SKIP_DIRS.has(seg))
      )
        continue;
      wanted.push({ lower: item.path_lower, relative, rev: item.rev ?? null });
    }

    const base: Record<string, TreeBaseFile> = {};
    const results = await settleBounded(wanted, async (file) => {
      const download = await fetch(`${CONTENT}/files/download`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.requireToken()}`,
          "Dropbox-API-Arg": apiArg({ path: file.lower }),
        },
      });
      if (!download.ok) {
        throw new StorageFetchError(
          `Dropbox download of ${file.relative} failed: ${await parseError(download)}`
        );
      }
      base[file.relative] = {
        bytes: new Uint8Array(await download.arrayBuffer()),
        rev: file.rev,
      };
    });
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) throw failure.reason;

    assertRepoTree(Object.fromEntries(Object.entries(base).map(([p, f]) => [p, f.bytes])));
    const name = root.split("/").pop() || "Dropbox";
    return new DropboxTreeHandle(entry.id, name, root, base, () => this.requireToken());
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

  async create(name: string, content: string | Uint8Array): Promise<DocumentHandle> {
    await this.authenticate();
    const response = await fetch(`${CONTENT}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireToken()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `/${name}`,
          mode: "add",
          autorename: true,
          mute: false,
        }),
      },
      body: content as BodyInit,
    });
    if (!response.ok) {
      throw new StorageFetchError(`Dropbox create failed: ${await parseError(response)}`);
    }
    const metadata = (await response.json()) as DropboxMetadata;
    return new DropboxDocumentHandle(
      metadata.id,
      metadata.name,
      metadata.path_lower ?? `/${name}`,
      metadata.rev ?? null,
      () => this.requireToken()
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
