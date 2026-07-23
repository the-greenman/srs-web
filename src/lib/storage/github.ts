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
import {
  type GitDataLocation,
  type TreeEntry,
  commitFiles,
  gitBlobSha,
  readBlobs,
  readBranchBase,
} from "./git-data.js";
import { MANIFEST_FILE, isSrsArchiveName, listingHasRepoMarker } from "./srs-detect.js";
import type {
  DocumentHandle,
  GitBranchAware,
  RepoTreeAware,
  StorageEntry,
  StorageProvider,
  WriteResult,
} from "./types.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const TOKEN_ENDPOINT = "/api/oauth/github/token";
// Named with provider prefix so a future Codeberg constant doesn't conflict (srs-web#254).
const GITHUB_REFRESH_ENDPOINT = "/api/oauth/github/refresh";
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
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
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
    const token = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
    };
    message.accessToken = token.access_token;
    // GitHub OAuth-app tokens don't expire by default; only set expiry if given.
    if (token.expires_in) message.expiresAt = Date.now() + token.expires_in * 1000;
    // Refresh token is present only when "Expire user authorization tokens" is on in the GitHub App.
    if (token.refresh_token) {
      message.refreshToken = token.refresh_token;
      message.refreshTokenExpiresAt = token.refresh_token_expires_in
        ? Date.now() + token.refresh_token_expires_in * 1000
        : Number.POSITIVE_INFINITY;
    }
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
  // Always "text" in practice today — listContents never surfaces .srs files — but
  // derived generically (not hardcoded) so it stays correct if that filter ever widens.
  readonly kind: "text" | "bytes";
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
    this.kind = isSrsArchiveName(name) ? "bytes" : "text";
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

/**
 * A whole exploded (multi-file) SRS repository, read/committed as a unit via the Git Data
 * API (ADR-016) instead of the single-file Contents API `GitHubDocumentHandle` uses.
 */
export class GitHubRepoTreeHandle implements DocumentHandle, GitBranchAware, RepoTreeAware {
  readonly provider = "github" as const;
  readonly kind = "tree" as const;
  readonly capabilities = { read: true, write: true } as const;
  private base: Awaited<ReturnType<typeof readBranchBase>> | null = null;
  // Mutable: committing to a new branch rebinds this handle onto that branch.
  private location: GitDataLocation;

  constructor(
    readonly id: string,
    readonly name: string,
    location: GitDataLocation,
    private readonly token: () => string
  ) {
    this.location = location;
  }

  get revision(): string | null {
    return this.base?.commitSha ?? null;
  }

  get branch(): string {
    return this.location.branch;
  }

  get repoLabel(): string {
    return `${this.location.owner}/${this.location.repo}`;
  }

  /** Read every file under this handle's directory into memory, retaining the base state
   * so a subsequent commitTree() can diff against it. */
  async readTree(): Promise<Record<string, Uint8Array>> {
    const base = await readBranchBase(this.location, this.token());
    this.base = base;
    const shas = Object.values(base.entries).map((entry) => entry.sha);
    const blobs = await readBlobs(this.location, this.token(), shas);
    const files: Record<string, Uint8Array> = {};
    for (const [path, entry] of Object.entries(base.entries)) {
      const bytes = blobs.get(entry.sha);
      if (bytes) files[path] = bytes;
    }
    return files;
  }

