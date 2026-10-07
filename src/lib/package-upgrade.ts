/**
 * Which bundled packages are installed in the open repository, and which of those are older than the
 * bundle (srs-web#450). The core decides: version comparison is `check_package_requirements` asked
 * for the bundled version, never a comparison here (ADR-001). A package that is not installed is not
 * listed (installing is the editor Install path); one in another compatibility band is not offered.
 */
import { PINNED } from "./packages/bundles.js";
import {
  REQUIREMENT_VERSION_TOO_LOW,
  type SrsRepository,
  checkPackageRequirements,
} from "./srs-client.js";

export interface InstalledPackage {
  packageId: string;
  name: string;
  /** The bundled (pinned) version. */
  bundled: string;
  /** Installed version(s), as the core reports them. */
  installed: string;
  /** The installed package is older than the bundle (the core says `version-too-low`). */
  outdated: boolean;
}

export function installedPackages(
  repo: SrsRepository,
  pinned: { packageId: string; name: string; version: string }[] = PINNED
): InstalledPackage[] {
  if (pinned.length === 0) return [];
  // namespace is a display label to the core (RFC-044), so the pin's name stands in for it
  const outcomes = checkPackageRequirements(
    repo,
    pinned.map((p) => ({ packageId: p.packageId, namespace: "", name: p.name, version: p.version }))
  );
  const out: InstalledPackage[] = [];
  pinned.forEach((p, i) => {
    const o = outcomes[i];
    const outdated = o?.reason === REQUIREMENT_VERSION_TOO_LOW;
    if (!o || !(o.satisfied || outdated)) return;
    const installed = (o.candidateVersions ?? []).filter((v): v is string => !!v).join(", ");
    out.push({
      packageId: p.packageId,
      name: p.name,
      bundled: p.version,
      installed: installed || "unknown",
      outdated,
    });
  });
  return out;
}

export const outdatedPackages = (repo: SrsRepository): InstalledPackage[] =>
  installedPackages(repo).filter((p) => p.outdated);

/** The pinned notice text for outdated packages ("essay 1.7.0 is available (installed 1.5.0)."). */
export const upgradeNoticeText = (outdated: InstalledPackage[]): string =>
  outdated.map((p) => `${p.name} ${p.bundled} is available (installed ${p.installed}).`).join(" ");
