import {
  StorageAuthenticationError,
  StorageCancelledError,
  StorageConfigurationError,
  StorageFetchError,
} from "./errors.js";
import {
  type GitContentsLocation,
  contentsHeaders,
  createBranch,
  encodePath,
  readGitFile,
  readGitFileSha,
  writeGitFile,
} from "./git-contents.js";
import type {
  DocumentHandle,
  GitBranchAware,
  StorageEntry,
  StorageProvider,
  WriteResult,
} from "./types.js";

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

interface GitHubBranch {
  name: string;
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

export class GitHubDocumentHandle implements DocumentHandle, GitBranchAware {
  readonly provider = "github" as const;
  readonly capabilities = { read: true, write: true } as const;
  private currentRevision: string | null;
  // Mutable: saving to a new branch rebinds this handle onto that branch.
  private location: GitContentsLocation;

  constructor(
    readonly id: string,
    readonly name: string,
    location: GitContentsLocation,
    revision: string | null,
    private readonly token: () => string
  ) {
    this.location = location;
    this.currentRevision = revision;
  }

  get revision(): string | null {
    return this.currentRevision;
  }

  get branch(): string {
    return this.location.branch;
  }

  get repoLabel(): string {
    return `${this.location.owner}/${this.location.repo}`;
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

  /**
   * Save to `branch`. When `createFromCurrent` is set and the target differs from
   * the current branch, the branch is created from the current head first, then
   * the handle rebinds onto it (subsequent saves target the new branch).
   */
  async saveToBranch(
    content: string,
    opts: { branch: string; createFromCurrent?: boolean; message?: string }
  ): Promise<WriteResult> {
    const target = opts.branch.trim();
    const switching = target !== this.location.branch;
    const targetLocation: GitContentsLocation = { ...this.location, branch: target };

    // The expected SHA must be the file's SHA *on the target branch*. It equals
    // the current revision only when the branch is freshly created from here; an
    // existing target branch may have diverged, so read its actual SHA (null if
    // the file/branch is absent → a create).
    let expectedSha = this.currentRevision;
    if (switching) {
      const created = opts.createFromCurrent
        ? await createBranch(this.location, this.token(), target, this.location.branch)
        : false;
      if (!created) {
        expectedSha = await readGitFileSha(targetLocation, this.token());
      }
    }

    const { sha } = await writeGitFile(targetLocation, this.token(), {
      message: opts.message?.trim() || `Update ${this.name} via srs-web`,
      content,
      sha: expectedSha,
    });
    this.location = targetLocation;
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

  // Browse path grammar (":" is illegal in git branch names, so it's unambiguous):
  //   ""                        → repositories
  //   "owner/repo"              → branches of that repo
  //   "owner/repo:branch"       → that branch's root
  //   "owner/repo:branch:dir"   → a directory on that branch
  async list(path = ""): Promise<StorageEntry[]> {
    await this.authenticate();
    if (path === "") return this.listRepos();
    const { owner, repo, branch } = parseGitHubPath(path);
    if (!branch) return this.listBranches(owner, repo);
    return this.listContents(path);
  }

  async open(entry: StorageEntry): Promise<DocumentHandle> {
    await this.authenticate();
    if (entry.kind !== "file" || !entry.path) {
      throw new StorageFetchError("GitHub did not return a usable file path.");
    }
    const { owner, repo, branch, dir } = parseGitHubPath(entry.path);
    if (!branch || !dir) throw new StorageFetchError("GitHub entry is missing a branch or path.");
    const location: GitContentsLocation = {
      apiBase: GITHUB_API,
      owner,
      repo,
      path: dir,
      branch,
    };
    return new GitHubDocumentHandle(entry.id, entry.name, location, entry.revision ?? null, () =>
      this.requireToken()
    );
  }

  private async listRepos(): Promise<StorageEntry[]> {
    // visibility=all requests private repos too; whether they actually come back
    // depends on the GitHub App's install scope + Contents/Metadata permission.
    // Paginate so accounts with >100 repos aren't silently truncated (bounded to
    // keep a pathological account from hammering the API).
    const repos: GitHubRepo[] = [];
    const perPage = 100;
    for (let page = 1; page <= 20; page++) {
      const batch = await this.api<GitHubRepo[]>(
        `/user/repos?per_page=${perPage}&page=${page}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`
      );
      repos.push(...batch);
      if (batch.length < perPage) break;
    }
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

  /** Branches of a repo, as navigable folders; the default branch sorts first. */
  private async listBranches(owner: string, repo: string): Promise<StorageEntry[]> {
    const branches: GitHubBranch[] = [];
    const perPage = 100;
    for (let page = 1; page <= 20; page++) {
      const batch = await this.api<GitHubBranch[]>(
        `/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`
      );
      branches.push(...batch);
      if (batch.length < perPage) break;
    }
    const defaultBranch = this.defaultBranches.get(`${owner}/${repo}`) ?? "";
    return branches
      .map((branch) => ({
        id: `${owner}/${repo}:${branch.name}`,
        name: branch.name,
        kind: "folder" as const,
        path: `${owner}/${repo}:${branch.name}`,
      }))
      .sort((a, b) => {
        if (a.name === defaultBranch) return -1;
        if (b.name === defaultBranch) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  private async listContents(path: string): Promise<StorageEntry[]> {
    const { owner, repo, branch, dir } = parseGitHubPath(path);
    const items = await this.api<GitHubContentItem[]>(
      `/repos/${owner}/${repo}/contents/${encodePath(dir)}?ref=${encodeURIComponent(branch)}`
    );
    return items
      .filter((item) => item.type === "dir" || /\.(srsj|json)$/i.test(item.name))
      .map((item) => ({
        id: `${owner}/${repo}:${branch}:${item.path}`,
        name: item.name,
        kind: item.type === "dir" ? ("folder" as const) : ("file" as const),
        path: `${owner}/${repo}:${branch}:${item.path}`,
        revision: item.type === "dir" ? null : item.sha,
      }))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1
      );
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

/**
 * Parse a GitHub browse path: "owner/repo", "owner/repo:branch", or
 * "owner/repo:branch:dir/sub". `branch`/`dir` are "" when not yet selected.
 * Git branch names cannot contain ":", so the first ":" always delimits the
 * branch; any later ":" is kept as part of `dir` (rare, but path-legal).
 */
function parseGitHubPath(path: string): {
  owner: string;
  repo: string;
  branch: string;
  dir: string;
} {
  const [repoPart = "", branch = "", ...dirParts] = path.split(":");
  const [owner = "", repo = ""] = repoPart.split("/").filter((segment) => segment.length > 0);
  return { owner, repo, branch, dir: dirParts.join(":") };
}