  /**
   * Commit the changed subset of `files` (diffed against the retained base by git blob
   * SHA) as one commit. Mirrors saveToBranch's 3-scenario branch handling (same-branch /
   * new-branch-from-current / existing-target-branch).
   */
  async commitTree(
    files: Record<string, Uint8Array>,
    opts: { branch: string; createFromCurrent?: boolean; message?: string }
  ): Promise<WriteResult> {
    if (!this.base) {
      throw new StorageFetchError("Cannot commit a tree that has not been read yet.");
    }
    const target = opts.branch.trim();
    const switching = target !== this.location.branch;
    const targetLocation: GitDataLocation = { ...this.location, branch: target };

    let base = this.base;
    if (switching) {
      const created = opts.createFromCurrent
        ? await createBranch(this.location, this.token(), target, this.location.branch)
        : false;
      // A freshly created branch starts identical to the source — the retained base
      // still applies. An existing target branch may have diverged — re-read it.
      if (!created) {
        base = await readBranchBase(targetLocation, this.token());
      }
    }

    const changed: Record<string, Uint8Array | null> = {};
    const newShas = new Map<string, string>();
    for (const [path, bytes] of Object.entries(files)) {
      const baseEntry = base.entries[path];
      const newSha = await gitBlobSha(bytes);
      if (!baseEntry || baseEntry.sha !== newSha) {
        changed[path] = bytes;
        newShas.set(path, newSha);
      }
    }
    for (const path of Object.keys(base.entries)) {
      if (!(path in files)) changed[path] = null;
    }

    // .srs/.gitkeep: only on an actual commit, and only when .srs/ is entirely absent
    // from both the new and the base state (never added purely to create the marker).
    if (Object.keys(changed).length > 0) {
      const hasSrsDir =
        Object.keys(changed).some((path) => path.startsWith(".srs/")) ||
        Object.keys(base.entries).some((path) => path.startsWith(".srs/"));
      if (!hasSrsDir) {
        const gitkeep = new Uint8Array(0);
        changed[".srs/.gitkeep"] = gitkeep;
        newShas.set(".srs/.gitkeep", await gitBlobSha(gitkeep));
      }
    }

    const result = await commitFiles(targetLocation, this.token(), {
      baseCommitSha: base.commitSha,
      baseRootTreeSha: base.rootTreeSha,
      baseSubtreeSha: base.subtreeSha,
      baseEntries: base.entries,
      files: changed,
      message: opts.message?.trim() || `Update ${this.name} via srs-web`,
    });

    this.location = targetLocation;
    if (!result) {
      // Empty diff — nothing committed; the current revision is unchanged.
      this.base = base;
      return { revision: base.commitSha };
    }

    const newEntries: Record<string, TreeEntry> = { ...base.entries };
    for (const [path, value] of Object.entries(changed)) {
      if (value === null) {
        delete newEntries[path];
      } else {
        const sha = newShas.get(path);
        if (sha) newEntries[path] = { mode: base.entries[path]?.mode ?? "100644", sha };
      }
    }
    this.base = {
      commitSha: result.commitSha,
      rootTreeSha: result.rootTreeSha,
      subtreeSha: result.subtreeSha,
      entries: newEntries,
    };
    return { revision: result.commitSha };
  }

  // Present only so isGitBranchAware()'s duck-type check finds it and GitSaveModal opens
  // for tree handles — App.svelte's kind-based branch calls commitTree() directly, never this.
  saveToBranch(): Promise<WriteResult> {
    throw new StorageFetchError("Tree-mode documents commit via commitTree(), not saveToBranch().");
  }

  read(): Promise<string> {
    throw new StorageFetchError("Tree-mode documents are read via readTree(), not read().");
  }

  write(): Promise<WriteResult> {
    throw new StorageFetchError("Tree-mode documents are committed via commitTree(), not write().");
  }
}

export class GitHubProvider implements StorageProvider {
  readonly id = "github" as const;
  readonly label = "GitHub";
  readonly configured: boolean;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshToken: string | null = null;
  // Zero means "not set" — refreshSilently() guards on null refreshToken first.
  private refreshTokenExpiresAt = 0;
  private readonly defaultBranches = new Map<string, string>();

  constructor(private readonly config: GitHubConfig) {
    this.configured = Boolean(config.clientId && config.redirectUri);
  }

