/**
 * Bounded discovery scan for SRS content (ADR-018): a budgeted BFS over the
 * provider-agnostic `list()` seam. Providers with a cheaper bulk primitive
 * implement `StorageProvider.scanForSrs` natively (GitHub: one recursive-tree
 * request); everyone else gets this generic scanner.
 *
 * Discovery only — name/marker matching over listings, never content reads.
 */
import {
  AUTO_MAX_LIST_REQUESTS,
  AUTO_MAX_ROOT_ENTRIES,
  EXPLICIT_MAX_LIST_REQUESTS,
  SCAN_ENTRIES_PER_BUDGET_UNIT,
  SCAN_MAX_DEPTH,
  SCAN_MAX_RESULTS,
} from "./scan-config.js";
import { SCAN_SKIP_DIRS, isScanTargetName, listingHasRepoMarker } from "./srs-detect.js";
import type { StorageEntry, StorageProvider } from "./types.js";

export type ScanMode = "auto" | "explicit";

export interface ScanOutcome {
  status: "complete" | "partial" | "skipped";
  /** Discovered files (`kind:"file"`) and repositories (`kind:"repository"`),
   * with the scan-relative path as the display `name`. */
  entries: StorageEntry[];
  foldersListed: number;
  reason?: "too-large" | "budget-exhausted" | "truncated";
}

/** Listing cost in budget units — big (internally paginated) folders drain the budget. */
function listingCost(entryCount: number): number {
  return 1 + Math.floor(entryCount / SCAN_ENTRIES_PER_BUDGET_UNIT);
}

interface QueueItem {
  listing: StorageEntry[];
  /** Scan-relative display prefix ("" at the root, "sub/nested/" below). */
  prefix: string;
  /** Depth of the folder this listing belongs to (root = 0). */
  depth: number;
  /** The folder entry this listing came from; undefined for the scan root. */
  folder?: StorageEntry;
}

/**
 * Budget-bounded BFS from `path`. Results come from subfolders only (depth ≥ 1)
 * — the root's own files are already on screen. A subfolder whose listing has a
 * repo marker becomes a `kind:"repository"` result when the provider can open
 * trees; either way the scan does not descend into it (or into SCAN_SKIP_DIRS).
 */
export async function genericScanForSrs(
  provider: Pick<StorageProvider, "list" | "openTree">,
  path: string,
  mode: ScanMode,
  seed?: StorageEntry[]
): Promise<ScanOutcome> {
  const list = provider.list?.bind(provider);
  if (!list) return { status: "skipped", entries: [], foldersListed: 0 };

  let budget = mode === "auto" ? AUTO_MAX_LIST_REQUESTS : EXPLICIT_MAX_LIST_REQUESTS;
  let foldersListed = 0;
  const root = seed ?? (await list(path));
  if (seed === undefined) {
    foldersListed += 1;
    budget -= listingCost(root.length);
  }
  if (mode === "auto" && root.length > AUTO_MAX_ROOT_ENTRIES) {
    return { status: "skipped", entries: [], foldersListed, reason: "too-large" };
  }

  const results: StorageEntry[] = [];
  const queue: QueueItem[] = [{ listing: root, prefix: "", depth: 0 }];
  let exhausted = false;

  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const { listing, prefix, depth, folder } = queue.shift()!;

    if (depth > 0 && folder) {
      if (listingHasRepoMarker(listing)) {
        // The folder itself is the result; never collect from or descend into a repo.
        if (provider.openTree) {
          results.push({
            id: `${folder.id}#scan-repo`,
            name: prefix.replace(/\/$/, ""),
            kind: "repository",
            path: folder.path,
          });
        }
        continue;
      }
      for (const entry of listing) {
        if (entry.kind === "file" && isScanTargetName(entry.name)) {
          results.push({ ...entry, name: `${prefix}${entry.name}` });
        }
      }
    }
    if (results.length >= SCAN_MAX_RESULTS) {
      exhausted = true;
      break;
    }
    if (depth >= SCAN_MAX_DEPTH) continue;

    for (const entry of listing) {
      if (entry.kind !== "folder" || SCAN_SKIP_DIRS.has(entry.name)) continue;
      if (budget <= 0) {
        exhausted = true;
        break;
      }
      const sub = await list(entry.path ?? "");
      foldersListed += 1;
      budget -= listingCost(sub.length);
      queue.push({
        listing: sub,
        prefix: `${prefix}${entry.name}/`,
        depth: depth + 1,
        folder: entry,
      });
    }
  }

  return {
    status: exhausted ? "partial" : "complete",
    entries: results.slice(0, SCAN_MAX_RESULTS),
    foldersListed,
    reason: exhausted ? "budget-exhausted" : undefined,
  };
}
