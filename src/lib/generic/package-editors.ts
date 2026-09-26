/**
 * Optional editor registrations.
 *
 * This is presentation capability wiring, not repository interpretation: the
 * Rust engine supplies installed packages/types; this registry decides which
 * Svelte shell may be offered for a known package contract.
 */
import type { PackageSummary, TypeSummary } from "$lib/srs-client.js";

export type PackageEditorId = "governance" | "guides";

export interface PackageEditor {
  id: PackageEditorId;
  label: string;
}

const EDITORS: Array<
  PackageEditor & { available: (packages: PackageSummary[], types: TypeSummary[]) => boolean }
> = [
  {
    id: "governance",
    label: "Governance",
    available: (packages) => packages.some((pkg) => pkg.namespace === "com.mudemocracy.governance"),
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
