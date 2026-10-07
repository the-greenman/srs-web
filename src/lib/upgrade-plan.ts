/**
 * Presentation helpers for a package-upgrade plan (srs-web#450). The core planned it and classified
 * every conflict (ADR-001); these only decide what the dialog offers for each kind.
 */
import type { UpgradeConflict, UpgradePackageResult } from "./srs-client.js";

/** Only an unproven definition (no reference copy, no earlier bundle proves it) can be replaced with consent. */
export const isAdoptable = (c: UpgradeConflict): boolean => c.conflictKind === "no-reference-copy";

/** The adopt ids to send per package: the checked, adoptable conflicts of each plan. */
export function adoptByPackage(
  plans: UpgradePackageResult[],
  checked: string[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of plans) {
    const ids = p.conflicts
      .filter((c) => isAdoptable(c) && checked.includes(c.id))
      .map((c) => c.id);
    if (ids.length) out[p.packageId] = ids;
  }
  return out;
}

/** Why a conflict that cannot be adopted is kept (no em dashes in UI strings). */
export const keptReason = (c: UpgradeConflict): string =>
  c.conflictKind === "local-edit"
    ? "changed in this document, so your version is kept"
    : "another definition here uses the same key, so it is kept";
