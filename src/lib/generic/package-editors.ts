/**
 * Optional editor registrations.
 *
 * This is presentation capability wiring, not repository interpretation: the
 * Rust engine supplies installed packages/types; this registry decides which
 * Svelte shell may be offered for a known package contract.
 */
import { DECISION_LOG_TYPE_ID, DECISION_TYPE_ID } from "$lib/governance/type-registry.js";
import type { PackageSummary, TypeSummary } from "$lib/srs-client.js";

export type PackageEditorId = "governance" | "guides";

export interface PackageEditor {
  id: PackageEditorId;
  label: string;
}

// Availability is keyed on the engine-resolved type UUIDs the shell actually depends
// on — never on package namespace/name, which is a display label an author can set
// to anything and carries no identity guarantee (namespaces are labels; UUIDs are
// identity). Import the registry's own keys rather than copying the UUIDs so the two
// never drift.
const GOVERNANCE_TYPE_IDS = new Set([DECISION_TYPE_ID, DECISION_LOG_TYPE_ID]);

const EDITORS: Array<
  PackageEditor & { available: (packages: PackageSummary[], types: TypeSummary[]) => boolean }
> = [
  {
    id: "governance",
    label: "Governance",
    available: (_packages, types) => types.some((type) => GOVERNANCE_TYPE_IDS.has(type.id)),
  },
  {
    id: "guides",
    label: "Guides",
    available: (packages, types) =>
      packages.some((pkg) => pkg.namespace === "com.mudemocracy") &&
      types.some((type) => type.namespace === "com.mudemocracy" && type.name === "guide"),
  },
];

export function availablePackageEditors(
  packages: PackageSummary[],
  types: TypeSummary[]
): PackageEditor[] {
  return EDITORS.filter((editor) => editor.available(packages, types)).map(({ id, label }) => ({
    id,
    label,
  }));
}