  async authenticate(): Promise<void> {
    if (!this.configured) {
      throw new StorageConfigurationError("GitHub is not configured.");
    }
    // Token still valid — nothing to do.
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;

    // Near-expiry (or expired) and we had a token: try silent refresh before popup.
    if (this.accessToken) {
      if (await this.refreshSilently()) return;
    }

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
        // Capture refresh credentials when the GitHub App has token expiry enabled (ADR-017).
        this.refreshToken = event.data.refreshToken ?? null;
        this.refreshTokenExpiresAt = event.data.refreshTokenExpiresAt ?? Number.POSITIVE_INFINITY;
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

  /**
   * Attempt a silent token refresh using the stored refresh token. Returns true
   * on success (accessToken updated). Returns false without throwing when the
   * refresh token is absent, expired, or the endpoint returns a non-ok response
   * (caller should fall back to the popup). Network-level errors (TypeError) do
   * not clear the refresh token — the token may still be valid; only a definitive
   * HTTP error from the endpoint clears it.
   */
  private async refreshSilently(): Promise<boolean> {
    if (!this.refreshToken || Date.now() >= this.refreshTokenExpiresAt) return false;

    let response: Response;
    try {
      response = await fetch(GITHUB_REFRESH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
    } catch {
      // Network failure — the refresh token is still valid; don't clear it.
      return false;
    }

    if (!response.ok) {
      // Definitive endpoint rejection — refresh token is invalid or revoked.
      this.refreshToken = null;
      return false;
    }

    let token: {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
    };
    try {
      token = await response.json();
    } catch {
      this.refreshToken = null;
      return false;
    }

    if (!token.access_token) {
      this.refreshToken = null;
      return false;
    }

    this.accessToken = token.access_token;
    this.expiresAt = token.expires_in
      ? Date.now() + token.expires_in * 1000
      : Number.POSITIVE_INFINITY;
    // GitHub rotates the refresh token on each use; fall back to the current one if absent.
    this.refreshToken = token.refresh_token ?? this.refreshToken;
    this.refreshTokenExpiresAt = token.refresh_token_expires_in
      ? Date.now() + token.refresh_token_expires_in * 1000
      : Number.POSITIVE_INFINITY;
    return true;
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

  /** Open a `kind: "repository"` entry (the synthetic "Open as SRS repository" entry) as a
   * tree-mode handle. Does not eagerly read — that happens once loadDocument() calls
   * readTree(), consistent with open() not eagerly reading file content either. */
  async openTree(entry: StorageEntry): Promise<GitHubRepoTreeHandle> {
    await this.authenticate();
    if (entry.kind !== "repository" || !entry.path) {
      throw new StorageFetchError("GitHub did not return a usable repository path.");
    }
    const { owner, repo, branch, dir } = parseGitHubPath(entry.path);
    if (!branch) throw new StorageFetchError("GitHub entry is missing a branch.");
    const location: GitDataLocation = { apiBase: GITHUB_API, owner, repo, branch, dir };
    return new GitHubRepoTreeHandle(entry.id, entry.name, location, () => this.requireToken());
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
    // A directory carrying a repo marker (`.srs/` dir or manifest.json — ADR-018) is an
    // exploded SRS repository root — surface a synthetic "Open as SRS repository" entry
    // for it. The marker check runs on the raw pre-exclusion view: manifest.json is then
    // excluded from the returned entries (opening it alone via the single-file path is
    // never valid — it isn't a .srsj payload). Extension filtering is presentation and
    // lives in the picker UI, so the complete listing is returned.
    const rawEntries: StorageEntry[] = items.map((item) => ({
      id: `${owner}/${repo}:${branch}:${item.path}`,
      name: item.name,
      kind: item.type === "dir" ? ("folder" as const) : ("file" as const),
      path: `${owner}/${repo}:${branch}:${item.path}`,
      revision: item.type === "dir" ? null : item.sha,
    }));
    const isRepoRoot = listingHasRepoMarker(rawEntries);
    const entries = rawEntries
      .filter((entry) => !(entry.kind === "file" && entry.name === MANIFEST_FILE))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1
      );
    if (isRepoRoot) {
      entries.unshift({
        id: `${owner}/${repo}:${branch}:${dir}#repo`,
        name: "Open as SRS repository",
        kind: "repository",
        path: `${owner}/${repo}:${branch}:${dir}`,
        revision: null,
      });
    }
    return entries;
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
