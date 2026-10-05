# Plan: Pin sha256 of srs-bindings-web tarball (#448)

## Summary

`ensure-bindings.mjs` pins a release URL but not its content; ensure-packages.mjs already sha256-verifies. Add the same for the bindings tarball.

## Scope

- `SHA256` constant beside `DEFAULT_URL` (URL format unchanged for check-pin-freshness.mjs); verify with `node:crypto` before extraction; mismatch exits non-zero, bindings untouched (also under `--force`).
- `SRS_BINDINGS_URL` override requires `SRS_BINDINGS_SHA256`; absent = loud warning, skip.
- README bindings section: bump URL + sha together, how to get the sha.
- Test in tests/package-bundles.test.ts: data: URL tarball with wrong sha must fail with "sha256 mismatch".

**Out of scope:** auto-bump, changing pin freshness check.

## Final Acceptance

- [ ] typecheck, lint, test pass; `npm run fetch-bindings` verifies a real download
- [ ] `node scripts/check-pin-freshness.mjs` still finds the pinned tag
