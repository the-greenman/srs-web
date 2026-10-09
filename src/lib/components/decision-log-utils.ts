/**
 * decision-log-utils.ts — pure helper functions for DecisionLogView.
 *
 * Extracted so that the WASM-find integration and sort logic can be unit-tested
 * without mounting a Svelte component.
 */

import type { ResolvedAttachment, SrsRecord, SrsRepository } from "$lib/srs-client.js";
import { find, resolveAttachments } from "$lib/srs-client.js";

/**
 * Call WASM `find` and return the set of matching instance IDs.
 * Returns null when the query is empty or `repo` is absent (meaning "no active search").
 * ADR-001: passes only `contentMatch` — no governance field names.
 */
export function computeSearchHitIds(
  repo: SrsRepository | undefined,
  searchQuery: string
): Set<string> | null {
  const q = searchQuery.trim();
  if (!repo || q === "") return null;
  const result = find(repo, { contentMatch: q });
  return new Set(result.hits.map((h) => h.instanceId));
}

/**
 * Call WASM `find` with a tag filter and return the set of matching instance IDs.
 * Returns null when topicFilter is "all" (no filter active) or `repo` is absent.
 * ADR-001: delegates tag matching to the WASM engine, not TypeScript.
 */
export function computeTagHitIds(
  repo: SrsRepository | undefined,
  topicFilter: string
): Set<string> | null {
  if (!repo || topicFilter === "all") return null;
  const result = find(repo, { tag: [topicFilter] });
  return new Set(result.hits.map((h) => h.instanceId));
}

/**
 * Call WASM `find` with an exclude-lifecycle filter and return the set of
 * instance IDs of records whose lifecycle state is NOT in `excludedStates`.
 * Returns null when `repo` is absent or `excludedStates` is empty — meaning
 * "no lifecycle filter active; show all".
 * Note: `find` returns repo-wide results across all record types; callers are
 * responsible for scoping to the relevant type via the outer filter on `records`.
 * ADR-001: delegates lifecycle filtering to the WASM engine, not TypeScript.
 * ADR-022: governance status is SRS lifecycle state; `excludeLifecycleStates`
 * is the correct predicate (not a field-value predicate).
 */
export function computeLifecycleVisibleIds(
  repo: SrsRepository | undefined,
  excludedStates: string[]
): Set<string> | null {
  if (!repo || excludedStates.length === 0) return null;
  const result = find(repo, { excludeLifecycleStates: excludedStates });
  return new Set(result.hits.map((h) => h.instanceId));
}

/**
 * Sort `SrsRecord[]` by `createdAt` ISO 8601 string.
 * ISO 8601 strings are lexicographically ordered — string comparison is correct and avoids
 * locale-sensitive collation from Date parsing.
 */
export function sortByCreatedAt(records: SrsRecord[], order: "newest" | "oldest"): SrsRecord[] {
  return [...records].sort((a, b) => {
    const dateA = a.createdAt ?? "";
    const dateB = b.createdAt ?? "";
    if (order === "newest") return dateB < dateA ? -1 : dateB > dateA ? 1 : 0;
    return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
  });
}

/**
 * Resolve the attachments of every given instance in ONE WASM call (batch, not per-record).
 * Returns a map instanceId → attachments (empty arrays omitted). A failed resolve yields an
 * empty map: attachment chips are decoration and must never break the log.
 * ADR-001: pure pass-through to `resolve_composition_attachments`.
 */
export function computeAttachmentsByInstance(
  repo: SrsRepository | undefined,
  instanceIds: string[]
): Map<string, ResolvedAttachment[]> {
  const out = new Map<string, ResolvedAttachment[]>();
  if (!repo || instanceIds.length === 0) return out;
  try {
    for (const r of resolveAttachments(repo, instanceIds).records) {
      if (r.attachments.length > 0) out.set(r.instanceId, r.attachments);
    }
  } catch {
    return new Map();
  }
  return out;
}
