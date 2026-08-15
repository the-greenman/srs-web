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
const warn = (message) => console.log(`::warning file=scripts/ensure-bindings.mjs::${message}`);

// Every exit from here is 0. `main()` returns rather than throwing, and the one catch-all below
// covers anything unforeseen — an unhandled rejection in a top-level-await module exits 1, which
// would break the one promise this script makes.
async function main() {
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
		const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
		const res = await fetch(RELEASES_API, {
			headers: {
				accept: "application/vnd.github+json",
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
		});
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

await main().catch((error) => {
	warn(`pin freshness check failed unexpectedly (${error.message}) — pin freshness unchecked`);
});
