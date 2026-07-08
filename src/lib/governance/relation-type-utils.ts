/**
 * relation-type-utils.ts — pure helpers for deriving installed relation types
 * from an exported srsj payload.
 *
 * INTERIM FIX — srs-rust#411: replace `parseRelationTypesFromSrsj` with a
 * direct `listRelationTypes(repo)` WASM call when the binding is available.
 * This interim is an approved ADR-001 exception recorded in docs/adr/001-thin-client.md.
 *
 * srs-web#160: https://github.com/the-greenman/srs-web/issues/160
 */

import type { RelationTypeOption } from "$lib/types.js";

/**
 * Parses installed relation types from a raw srsj export object.
 *
 * Reads `data["package/package.json"].relationTypes` (array of relative paths)
 * and resolves each path relative to the package directory entry in `data`.
 * Each resolved entry must have a `key` field; `label` falls back to `key`.
 *
 * Returns an empty array if the package entry is missing, `relationTypes` is
 * absent or empty, or an error occurs during parsing.
 */
export function parseRelationTypesFromSrsj(raw: Record<string, unknown>): RelationTypeOption[] {
  try {
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const pkgKey = Object.keys(data).find((k) => k === "package/package.json");
    if (!pkgKey) return [];
    const pkg = data[pkgKey] as Record<string, unknown>;
    const rtPaths = (pkg.relationTypes as string[] | undefined) ?? [];
    if (rtPaths.length === 0) return [];
    const pkgDir = pkgKey.slice(0, pkgKey.lastIndexOf("/") + 1);
    return rtPaths
      .map((p) => data[pkgDir + p] as Record<string, unknown> | undefined)
      .filter((rt): rt is Record<string, unknown> => Boolean(rt?.key))
      .map((rt) => ({
        value: rt.key as string,
        label: (rt.label as string | undefined) ?? (rt.key as string),
      }));
  } catch {
    return [];
  }
}
