/**
 * The pinned `.srspkg` bundles srs-web can install (packages.lock.json, fetched and
 * sha256-verified by scripts/ensure-packages.mjs). Keyed by packageId; the file name is the id.
 */
import lock from "../../../packages.lock.json";

/** The pinned packages (name and version from packages.lock.json): what the editor can install or upgrade to. */
export const PINNED: { packageId: string; name: string; version: string }[] = lock;

const BUNDLES = import.meta.glob("./*.srspkg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function bundledPackage(packageId: string): string | undefined {
  return BUNDLES[`./${packageId}.srspkg`];
}

/** The earlier published bundles of a package (the lock's `history`): version and bundle JSON text. */
export function priorBundleEntries(packageId: string): { version: string; text: string }[] {
  const prefix = `./${packageId}@`;
  return Object.keys(BUNDLES)
    .filter((k) => k.startsWith(prefix))
    .sort()
    .map((k) => ({ version: k.slice(prefix.length, -".srspkg".length), text: BUNDLES[k] }));
}
