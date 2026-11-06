/**
 * The published packages an open document can install (srs-web#712, ADR-031). The list is the
 * ext:registry catalog scripts/ensure-packages.mjs generates from packages.lock.json; the core parses
 * it and decides what is satisfied. Bundles come from this site's origin, checked against the catalog's
 * sha256, and only when the writer starts an install.
 */
import {
  REQUIREMENT_MISSING,
  type SrsRepository,
  bundleRequirements,
  checkPackageRequirements,
  installBundles,
  parseRegistry,
} from "../srs-client.js";
import CATALOG from "./catalog.json?raw";

export interface CatalogEntry {
  packageId: string;
  packageName: string;
  packageVersion: string;
  description?: string;
  fieldCount: number;
  typeCount: number;
  downloadUrl: string;
  checksum: string;
}

export interface PackageInstallPlan {
  packageId: string;
  /** What will be installed, dependencies first, the asked-for package last. */
  packages: CatalogEntry[];
  /** Requirements no install can meet, such as an older version already here. Non-empty blocks the install. */
  unmet: string[];
  bundles: Map<string, string>;
}

export const catalogEntries = (): CatalogEntry[] =>
  parseRegistry(CATALOG).entries as CatalogEntry[];

/** The published packages with no installed candidate at all; the core decides. */
export function availablePackages(
  repo: SrsRepository,
  entries: CatalogEntry[] = catalogEntries()
): CatalogEntry[] {
  const outcomes = checkPackageRequirements(
    repo,
    entries.map((e) => ({
      packageId: e.packageId,
      namespace: "",
      name: e.packageName,
      version: e.packageVersion,
    }))
  );
  return entries.filter((_, i) => outcomes[i]?.reason === REQUIREMENT_MISSING);
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

/** A served bundle's text. A checksum that doesn't match refuses it, so nothing is installed. */
export async function fetchBundle(entry: CatalogEntry): Promise<string> {
  const res = await fetch(entry.downloadUrl);
  if (!res.ok) throw new Error(`${entry.packageName}: download failed (${res.status})`);
  const bytes = await res.arrayBuffer();
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== entry.checksum)
    throw new Error(`${entry.packageName}: the download doesn't match its published checksum`);
  return new TextDecoder().decode(bytes);
}

/** Fetch the package and whatever missing dependencies the core reports. Writes nothing. */
export async function planInstall(
  repo: SrsRepository,
  packageId: string,
  o: {
    entries?: CatalogEntry[];
    fetchText?: (entry: CatalogEntry) => Promise<string>;
  } = {}
): Promise<PackageInstallPlan> {
  const entries = o.entries ?? catalogEntries();
  const fetchText = o.fetchText ?? fetchBundle;
  const bundles = new Map<string, string>();
  const packages: CatalogEntry[] = [];
  const unmet: string[] = [];
  const visit = async (id: string): Promise<void> => {
    if (bundles.has(id)) return;
    const entry = entries.find((e) => e.packageId === id);
    if (!entry) throw new Error(`${id} is not a published package`);
    const text = await fetchText(entry);
    bundles.set(id, text);
    for (const r of bundleRequirements(repo, text)) {
      if (r.satisfied) continue;
      if (r.reason === REQUIREMENT_MISSING && entries.some((e) => e.packageId === r.packageId))
        await visit(r.packageId as string);
      else unmet.push(`${r.name} ${r.version}`);
    }
    packages.push(entry);
  };
  await visit(packageId);
  return { packageId, packages, unmet, bundles };
}

/** The core re-checks each requirement as it installs, and refuses what isn't met. */
export const applyInstall = (repo: SrsRepository, plan: PackageInstallPlan) =>
  installBundles(repo, [plan.packageId], (id) => plan.bundles.get(id));
