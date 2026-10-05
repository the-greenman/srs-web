#!/usr/bin/env node
// Ensure the pinned package bundles (packages.lock.json) are present at
// src/lib/packages/<packageId>.srspkg, verified by sha256.
//
// A missing bundle is downloaded; a present one is re-verified, so a stale or
// tampered local copy fails the build instead of being installed. Override the
// target directory with PACKAGES_DIR (tests).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.PACKAGES_DIR ?? join(root, "src", "lib", "packages");
const lock = JSON.parse(readFileSync(join(root, "packages.lock.json"), "utf8"));

mkdirSync(dir, { recursive: true });
for (const { packageId, name, version, url, sha256 } of lock) {
  const file = join(dir, `${packageId}.srspkg`);
  let bytes;
  if (existsSync(file)) {
    bytes = readFileSync(file);
  } else {
    console.log(`Downloading ${name} ${version} from ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      console.error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
      process.exit(1);
    }
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) {
    console.error(
      `sha256 mismatch for ${name} ${version}: expected ${sha256}, got ${actual}. If packages.lock.json was just bumped, delete ${file} to re-download.`
    );
    process.exit(1);
  }
  if (!existsSync(file)) writeFileSync(file, bytes);
}
console.log(`package bundles ready at ${dir}`);
