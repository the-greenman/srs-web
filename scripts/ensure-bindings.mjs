#!/usr/bin/env node
// Ensure the WASM bindings built from srs-rust are present at src/lib/srs_bindings/.
//
// The bindings are gitignored (build output, not source), so a fresh clone —
// e.g. a Cloudflare Workers automated build — doesn't have them. This script
// downloads the release artifact from the public srs-rust repo when the
// bindings are missing. Pass --force to re-download even if present (used
// before deploys to pick up the latest release).
//
// No auth and no gh CLI required: srs-rust is public, so the artifact is a
// plain HTTPS download. Override the source with SRS_BINDINGS_URL if needed.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL =
	"https://github.com/the-greenman/srs-rust/releases/download/v0.1.0-build.297/srs-bindings-web.tar.gz";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bindingsDir = join(root, "src", "lib", "srs_bindings");
const entryFiles = ["srs_bindings.js", "srs_bindings_bg.wasm", "governance-seed.srsj"];
const force = process.argv.includes("--force");
const url = process.env.SRS_BINDINGS_URL ?? DEFAULT_URL;

const present = entryFiles.every((f) => existsSync(join(bindingsDir, f)));
if (present && !force) {
	console.log(`srs_bindings already present at ${bindingsDir} — skipping download (use --force to refresh)`);
	process.exit(0);
}

console.log(`Downloading srs-bindings-web from ${url}`);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
	console.error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
	process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "srs-bindings-"));
try {
	const tarball = join(tmp, "srs-bindings-web.tar.gz");
	writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));

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
console.log(`srs_bindings ready at ${bindingsDir}`);
