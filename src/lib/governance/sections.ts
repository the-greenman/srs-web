/**
 * sections.ts — governance section discovery helpers (ADR-006).
 *
 * NOTE: buildDynamicSections() is no longer used by GovernanceShell.svelte as of ADR-009
 * (srs-web#93). The sidebar is now container-driven (listContainers()). This module is
 * retained for unit-test backward-compatibility only.
 */

import type { SrsRecord } from "../srs-client.js";
import { TYPE_REGISTRY } from "./type-registry.js";

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

function labelFromTypeName(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

/**
 * Derive the sidebar section list from loaded records and TYPE_REGISTRY.
 *
 * TYPE_REGISTRY entries always appear first (stable order), even in an empty repo.
 * Any type found in `records` whose typeId is not in TYPE_REGISTRY is appended
 * with auto-derived label and default icon — no TS change required for new types.
 */
export function buildDynamicSections(records: SrsRecord[]): SectionConfig[] {
  const result: SectionConfig[] = Object.entries(TYPE_REGISTRY).map(([typeId, cfg]) => ({
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
