/**
 * sections.ts — governance section discovery helpers.
 *
 * ADR-006: sections derive from loaded records + KNOWN_TYPE_CONFIG (display hints).
 * The 3 known gallery types always appear (even in empty repos) because KNOWN_TYPE_CONFIG
 * seeds them. Unknown types surface automatically when records of that type exist.
 *
 * Supersedes ADR-005 (which used a static SECTIONS array keyed by human-readable strings).
 *
 * B4 governance viewer: https://github.com/the-greenman/srs-web/issues/3
 * srs-web#54 dynamic sections + view dispatch
 */

import type { SrsRecord } from "../srs-client.js";

export interface SectionConfig {
  key: string;
  label: string;
  typeNamespace: string;
  typeName: string;
  icon: string;
  typeId: string;
  typeVersion: number;
}

export type SectionKey = string;

const KNOWN_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; typeVersion: number; typeName: string; typeNamespace: string }
> = {
  "a1142ac3-5385-5c0e-8630-1dd3432cdf7f": {
    label: "Articles",
    icon: "§",
    typeVersion: 1,
    typeName: "article",
    typeNamespace: "governance",
  },
  "1fcad6a2-9f78-5e41-94ba-d82e88b822f3": {
    label: "Decision Log",
    icon: "⊕",
    typeVersion: 1,
    typeName: "decision",
    typeNamespace: "governance",
  },
  "e53dce11-6b83-5714-a8fe-f730edb500fa": {
    label: "Roles",
    icon: "◈",
    typeVersion: 1,
    typeName: "role",
    typeNamespace: "governance",
  },
};

function labelFromTypeName(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

/**
 * Derive the sidebar section list from loaded records and KNOWN_TYPE_CONFIG.
 *
 * KNOWN_TYPE_CONFIG entries always appear first (stable order), even in an empty repo.
 * Any type found in `records` whose typeId is not in KNOWN_TYPE_CONFIG is appended
 * with auto-derived label and default icon — no TS change required for new types.
 */
export function buildDynamicSections(records: SrsRecord[]): SectionConfig[] {
  const result: SectionConfig[] = Object.entries(KNOWN_TYPE_CONFIG).map(([typeId, cfg]) => ({
    key: typeId,
    label: cfg.label,
    icon: cfg.icon,
    typeNamespace: cfg.typeNamespace,
    typeName: cfg.typeName,
    typeId,
    typeVersion: cfg.typeVersion,
  }));
  const seen = new Set(result.map((s) => s.typeId));
  for (const r of records) {
    if (!r.typeId || seen.has(r.typeId)) continue;
    seen.add(r.typeId);
    result.push({
      key: r.typeId,
      label: labelFromTypeName(r.typeName ?? r.typeId),
      icon: "◻",
      typeNamespace: r.typeNamespace ?? "",
      typeName: r.typeName ?? "",
      typeId: r.typeId,
      typeVersion: r.typeVersion,
    });
  }
  return result;
}
