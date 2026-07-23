/**
 * SRS relevance detection for storage listings — the single source of truth for
 * "does this name / listing look like SRS content" across every picker surface.
 *
 * Detection is presentation-layer discovery only (ADR-018): pure name matching,
 * never content inspection. Full validation happens in the engine on open — a
 * false positive here costs one failed open with a diagnostic, nothing more.
 */
import type { StorageEntry } from "./types.js";

/** The spec's repository-root marker directory (`ext:repository`). */
export const SRS_MARKER_DIR = ".srs";

/** The exploded-repo manifest file (ADR-016's original detection marker). */
export const MANIFEST_FILE = "manifest.json";

/** `*.srs` — an SRSzip binary archive. */
export function isSrsArchiveName(name: string): boolean {
  return /\.srs$/i.test(name);
}

/** `*.srsj` (or legacy `*.json`) — a JSON document payload. */
export function isSrsDocumentName(name: string): boolean {
  return /\.(srsj|json)$/i.test(name);
}

/** Any file name the app can open from a picker. */
export function isOpenableName(name: string): boolean {
  return isSrsArchiveName(name) || isSrsDocumentName(name);
}

/**
 * High-signal discovery-scan targets: `.srs`/`.srsj` only. Bare `.json` stays
 * openable when the user points at it, but is far too noisy to surface from a
 * subfolder scan.
 */
export function isScanTargetName(name: string): boolean {
  return /\.(srs|srsj)$/i.test(name);
}

/** Strip a recognised SRS extension from a display name. */
export function stripSrsExtension(name: string): string {
  return name.replace(/\.(srsj|json|srs)$/i, "");
}

/**
 * The `.srs` archive name for a document — the ADR-015 auto-upgrade rename
 * (`gov.srsj` → `gov.srs`). Always ends in `.srs`, even for extensionless input.
 */
export function toArchiveName(name: string): string {
  return `${stripSrsExtension(name)}.srs`;
}

/**
 * Does a folder's listing identify that folder as an SRS repository root?
 * Either marker counts: the spec's `.srs/` directory or an ADR-016
 * `manifest.json` (ADR-018 amends ADR-016's manifest-only rule).
 */
export function listingHasRepoMarker(entries: StorageEntry[]): boolean {
  return entries.some(
    (entry) =>
      (entry.kind === "folder" && entry.name === SRS_MARKER_DIR) ||
      (entry.kind === "file" && entry.name === MANIFEST_FILE)
  );
}

/** Folders a discovery scan never descends into. */
export const SCAN_SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  SRS_MARKER_DIR,
  "node_modules",
  ".svelte-kit",
  ".next",
  ".cache",
  "dist",
  "build",
  "target",
  "vendor",
]);
