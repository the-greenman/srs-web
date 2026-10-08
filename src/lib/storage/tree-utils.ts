/** Helpers shared by every provider that reads an exploded SRS repository as a tree. */
import { StorageError } from "./errors.js";
import { MANIFEST_FILE, SRS_MARKER_DIR } from "./srs-detect.js";

/**
 * Directories never read into a repository tree. Deliberately *not*
 * `SCAN_SKIP_DIRS`: that set is for discovery and excludes `.srs/`, which is
 * part of the repository and must ride along. ADR-016's pass-through guarantee
 * means everything else — README, CI config — is copied verbatim too, so it
 * reappears unchanged in `export_tree`.
 */
export const TREE_SKIP_DIRS: ReadonlySet<string> = new Set([".git", "node_modules"]);

/** Does a read tree look like an SRS repository root? Mirrors `listingHasRepoMarker`. */
export function treeHasRepoMarker(files: Record<string, Uint8Array>): boolean {
  return Object.keys(files).some(
    (path) => path === MANIFEST_FILE || path.startsWith(`${SRS_MARKER_DIR}/`)
  );
}

export function assertRepoTree(files: Record<string, Uint8Array>): void {
  if (!treeHasRepoMarker(files)) {
    throw new StorageError(
      "unsupported",
      `That folder is not an SRS repository — no ${MANIFEST_FILE} and no ${SRS_MARKER_DIR}/ directory.`
    );
  }
}

export function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}
