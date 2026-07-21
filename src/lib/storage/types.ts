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

export interface OpenDocument {
  handle: DocumentHandle;
  text: string;
}

export interface StorageEntry {
  id: string;
  name: string;
  kind: "file" | "folder";
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
}
