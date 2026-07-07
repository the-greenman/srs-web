import {
  StorageAuthenticationError,
  StorageCancelledError,
  StorageConfigurationError,
  StorageFetchError,
} from "./errors.js";
import {
  type GitContentsLocation,
  contentsHeaders,
  encodePath,
  readGitFile,
  writeGitFile,
} from "./git-contents.js";
import type { DocumentHandle, StorageEntry, StorageProvider, WriteResult } from "./types.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const TOKEN_ENDPOINT = "/api/oauth/github/token";
const OAUTH_STATE = "srs.github.oauth.state";
const OAUTH_VERIFIER = "srs.github.oauth.verifier";
const OAUTH_MESSAGE = "srs.github.oauth.complete";
// `repo` scope covers public + private governance repositories (owner decision 2026-07-07).
const GITHUB_SCOPE = "repo";

interface GitHubAuthMessage {
  type: typeof OAUTH_MESSAGE;
  state: string;
  accessToken?: string;
  expiresAt?: number;
  error?: string;
}

interface GitHubRepo {
  full_name: string;
  name: string;
  default_branch: string;
}

interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir" | string;
}

export interface GitHubConfig {
  clientId: string;
  redirectUri: string;
}

export interface GitHubOAuthCallback {
  code: string | null;
  state: string | null;
  error: string | null;
}

export function parseGitHubOAuthCallback(url: string): GitHubOAuthCallback {
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

async function parseApiError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: string; error_description?: string };
    return parsed.error_description ?? parsed.message ?? text;
  } catch {
    return text || response.statusText;
  }
}

/**
 * Runs in the OAuth popup. Exchanges the auth code for a token via the same-origin
 * Worker proxy (never GitHub's token endpoint directly — that needs the secret),
 * then posts the token back to the opener. Returns true iff it handled a callback.
 */
export async function completeGitHubOAuthCallback(config: GitHubConfig): Promise<boolean> {
  const { code, state, error: oauthError } = parseGitHubOAuthCallback(window.location.href);
  if ((!code && !oauthError) || !state || !window.opener) return false;

  const expectedState = sessionStorage.getItem(OAUTH_STATE);
  // Not our redirect (another provider opened this popup) — let the next handler try.
  if (expectedState === null) return false;
  const verifier = sessionStorage.getItem(OAUTH_VERIFIER);
  const message: GitHubAuthMessage = { type: OAUTH_MESSAGE, state };

  try {
    if (oauthError) throw new Error(oauthError);
    if (state !== expectedState || !verifier) throw new Error("GitHub OAuth state was invalid.");

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code ?? "",
        code_verifier: verifier,
        redirect_uri: config.redirectUri,
      }),
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const token = (await response.json()) as { access_token: string; expires_in?: number };
    message.accessToken = token.access_token;
    // GitHub OAuth-app tokens don't expire by default; only set expiry if given.
    if (token.expires_in) message.expiresAt = Date.now() + token.expires_in * 1000;
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

export class GitHubDocumentHandle implements DocumentHandle {
  readonly provider = "github" as const;
  readonly capabilities = { read: true, write: true } as const;
  private currentRevision: string | null;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly location: GitContentsLocation,
    revision: string | null,
    private readonly token: () => string
  ) {
    this.currentRevision = revision;
  }

  get revision(): string | null {
    return this.currentRevision;
  }

  async read(): Promise<string> {
    const file = await readGitFile(this.location, this.token());
    this.currentRevision = file.sha;
    return file.text;
  }

  async write(
    content: string,
    expectedRevision: string | null = this.currentRevision
  ): Promise<WriteResult> {
    const { sha } = await writeGitFile(this.location, this.token(), {
      message: `Update ${this.name} via srs-web`,
      content,
      sha: expectedRevision,
    });
    this.currentRevision = sha;
    return { revision: sha };
  }
}

export class GitHubProvider implements StorageProvider {
  readonly id = "github" as const;
  readonly label = "GitHub";
  readonly configured: boolean;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private readonly defaultBranches = new Map<string, string>();

  constructor(private readonly config: GitHubConfig) {
    this.configured = Boolean(config.clientId && config.redirectUri);
  }

