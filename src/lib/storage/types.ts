import type { ScanMode, ScanOutcome } from "./srs-scan.js";

export type StorageProviderId = "local" | "dropbox" | "google-drive" | "github";

export interface DocumentCapabilities {
  read: boolean;
  write: boolean;
}

export interface WriteResult {
  revision: string | null;
}

export interface DocumentHandle {
  readonly provider: StorageProviderId;
  readonly id: string;
  readonly name: string;
  readonly capabilities: DocumentCapabilities;
  readonly revision: string | null;
  /**
   * How this document's content is shaped, replacing `.srs`-suffix name-sniffing as the
   * load/save dispatch key (ADR-016). "text" — a `.srsj` JSON string via read()/write().
   * "bytes" — a `.srs` binary archive via readBytes()/writeBytes(). "tree" — an exploded
   * multi-file SRS repository via RepoTreeAware's readTree()/commitTree(); read()/write()
   * are not meaningful on a "tree" handle.
   */
  readonly kind: "text" | "bytes" | "tree";
  read(): Promise<string>;
  write(content: string, expectedRevision?: string | null): Promise<WriteResult>;
  /** Read the document as raw bytes. Available on all cloud handles; used for .srs archives. */
  readBytes?(): Promise<Uint8Array>;
  /** Write raw bytes to the document. Available on all cloud handles; used for .srs archives. */
  writeBytes?(bytes: Uint8Array, expectedRevision?: string | null): Promise<WriteResult>;
}

/**
 * A DocumentHandle backed by a git host, which can commit to a chosen branch
 * (optionally creating it). Lets the Save flow offer "commit here vs new branch".
 */
export interface GitBranchAware {
  /** The branch the handle currently targets. */
  readonly branch: string;
  /** "owner/repo", for display. */
  readonly repoLabel: string;
  saveToBranch(
    content: string,
    opts: { branch: string; createFromCurrent?: boolean; message?: string }
  ): Promise<WriteResult>;
}

/**
 * A DocumentHandle (`kind: "tree"`) backed by a whole exploded (multi-file) SRS repository,
 * read/committed as a unit rather than one file at a time (ADR-016).
 */
export interface RepoTreeAware {
  readTree(): Promise<Record<string, Uint8Array>>;
  commitTree(
    files: Record<string, Uint8Array>,
    opts: { branch: string; createFromCurrent?: boolean; message?: string }
  ): Promise<WriteResult>;
}

export interface OpenDocument {
  handle: DocumentHandle;
  text: string;
}

export interface StorageEntry {
  id: string;
  name: string;
  kind: "file" | "folder" | "repository";
  path?: string;
  revision?: string | null;
}

export interface StorageProvider {
  readonly id: Exclude<StorageProviderId, "local">;
  readonly label: string;
  readonly configured: boolean;
  authenticate(): Promise<void>;
  select?(): Promise<DocumentHandle>;
  list?(path?: string): Promise<StorageEntry[]>;
  open(entry: StorageEntry): Promise<DocumentHandle>;
  /** Create a brand-new document with the given name and content, returning a
   * writable handle. Optional — absent on providers that cannot create files.
   * Accepts either a string (for .srsj JSON) or Uint8Array bytes (for .srs archives). */
  create?(name: string, content: string | Uint8Array): Promise<DocumentHandle>;
  /** Open a `kind: "repository"` entry as a tree-mode handle. Optional — only providers
   * that support exploded-repo mode (currently GitHub) implement this. */
  openTree?(entry: StorageEntry): Promise<DocumentHandle & RepoTreeAware>;
  /** Bounded discovery scan for SRS content below `path` (ADR-018). Optional —
   * providers with a cheaper bulk primitive implement it natively (GitHub: one
   * recursive-tree request); callers fall back to `genericScanForSrs` over
   * `list()` when absent. `seed` is the already-fetched listing of `path`, so
   * the root is not re-listed. */
  scanForSrs?(path: string, mode: ScanMode, seed?: StorageEntry[]): Promise<ScanOutcome>;
}
