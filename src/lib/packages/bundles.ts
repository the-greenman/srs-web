/**
 * The pinned `.srspkg` bundles srs-web can install (packages.lock.json, fetched and
 * sha256-verified by scripts/ensure-packages.mjs). Keyed by packageId; the file name is the id.
 */
const BUNDLES = import.meta.glob("./*.srspkg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function bundledPackage(packageId: string): string | undefined {
  return BUNDLES[`./${packageId}.srspkg`];
}
