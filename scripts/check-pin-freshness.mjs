#!/usr/bin/env node
// check-pin-freshness.mjs — make srs-rust pin staleness visible (the-greenman/srs#392 row 3).
//
// scripts/ensure-bindings.mjs hard-pins one srs-rust release for the WASM bindings. That is
// correct by design — an unpinned download changes this app's behaviour with no commit here — but
// it goes stale silently, and a stale binding against a migrated corpus is the empty-render trap:
// the build is green, the E2E suite is green against its own fixtures, and the app renders nothing
// for real data.
//
// WARNS, NEVER FAILS — and "never" includes the error paths, which is where a check like this
// usually breaks its own promise. Every fallible step (reading the pin script, the API call,
// parsing the response) is caught and reported as a warning. Pins lag deliberately during a corpus
// cutover, so a red X would be wrong most of the time it fired. Auto-bump PRs are out of scope.
//
// It also checks every packages.lock.json entry against the `packages-<name>-<semver>` releases on
// srs-web itself (the public bundles; their private source repo is unreadable from CI).
//
// Each failure mode says which one it is. "unchecked" and "behind" are different facts, and a
// check that blurs them is one nobody can act on.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIN_SCRIPT = join(root, "scripts", "ensure-bindings.mjs");
const RELEASES_API = "https://api.github.com/repos/the-greenman/srs-rust/releases/latest";

// The pin is a release download URL; the tag is the path segment after /download/.
const TAG_IN_URL = /releases\/download\/([^/]+)\//;
// Release tags are `v<semver>-build.<n>`; the build number is what actually orders them.
const BUILD_NUMBER = /-build\.(\d+)$/;

// `::warning::` renders in the GitHub Actions run summary and against the file; outside CI it is
// just a prefixed line. Either way this process exits 0.
const warn = (message, file = "scripts/ensure-bindings.mjs") => console.log(`::warning file=${file}::${message}`);

const LOCK_FILE = join(root, "packages.lock.json");
const PACKAGE_RELEASES_API = "https://api.github.com/repos/the-greenman/srs-web/releases?per_page=100";
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// SemVer 2.0.0 precedence: -1/0/1, or null when either side is not SemVer. Numeric fields compare
// as numbers ("1.10.0" > "1.9.0", which a string compare gets wrong), a pre-release is OLDER than
// its release, and pre-release identifiers compare numerically if numeric, else lexically, with a
// numeric one below an alphanumeric one and a shorter prefix below a longer one. Build metadata is ignored.
export function compareSemver(a, b) {
	const x = SEMVER.exec(a);
	const y = SEMVER.exec(b);
	if (!x || !y) return null;
	for (let i = 1; i <= 3; i++) if (x[i] !== y[i]) return Number(x[i]) < Number(y[i]) ? -1 : 1;
	if (x[4] === y[4]) return 0;
	if (x[4] === undefined) return 1;
	if (y[4] === undefined) return -1;
	const p = x[4].split(".");
	const q = y[4].split(".");
	for (let i = 0; i < Math.min(p.length, q.length); i++) {
		if (p[i] === q[i]) continue;
		const pn = /^\d+$/.test(p[i]);
		const qn = /^\d+$/.test(q[i]);
		if (pn && qn) return Number(p[i]) < Number(q[i]) ? -1 : 1;
		if (pn !== qn) return pn ? -1 : 1;
		return p[i] < q[i] ? -1 : 1;
	}
	return p.length === q.length ? 0 : p.length < q.length ? -1 : 1;
}

// Highest published `packages-<name>-<semver>` version for `name`, or undefined. The name prefix is
// matched literally and the remainder must parse as SemVer, so hyphenated names stay unambiguous.
export function latestPackageVersion(tags, name) {
	const prefix = `packages-${name}-`;
	let best;
	for (const tag of tags) {
		if (typeof tag !== "string" || !tag.startsWith(prefix)) continue;
		const version = tag.slice(prefix.length);
		if (compareSemver(version, version) === null) continue;
		if (best === undefined || compareSemver(version, best) > 0) best = version;
	}
	return best;
}

// Lock entries whose pinned version is older than the newest release tag: [{name, pinned, latest}].
// A pin that is equal, ahead, or not SemVer is never "behind" (fail quiet, the safe direction).
export function behindEntries(lock, tags) {
	const out = [];
	for (const { name, version } of lock) {
		const latest = latestPackageVersion(tags, name);
		if (latest !== undefined && compareSemver(version, latest) === -1) out.push({ name, pinned: version, latest });
	}
	return out;
}