  async authenticate(): Promise<void> {
    if (!this.configured) {
      throw new StorageConfigurationError("GitHub is not configured.");
    }
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;

    const state = randomUrlSafe();
    const verifier = randomUrlSafe(64);
    sessionStorage.setItem(OAUTH_STATE, state);
    sessionStorage.setItem(OAUTH_VERIFIER, verifier);
    const challenge = await challengeFor(verifier);
    const authUrl = new URL(GITHUB_AUTHORIZE);
    authUrl.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: GITHUB_SCOPE,
      state,
    }).toString();

    const popup = window.open(authUrl, "srs-github-oauth", "popup,width=640,height=720");
    if (!popup) throw new StorageAuthenticationError("GitHub sign-in popup was blocked.");

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new StorageCancelledError("GitHub sign-in was cancelled."));
        }
      }, 300);
      const onMessage = (event: MessageEvent<GitHubAuthMessage>) => {
        if (event.origin !== window.location.origin || event.data.type !== OAUTH_MESSAGE) return;
        if (event.data.state !== state) return;
        cleanup();
        if (event.data.error || !event.data.accessToken) {
          reject(new StorageAuthenticationError(event.data.error ?? "GitHub sign-in failed."));
          return;
        }
        this.accessToken = event.data.accessToken;
        // No expiry reported → treat as long-lived so we don't re-prompt each call.
        this.expiresAt = event.data.expiresAt ?? Number.POSITIVE_INFINITY;
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
    if (path === "") return this.listRepos();
    return this.listContents(path);
  }

  async open(entry: StorageEntry): Promise<DocumentHandle> {
    await this.authenticate();
    if (entry.kind !== "file" || !entry.path) {
      throw new StorageFetchError("GitHub did not return a usable file path.");
    }
    const { owner, repo, filePath } = splitRepoPath(entry.path);
    if (!filePath) throw new StorageFetchError("GitHub entry is missing a file path.");
    const branch = await this.branchFor(owner, repo);
    const location: GitContentsLocation = {
      apiBase: GITHUB_API,
      owner,
      repo,
      path: filePath,
      branch,
    };
    return new GitHubDocumentHandle(entry.id, entry.name, location, entry.revision ?? null, () =>
      this.requireToken()
    );
  }

  private async listRepos(): Promise<StorageEntry[]> {
    const repos = await this.api<GitHubRepo[]>(
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"
    );
    return repos
      .map((repo) => {
        this.defaultBranches.set(repo.full_name, repo.default_branch);
        return {
          id: repo.full_name,
          name: repo.full_name,
          kind: "folder" as const,
          path: repo.full_name,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async listContents(path: string): Promise<StorageEntry[]> {
    const { owner, repo, filePath } = splitRepoPath(path);
    const branch = await this.branchFor(owner, repo);
    const items = await this.api<GitHubContentItem[]>(
      `/repos/${owner}/${repo}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(branch)}`
    );
    return items
      .filter((item) => item.type === "dir" || /\.(srsj|json)$/i.test(item.name))
      .map((item) => ({
        id: `${owner}/${repo}/${item.path}`,
        name: item.name,
        kind: item.type === "dir" ? ("folder" as const) : ("file" as const),
        path: `${owner}/${repo}/${item.path}`,
        revision: item.type === "dir" ? null : item.sha,
      }))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1
      );
  }

  private async branchFor(owner: string, repo: string): Promise<string> {
    const key = `${owner}/${repo}`;
    const known = this.defaultBranches.get(key);
    if (known) return known;
    const info = await this.api<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    this.defaultBranches.set(key, info.default_branch);
    return info.default_branch;
  }

  private requireToken(): string {
    if (!this.accessToken) throw new StorageAuthenticationError("GitHub is not signed in.");
    return this.accessToken;
  }

  private async api<T>(route: string): Promise<T> {
    const response = await fetch(`${GITHUB_API}${route}`, {
      headers: contentsHeaders(this.requireToken()),
    });
    if (!response.ok) {
      throw new StorageFetchError(`GitHub request failed: ${await parseApiError(response)}`);
    }
    return response.json() as Promise<T>;
  }
}

/** Split "owner/repo[/dir/file]" into its parts; `filePath` is "" at a repo root. */
function splitRepoPath(path: string): { owner: string; repo: string; filePath: string } {
  const parts = path.split("/").filter((segment) => segment.length > 0);
  const [owner = "", repo = "", ...rest] = parts;
  return { owner, repo, filePath: rest.join("/") };
}
