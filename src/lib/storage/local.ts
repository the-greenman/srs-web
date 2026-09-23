import { StorageError } from "./errors.js";
import { MANIFEST_FILE, SRS_MARKER_DIR, isSrsArchiveName } from "./srs-detect.js";
import type { DocumentCapabilities, DocumentHandle, RepoTreeAware, WriteResult } from "./types.js";

export class LocalDocumentHandle implements DocumentHandle {
  readonly provider = "local" as const;
  readonly id: string;
  readonly name: string;
  readonly revision = null;
  readonly capabilities = { read: true, write: false } as const;
  readonly kind: "text" | "bytes";
  readonly readOnlyReason =
    "Local files opened from this device are read-only. Use Export to save your changes.";

  constructor(private readonly file: File) {
    this.id = `${file.name}:${file.size}:${file.lastModified}`;
    this.name = file.name;
    this.kind = isSrsArchiveName(file.name) ? "bytes" : "text";
  }

  read(): Promise<string> {
    return this.file.text();
  }

  async readBytes(): Promise<Uint8Array> {
    const buf = await this.file.arrayBuffer();
    return new Uint8Array(buf);
  }

  write(_content: string, _expectedRevision?: string | null): Promise<WriteResult> {
    return Promise.reject(
      new StorageError("unsupported", "Local browser files cannot be overwritten directly.")
    );
  }
}

