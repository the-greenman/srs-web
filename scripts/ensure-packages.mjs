#!/usr/bin/env node
// Ensure the pinned package bundles (packages.lock.json) are present at
// src/lib/packages/<packageId>.srspkg (plus <packageId>@<version>.srspkg for each `history`
// entry), verified by sha256. An `onInstall` entry is not built into the app: it goes only to
// public/packages. Then it writes the ext:registry catalog of every entry, and serves every
// current bundle from public/packages (srs-web#712, ADR-031).
//
// A missing bundle is downloaded. A present one is re-verified; a mismatch
// there is expected after packages.lock.json is bumped (the cached bundle
// predates the new pin), so it triggers a re-download rather than failing
// outright — matching the .pin refresh behaviour of ensure-bindings (#459).
// Only a mismatch that survives a fresh download is fatal. Override the
// target directory with PACKAGES_DIR, the served directory with PACKAGES_PUBLIC_DIR and the lock
// file with PACKAGES_LOCK (tests).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.PACKAGES_DIR ?? join(root, "src", "lib", "packages");
const publicDir = process.env.PACKAGES_PUBLIC_DIR ?? join(root, "public", "packages");
const lockPath = process.env.PACKAGES_LOCK ?? join(root, "packages.lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const servedName = (e) => `${e.name}-${e.version}.srspkg`;
const currentFile = (e) =>
  e.onInstall ? join(publicDir, servedName(e)) : join(dir, `${e.packageId}.srspkg`);

mkdirSync(dir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
// Each entry is the current bundle (`<packageId>.srspkg`) plus its `history` of earlier published
// bundles (`<packageId>@<version>.srspkg`). The editor passes those to the engine as upgrade proof
// (srs-web#450); it ships them because github.com release downloads send no CORS header.
const wanted = lock.flatMap((e) => [
  { ...e, path: currentFile(e) },
  ...(e.history ?? []).map((h) => ({ ...h, packageId: e.packageId, name: e.name, path: join(dir, `${e.packageId}@${h.version}.srspkg`) })),
]);
for (const { name, version, url, sha256: expected, path: file } of wanted) {
  const download = async () => {
    console.log(`Downloading ${name} ${version} from ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      console.error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
      process.exit(1);
    }
    return Buffer.from(await res.arrayBuffer());
  };

  let bytes = existsSync(file) ? readFileSync(file) : await download();
  let actual = sha256(bytes);
  if (actual !== expected && existsSync(file)) {
    console.log(`cached ${name} ${version} is stale (sha256 mismatch) — re-downloading`);
    bytes = await download();
    actual = sha256(bytes);
  }
  if (actual !== expected) {
    console.error(`sha256 mismatch for ${name} ${version}: expected ${expected}, got ${actual}.`);
    process.exit(1);
  }
  writeFileSync(file, bytes);
}

// The catalog is generated, never edited: each entry's facts are read from the verified bundle.
const count = (a) => (Array.isArray(a) ? a.length : 0);
const entries = lock.map((e) => {
  const text = readFileSync(currentFile(e), "utf8");
  if (!e.onInstall) writeFileSync(join(publicDir, servedName(e)), text);
  const b = JSON.parse(text);
  return {
    kind: "package",
    packageId: e.packageId,
    packageName: e.name,
    packageVersion: e.version,
    publisher: "semanticops.com",
    ...(e.description ? { description: e.description } : {}),
    publishedAt: b.publishedAt ?? "",
    fieldCount: count(b.fields),
    typeCount: count(b.types),
    viewCount: count(b.views),
    relationTypeCount: count(b.relationTypes),
    locator: { mode: "remote", url: `/packages/${servedName(e)}` },
    checksum: e.sha256,
  };
});
const catalog = `${JSON.stringify(
  {
    registryRevision: 1, // RFC-049: kinded entries, `locator` in place of `downloadUrl`
    schemaVersion: "1.0",
    registryId: "6f1f7c52-4f0e-4c55-9d6a-7b6a1b0e7121",
    registryName: "SemanticOps packages",
    catalogVersion: "1.0.0",
    updatedAt: entries.map((e) => e.publishedAt).sort().at(-1) ?? "",
    entries,
  },
  null,
  2
)}\n`;
writeFileSync(join(dir, "catalog.json"), catalog); // the app reads this one, so its list matches its build
writeFileSync(join(publicDir, "index.json"), catalog);
console.log(`package bundles ready at ${dir}, served from ${publicDir}`);
