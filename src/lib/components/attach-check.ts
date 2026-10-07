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

const mimeOf = (f: AttachFile) =>
  f.type || BY_EXT[f.name.split(".").pop()?.toLowerCase() ?? ""] || "";

export function checkFiles(
  files: AttachFile[],
  policy: AttachPolicy | undefined,
  usedBytes: number
): { accepted: AttachFile[]; rejected: { name: string; reason: string }[] } {
  const accepted: AttachFile[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const maxFile = policy?.maxPerFileBytes ?? DEFAULT_MAX_FILE;
  let used = usedBytes;
  for (const f of files) {
    const mime = mimeOf(f);
    const typeOk = policy?.allowedMimeTypes
      ? policy.allowedMimeTypes.includes(mime)
      : mime.startsWith("text/") || DEFAULT_TEXT.includes(mime);
    let reason = "";
    if (!typeOk) reason = mime ? `not a text file (${mime})` : "unknown file type";
    else if (f.bytes.length > maxFile)
      reason = `${formatBytes(f.bytes.length)} is over the ${formatBytes(maxFile)} limit`;
    else if (policy?.maxTotalBytes !== undefined && used + f.bytes.length > policy.maxTotalBytes)
      reason = `would take the repository past ${formatBytes(policy.maxTotalBytes)}`;
    if (reason) rejected.push({ name: f.name, reason });
    else {
      accepted.push(f);
      used += f.bytes.length;
    }
  }
  return { accepted, rejected };
}

export async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
