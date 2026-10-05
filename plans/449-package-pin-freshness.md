# Plan: Package pin freshness (#449)

## Summary

`packages.lock.json` pins editor bundles that go stale silently. Extend `scripts/check-pin-freshness.mjs` (no second script) to warn when srs-web has a newer `packages-<name>-<semver>` release than a lock entry's `version`. muDemocracy.org#284 will publish those releases; the private source repo is unreadable from CI.

## Contracts

- WASM API: no change. TypeScript types: none.

## Scope

- Add `compareSemver`, `latestPackageVersion`, `behindEntries` (exported, pure) and `checkPackages()` to the script; script only runs `main()` when invoked directly.
- Promises kept: warn only, exit 0 on every path; "unchecked" (lock unreadable, API failure) is distinct from "behind".
- Test `tests/check-pin-freshness.test.ts` for semver compare and the behind decision.
- README note on bumping a bundle.

**Out of scope:** auto-bump PRs, checking asset sha256, pagination beyond `per_page=100`.

## Phase 1

- [x] Script, test, README

#### Testing

```bash
npm run typecheck && npm run lint && npm test && node scripts/check-pin-freshness.mjs
```

## Final Acceptance

- [ ] All four gates exit 0; real run reports the essay pin current