const githubHeaders = () => {
	// See the unauthenticated rate-limit note in checkBindings().
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	return {
		accept: "application/vnd.github+json",
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
};

async function checkPackages() {
	const file = "packages.lock.json";
	let lock;
	try {
		lock = JSON.parse(await readFile(LOCK_FILE, "utf8"));
		if (!Array.isArray(lock)) throw new Error("not an array");
	} catch (error) {
		warn(`cannot read ${LOCK_FILE} (${error.message}) — package pin freshness is NOT being checked`, file);
		return;
	}
	let tags;
	try {
		const res = await fetch(PACKAGE_RELEASES_API, { headers: githubHeaders() });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		const body = await res.json();
		if (!Array.isArray(body)) throw new Error("response was not a release list");
		tags = body.filter((r) => !r?.draft).map((r) => r?.tag_name);
	} catch (error) {
		warn(`could not list srs-web releases (${error.message}) — package pin freshness unchecked`, file);
		return;
	}
	const behind = behindEntries(lock, tags);
	for (const { name, pinned, latest } of behind) {
		warn(
			`package pin is behind: ${name} pinned ${pinned}, latest srs-web release packages-${name}-${latest}. ` +
				`Bump it deliberately (update version, url and sha256 in packages.lock.json).`,
			file,
		);
	}
	if (behind.length === 0) console.log(`package pins in packages.lock.json are current (${lock.length} checked).`);
}

// Every exit from here is 0. `main()` returns rather than throwing, and the one catch-all below
// covers anything unforeseen — an unhandled rejection in a top-level-await module exits 1, which
// would break the one promise this script makes.
async function checkBindings() {
	let source;
	try {
		source = await readFile(PIN_SCRIPT, "utf8");
	} catch (error) {
		// The pin script was renamed, moved, or folded elsewhere. Not a staleness finding: this
		// check has silently stopped checking, which is worth more noise than a stale pin.
		warn(`cannot read ${PIN_SCRIPT} (${error.message}) — pin freshness is NOT being checked`);
		return;
	}

	const match = TAG_IN_URL.exec(source);
	if (!match) {
		warn(`no release-download tag found in ${PIN_SCRIPT} — pin freshness is NOT being checked`);
		return;
	}
	const pinned = match[1];

	let latest;
	try {
		// Authenticate when a token is available. Unauthenticated api.github.com allows 60 requests
		// per hour PER SOURCE IP, and GitHub-hosted runners share egress IPs with every other
		// unauthenticated caller — so an unauthenticated call is liable to 403 and silently turn
		// this check off exactly when it is supposed to be working. `github.token` raises the limit
		// to 1000/hr/repo and is passed by the workflow.
		const res = await fetch(RELEASES_API, { headers: githubHeaders() });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		const body = await res.json();
		latest = body?.tag_name;
		// A 200 whose body has no `tag_name` would otherwise compare `undefined` against the pin and
		// emit "latest srs-rust release undefined" — an actionable-looking warning about nothing.
		if (typeof latest !== "string" || latest === "") {
			throw new Error("response carried no tag_name");
		}
	} catch (error) {
		warn(`could not resolve the latest srs-rust release (${error.message}) — pin freshness unchecked`);
		return;
	}

	if (pinned === latest) {
		console.log(`srs-bindings pin ${pinned} is the latest srs-rust release.`);
		return;
	}

	// Compare build numbers rather than just testing inequality. A pin bumped ahead of
	// /releases/latest — which excludes prereleases, and lags a freshly published release by
	// moments — would otherwise be reported as "behind" on the very PR that fixed the staleness.
	const pinnedBuild = BUILD_NUMBER.exec(pinned)?.[1];
	const latestBuild = BUILD_NUMBER.exec(latest)?.[1];
	// The build counter only orders tags WITHIN one version. Compared across versions it reads
	// `v0.1.0-build.285` as ahead of `v0.2.0-build.3` (285 > 3) and calls a pin that is a whole minor
	// version stale "not stale" — and AHEAD is the one branch that stays silent, so that would fail
	// open. AHEAD therefore requires equal version prefixes; every other case falls through to the
	// warning below, which is the safe direction.
	const versionOf = (tag) => tag.replace(BUILD_NUMBER, "");
	const sameVersion = versionOf(pinned) === versionOf(latest);
	if (sameVersion && pinnedBuild && latestBuild && Number(pinnedBuild) > Number(latestBuild)) {
		console.log(
			`srs-bindings pin ${pinned} is AHEAD of the latest published release ${latest} — ` +
				`expected briefly after a bump, or if that build was cut as a prerelease. Not stale.`,
		);
		return;
	}

	const behindBy =
		sameVersion && pinnedBuild && latestBuild
			? ` (${Number(latestBuild) - Number(pinnedBuild)} builds behind)`
			: "";
	warn(
		`srs-bindings pin is behind: pinned ${pinned}, latest srs-rust release ${latest}${behindBy}. ` +
			`A stale pin renders an up-to-date corpus as empty rather than failing — bump it deliberately ` +
			`(update DEFAULT_URL in scripts/ensure-bindings.mjs and re-run \`npm run fetch-bindings\`).`,
	);
}

async function main() {
	for (const check of [checkBindings, checkPackages]) {
		await check().catch((error) => {
			warn(`pin freshness check failed unexpectedly (${error.message}) — pin freshness unchecked`);
		});
	}
}

// Importable for tests without running; executed when invoked as a script.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
