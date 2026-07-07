/**
 * browser-cache.ts — working-copy persistence in localStorage.
 *
 * ADR-001: the `.srsj` string is treated as opaque here. Only `exportSrsj()`
 * (WASM) produces it and only `loadRepo()` (WASM) consumes it. TypeScript never
 * inspects the contents.
 */

const WORKING_COPY_KEY = "srs-web:working-copy";

/**
 * An in-browser snapshot of the current working copy.
 * `savedAt` is always ISO 8601 produced by `new Date().toISOString()`.
 */
export interface WorkingCopyEntry {
  name: string;
  srsj: string;
  savedAt: string;
}

/**
 * Persist the working copy to localStorage. Returns true on success, false on
 * any error (including QuotaExceededError). Non-fatal — autosave failure must
 * never interrupt the user's edit flow.
 */
export function saveWorkingCopy(name: string, srsj: string): boolean {
  try {
    const entry: WorkingCopyEntry = {
      name,
      srsj,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(WORKING_COPY_KEY, JSON.stringify(entry));
    return true;
  } catch (e: unknown) {
    console.warn("autosave failed:", e);
    return false;
  }
}

/**
 * Load the cached working copy from localStorage.
 * Returns null if absent, malformed, or if any required field fails validation.
 * Never throws.
 */
export function loadWorkingCopy(): WorkingCopyEntry | null {
  try {
    const raw = localStorage.getItem(WORKING_COPY_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    const entry = parsed as Record<string, unknown>;
    if (
      typeof entry.name !== "string" ||
      typeof entry.srsj !== "string" ||
      typeof entry.savedAt !== "string" ||
      Number.isNaN(new Date(entry.savedAt).getTime())
    ) {
      return null;
    }

    return { name: entry.name, srsj: entry.srsj, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

/**
 * Remove the cached working copy from localStorage.
 */
export function clearWorkingCopy(): void {
  localStorage.removeItem(WORKING_COPY_KEY);
}