export function downloadDocument(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadArchive(bytes: Uint8Array, filename: string): void {
  const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([slice as ArrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Defer revocation so the browser's download dispatcher can fetch the blob
  // before it is released (click() is synchronous; download is not).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// On-device exploded repositories (srs-web#248)
// ---------------------------------------------------------------------------

declare global {
  /** Not in lib.dom yet, though every engine that ships the API implements it. */
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
  interface Window {
    showDirectoryPicker?(options?: {
      mode?: "read" | "readwrite";
    }): Promise<FileSystemDirectoryHandle>;
  }
}

/**
 * Directories never read into a repository tree. Deliberately *not*
 * `SCAN_SKIP_DIRS`: that set is for discovery and excludes `.srs/`, which is
 * part of the repository and must ride along. ADR-016's pass-through guarantee
 * means everything else — README, CI config — is copied verbatim too, so it
 * reappears unchanged in `export_tree`.
 */
const TREE_SKIP_DIRS: ReadonlySet<string> = new Set([".git", "node_modules"]);

/** Does a read tree look like an SRS repository root? Mirrors `listingHasRepoMarker`. */
function treeHasRepoMarker(files: Record<string, Uint8Array>): boolean {
  return Object.keys(files).some(
    (path) => path === MANIFEST_FILE || path.startsWith(`${SRS_MARKER_DIR}/`)
  );
}

function assertRepoTree(files: Record<string, Uint8Array>): void {
  if (!treeHasRepoMarker(files)) {
    throw new StorageError(
      "unsupported",
      `That folder is not an SRS repository — no ${MANIFEST_FILE} and no ${SRS_MARKER_DIR}/ directory.`
    );
  }
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

/** Walk `dir` into a repo-relative path -> bytes map. */
async function readDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Record<string, Uint8Array>
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") {
      if (TREE_SKIP_DIRS.has(name)) continue;
      await readDirectory(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, out);
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      out[`${prefix}${name}`] = new Uint8Array(await file.arrayBuffer());
    }
  }
}

/** Resolve the directory holding `path`'s last segment, creating it when asked. */
async function parentOf(
  dir: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  let current = dir;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

/**
 * A whole exploded SRS repository on the local device (srs-web#248), read as a
 * unit like the GitHub tree handle. Writable only when opened through
 * `pickLocalDirectory()` — the `webkitdirectory` fallback has no write side.
 *
 * There is no revision concept on disk, so this handle cannot detect that the
 * folder changed underneath it; a save overwrites what is there.
 */
export class LocalTreeHandle implements DocumentHandle, RepoTreeAware {
  readonly provider = "local" as const;
  readonly kind = "tree" as const;
  readonly revision = null;
  readonly capabilities: DocumentCapabilities;
  readonly readOnlyReason?: string;

  constructor(
    readonly id: string,
    readonly name: string,
    /** The tree as last read or written — the base `commitTree()` diffs against. */
    private base: Record<string, Uint8Array>,
    private readonly dir?: FileSystemDirectoryHandle
  ) {
    this.capabilities = { read: true, write: dir !== undefined };
    this.readOnlyReason =
      dir === undefined
        ? "This folder was opened read-only — your browser doesn't support saving back to a local folder. Use Export to save your changes."
        : undefined;
  }

  readTree(): Promise<Record<string, Uint8Array>> {
    // A copy, not the base itself: the caller owns and mutates the tree it gets
    // back, and commitTree() has to diff against what was actually on disk.
    return Promise.resolve({ ...this.base });
  }

  /** Write back only the paths whose bytes changed, and remove the ones that went away. */
  async commitTree(files: Record<string, Uint8Array>): Promise<WriteResult> {
    const dir = this.dir;
    if (!dir) {
      throw new StorageError(
        "unsupported",
        "This folder was opened read-only. Use Export to save your changes."
      );
    }
    for (const [path, bytes] of Object.entries(files)) {
      if (sameBytes(this.base[path], bytes)) continue;
      const segments = path.split("/");
      // biome-ignore lint/style/noNonNullAssertion: split always yields >= 1 segment
      const name = segments.pop()!;
      const parent = await parentOf(dir, segments, true);
      const file = await parent.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      // Re-slice for the same reason downloadArchive does: the stream's chunk type
      // insists on ArrayBuffer, and a Uint8Array's buffer is only ArrayBufferLike.
      await writable.write(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      );
      await writable.close();
    }
    for (const path of Object.keys(this.base)) {
      if (path in files) continue;
      const segments = path.split("/");
      // biome-ignore lint/style/noNonNullAssertion: split always yields >= 1 segment
      const name = segments.pop()!;
      const parent = await parentOf(dir, segments, false);
      await parent.removeEntry(name);
    }
    // Rebase so a second save diffs against what is now on disk.
    this.base = files;
    return { revision: null };
  }

  read(): Promise<string> {
    return Promise.reject(
      new StorageError("unsupported", "Tree-mode documents are read via readTree(), not read().")
    );
  }

  write(): Promise<WriteResult> {
    return Promise.reject(
      new StorageError(
        "unsupported",
        "Tree-mode documents are committed via commitTree(), not write()."
      )
    );
  }
}

/** Is the File System Access directory picker available in this browser? */
export function canPickLocalDirectory(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/**
 * Prompt for a directory and read it as an exploded repository (read + write).
 * Resolves `null` when the user dismisses the picker.
 */
export async function pickLocalDirectory(): Promise<LocalTreeHandle | null> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    throw new StorageError("unsupported", "This browser cannot open a folder from your device.");
  }
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await picker.call(window, { mode: "readwrite" });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
  const files: Record<string, Uint8Array> = {};
  await readDirectory(dir, "", files);
  assertRepoTree(files);
  return new LocalTreeHandle(`local-dir:${dir.name}`, dir.name, files, dir);
}

/**
 * Read a `<input type="file" webkitdirectory>` selection as an exploded
 * repository. Read-only — the fallback for browsers without the File System
 * Access API; changes come back out through Export.
 */
export async function treeFromDirectoryInput(
  selection: FileList | File[]
): Promise<LocalTreeHandle> {
  const all = Array.from(selection);
  if (all.length === 0) {
    throw new StorageError("unsupported", "That folder is empty.");
  }
  // webkitRelativePath is "<picked-dir>/rest/of/path"; the repo tree is the rest.
  const root = all[0].webkitRelativePath.split("/")[0];
  if (root === "") {
    throw new StorageError("unsupported", "That selection is not a folder.");
  }
  const files: Record<string, Uint8Array> = {};
  for (const file of all) {
    const segments = file.webkitRelativePath.split("/").slice(1);
    if (segments.length === 0) continue;
    if (segments.slice(0, -1).some((segment) => TREE_SKIP_DIRS.has(segment))) continue;
    files[segments.join("/")] = new Uint8Array(await file.arrayBuffer());
  }
  assertRepoTree(files);
  return new LocalTreeHandle(`local-dir:${root}`, root, files);
}
