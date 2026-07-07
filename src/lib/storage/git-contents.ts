/**
 * Shared read/write/conflict logic for git hosts that expose the GitHub-style
 * Contents API (GitHub now; Forgejo/Codeberg later reuse this unchanged).
 *
 * The revision is the file's **git blob SHA**. A stale-SHA write is rejected by
 * the host (409/422) and surfaces as StorageConflictError instead of clobbering.
 */
import { StorageConflictError, StorageFetchError } from "./errors.js";

export interface GitContentsLocation {
  /** API base, e.g. https://api.github.com (GitHub) or https://codeberg.org/api/v1 (Forgejo). */
  apiBase: string;
  owner: string;
  repo: string;
  /** File path within the repo, e.g. "governance/repo.srsj". */
  path: string;
  branch: string;
}

export interface GitFileContent {
  text: string;
  sha: string;
}

/** UTF-8-safe base64 encode (GitHub Contents API stores base64). */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** UTF-8-safe base64 decode; tolerates the newlines GitHub inserts into `content`. */
export function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Auth + content-negotiation headers accepted by both GitHub and Forgejo. */
export function contentsHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message ?? text;
  } catch {
    return text || response.statusText;
  }
}

/** Read a single file; returns its decoded text and current blob SHA. */
export async function readGitFile(
  location: GitContentsLocation,
  token: string
): Promise<GitFileContent> {
  const url =
    `${location.apiBase}/repos/${location.owner}/${location.repo}` +
    `/contents/${encodePath(location.path)}?ref=${encodeURIComponent(location.branch)}`;
  const response = await fetch(url, { headers: contentsHeaders(token) });
  if (!response.ok) {
    throw new StorageFetchError(`Git file read failed: ${await parseError(response)}`);
  }
  const data = (await response.json()) as { content?: string; encoding?: string; sha?: string };
  if (data.encoding !== "base64" || data.content == null || !data.sha) {
    throw new StorageFetchError("Git host did not return a base64 file with a SHA.");
  }
  return { text: decodeBase64(data.content), sha: data.sha };
}

/**
 * Create or update a file. Pass `sha` to update an existing file (concurrent-edit
 * safe); pass `null` to create a new one. A stale `sha` → StorageConflictError.
 */
export async function writeGitFile(
  location: GitContentsLocation,
  token: string,
  params: { message: string; content: string; sha: string | null }
): Promise<{ sha: string }> {
  const url =
    `${location.apiBase}/repos/${location.owner}/${location.repo}` +
    `/contents/${encodePath(location.path)}`;
  const body: Record<string, unknown> = {
    message: params.message,
    content: encodeBase64(params.content),
    branch: location.branch,
  };
  if (params.sha) body.sha = params.sha;

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...contentsHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 409 Conflict / 422 Unprocessable Entity == the blob SHA moved under us.
  if (response.status === 409 || response.status === 422) throw new StorageConflictError();
  if (!response.ok) {
    throw new StorageFetchError(`Git file write failed: ${await parseError(response)}`);
  }
  const data = (await response.json()) as { content?: { sha?: string } };
  const sha = data.content?.sha;
  if (!sha) throw new StorageFetchError("Git host did not return the new blob SHA after write.");
  return { sha };
}
