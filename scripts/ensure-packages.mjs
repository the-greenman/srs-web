#!/usr/bin/env node
// Ensure the pinned package bundles (packages.lock.json) are present at
// src/lib/packages/<packageId>.srspkg (plus <packageId>@<version>.srspkg for each `history`
// entry), verified by sha256.
//
// A missing bundle is downloaded. A present one is re-verified; a mismatch
// there is expected after packages.lock.json is bumped (the cached bundle
// predates the new pin), so it triggers a re-download rather than failing
// outright — matching the .pin refresh behaviour of ensure-bindings (#459).
// Only a mismatch that survives a fresh download is fatal. Override the
// target directory with PACKAGES_DIR and the lock file with PACKAGES_LOCK
// (tests).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.PACKAGES_DIR ?? join(root, "src", "lib", "packages");
const lockPath = process.env.PACKAGES_LOCK ?? join(root, "packages.lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

mkdirSync(dir, { recursive: true });
// Each entry is the current bundle (`<packageId>.srspkg`) plus its `history` of earlier published
// bundles (`<packageId>@<version>.srspkg`). The editor passes those to the engine as upgrade proof
// (srs-web#450); it ships them because github.com release downloads send no CORS header.
const wanted = lock.flatMap((e) => [
  e,
  ...(e.history ?? []).map((h) => ({ ...h, packageId: e.packageId, name: e.name, file: `${e.packageId}@${h.version}.srspkg` })),
]);
for (const { packageId, name, version, url, sha256: expected, file: fileName } of wanted) {
  const file = join(dir, fileName ?? `${packageId}.srspkg`);

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
console.log(`package bundles ready at ${dir}`);
