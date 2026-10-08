#!/usr/bin/env node
// Ensure the WASM bindings built from srs-rust are present at src/lib/srs_bindings/.
//
// The bindings are gitignored (build output, not source), so a fresh clone —
// e.g. a Cloudflare Workers automated build — doesn't have them. This script
// downloads the release artifact from the public srs-rust repo when the
// bindings are missing or were downloaded for a different pin (a `.pin` marker
// records the URL + sha256 of the build on disk, so bumping the pin refreshes
// every checkout — srs-web#459). Pass --force to re-download regardless.
//
// No auth and no gh CLI required: srs-rust is public, so the artifact is a
// plain HTTPS download. The tarball is verified against a pinned sha256 (SHA256 below) before
// anything is extracted or touched, so a bad download (or --force) never clobbers working bindings.
//
// Local override: SRS_BINDINGS_URL replaces the source and then REQUIRES SRS_BINDINGS_SHA256 to
// verify against. If it is absent a loud warning is printed and verification is skipped — a local
// override is a deliberate developer action.
//
// Bumping the pin: change DEFAULT_URL and SHA256 together (README, "WASM bindings").

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL =
  "https://github.com/the-greenman/srs-rust/releases/download/v0.1.0-build.502/srs-bindings-web.tar.gz";
// sha256 of the tarball at DEFAULT_URL (the release's srs-bindings-web.tar.gz.sha256 asset).
const SHA256 = "a9d0bafe09509c3afdad77aaa3af68ec08a38474f7619d5eedc56cbc900470f5";

const verifySha256 = (bytes, expected) =>
  createHash("sha256").update(bytes).digest("hex") === expected.trim().toLowerCase();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bindingsDir = join(root, "src", "lib", "srs_bindings");
const entryFiles = ["srs_bindings.js", "srs_bindings_bg.wasm", "governance-seed.srsj"];
const force = process.argv.includes("--force");
const url = process.env.SRS_BINDINGS_URL ?? DEFAULT_URL;

const overridden = process.env.SRS_BINDINGS_URL !== undefined;
const expected = overridden ? process.env.SRS_BINDINGS_SHA256 : SHA256;

const pinFile = join(bindingsDir, ".pin");
const pin = `${url}\n${expected ?? ""}\n`;
const readPin = () => {
  try {
    return readFileSync(pinFile, "utf8");
  } catch {
    return null;
  }
};
const present = entryFiles.every((f) => existsSync(join(bindingsDir, f)));
if (present && !force && readPin() === pin) {
  console.log(
    `srs_bindings already present at ${bindingsDir} for the pinned build — skipping download (use --force to refresh)`
  );
  process.exit(0);
}
if (present && !force) console.log("srs_bindings on disk are not the pinned build — refreshing");

console.log(`Downloading srs-bindings-web from ${url}`);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
  process.exit(1);
}

const bytes = Buffer.from(await res.arrayBuffer());
if (expected) {
  if (!verifySha256(bytes, expected)) {
    console.error(`srs-bindings-web sha256 mismatch for ${url} (expected ${expected}); bindings untouched`);
    process.exit(1);
  }
} else {
  console.warn(`WARNING: SRS_BINDINGS_URL is set without SRS_BINDINGS_SHA256 — NOT verifying ${url}`);
}

const tmp = mkdtempSync(join(tmpdir(), "srs-bindings-"));
try {
  const tarball = join(tmp, "srs-bindings-web.tar.gz");
  writeFileSync(tarball, bytes);

  mkdirSync(bindingsDir, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", tarball, "-C", bindingsDir], { stdio: "inherit" });
  if (tar.status !== 0) {
    console.error(`tar extraction failed (exit ${tar.status ?? "signal"})`);
    process.exit(1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const missing = entryFiles.filter((f) => !existsSync(join(bindingsDir, f)));
if (missing.length > 0) {
  console.error(`Artifact extracted but expected files are missing: ${missing.join(", ")}`);
  process.exit(1);
}
writeFileSync(pinFile, pin);
console.log(`srs_bindings ready at ${bindingsDir}`);
