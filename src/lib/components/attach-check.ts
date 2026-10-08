/** Client-side checks for files offered to AttachDrop (#503). Pure; no SRS semantics (ADR-001). */
import { formatBytes } from "../format-bytes.js";

/** Mirrors RFC-017 attachment_policy (repo_settings); real values arrive through srs-rust#638. */
export interface AttachPolicy {
  allowedMimeTypes?: string[];
  maxPerFileBytes?: number;
  maxTotalBytes?: number;
}
export interface AttachFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

// ponytail: client defaults only until srs-rust#638 gives the policy; the core policy is authoritative.
const DEFAULT_TEXT = [
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/csv",
];
const DEFAULT_MAX_FILE = 1_048_576;
// ponytail: interim 5 MB total budget for a repository held in the browser (owner ruling); the policy binding (srs-rust#638) replaces it.
export const DEFAULT_MAX_TOTAL = 5 * 1_048_576;
const BY_EXT: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  xml: "application/xml",
  html: "text/html",
  srt: "text/plain",
  vtt: "text/plain",
};

/** For the input's `accept` attribute. */
export const ACCEPT = `text/*,${DEFAULT_TEXT.join(",")},${Object.keys(BY_EXT)
  .map((e) => `.${e}`)
  .join(",")}`;

export interface FileMeta {
  name: string;
  type: string;
  size: number;
}

const mimeOf = (f: FileMeta) =>
  f.type || BY_EXT[f.name.split(".").pop()?.toLowerCase() ?? ""] || "";

export function checkFiles<T extends FileMeta>(
  files: T[],
  policy: AttachPolicy | undefined,
  usedBytes: number
): { accepted: T[]; rejected: { name: string; reason: string }[] } {
  const accepted: T[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const maxFile = policy?.maxPerFileBytes ?? DEFAULT_MAX_FILE;
  const maxTotal = policy?.maxTotalBytes ?? DEFAULT_MAX_TOTAL;
  let used = usedBytes;
  for (const f of files) {
    const mime = mimeOf(f);
    const typeOk = policy?.allowedMimeTypes
      ? policy.allowedMimeTypes.includes(mime)
      : mime.startsWith("text/") || DEFAULT_TEXT.includes(mime);
    let reason = "";
    if (mime === "application/pdf") reason = "PDF: paste the paper's text or add its URL";
    else if (!typeOk) reason = mime ? `not a text file (${mime})` : "unknown file type";
    else if (f.size > maxFile)
      reason = `${formatBytes(f.size)} is over the ${formatBytes(maxFile)} limit`;
    else if (used + f.size > maxTotal)
      reason = `would take the repository past ${formatBytes(maxTotal)}`;
    if (reason) rejected.push({ name: f.name, reason });
    else {
      accepted.push(f);
      used += f.size;
    }
  }
  return { accepted, rejected };
}

/**
 * The http(s) URLs in pasted or dropped text (a bare URL, or a `text/uri-list`: one per line, `#` comments
 * ignored); null when there is none or any other line is not a URL (then it is ordinary text).
 */
export function asUrls(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const ok = (l: string) => {
    try {
      return /^https?:$/.test(new URL(l).protocol);
    } catch {
      return false;
    }
  };
  return lines.length && lines.every(ok) ? lines : null;
}

export async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** The one read path for offered files: check them, then read the accepted ones. */
export async function takeFiles(
  files: File[],
  policy: AttachPolicy | undefined,
  usedBytes: number
): Promise<{ accepted: AttachFile[]; rejected: { name: string; reason: string }[] }> {
  const { accepted, rejected } = checkFiles(files, policy, usedBytes);
  return {
    accepted: await Promise.all(
      accepted.map(async (f) => ({ name: f.name, type: f.type, bytes: await readFile(f) }))
    ),
    rejected,
  };
}
