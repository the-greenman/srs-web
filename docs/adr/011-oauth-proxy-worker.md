# ADR-011: A minimal same-origin Cloudflare Worker performs OAuth token exchange

- **Status:** accepted
- **Date:** 2026-07-07
- **Issue:** [srs-web#151](https://github.com/the-greenman/srs-web/issues/151) · story [muDemocracy.org#102](https://github.com/the-greenman/muDemocracy.org/issues/102)
- **Supersedes:** —
- **Superseded by:** —

## Context

srs-web adds GitHub (and later Codeberg) as storage providers so a Clerk can keep their governance
`.srsj` in a version-control host. Both providers use OAuth Authorization Code. Unlike Dropbox and
Google — whose token endpoints support public browser clients (PKCE, no secret, CORS-enabled) —
GitHub's and Codeberg/Forgejo's token endpoints **require a client secret** and have **no browser
CORS support**. The browser therefore cannot complete the `code → access_token` exchange itself.

srs-web has until now deployed as an **assets-only** Cloudflare Worker (`wrangler.jsonc` declares
`assets.directory` with no `main` script). Three ways to obtain a GitHub token were considered:

1. **Ship the client secret in the bundle** — forbidden; the README rule is "never add a provider
   client secret to this application," and a bundled secret is world-readable.
2. **GitHub Device Flow** — no secret, no backend, srs-web stays static. But the UX is a code the
   user copies into `github.com/login/device` (unlike the one-click Dropbox popup), it diverges
   from the existing provider pattern, and it does not transfer to Codeberg/Forgejo.
3. **A same-origin serverless proxy** that injects the secret server-side and returns only the
   token to the browser.

## Decision

Adopt option 3. srs-web ships a **minimal same-origin Cloudflare Worker** (`worker/index.ts`) whose
only job is OAuth token exchange:

- `POST /api/oauth/{provider}/token` reads `{ code, code_verifier, redirect_uri }`, validates the
  `Origin` and `redirect_uri` against an allow-list (so the proxy is not an open token oracle),
  injects `client_id` + `client_secret` from Worker secrets, exchanges at the provider token
  endpoint, and returns `{ access_token, expires_in?, refresh_token?, refresh_token_expires_in? }`.
  The optional refresh fields are present only when the GitHub App has "Expire user authorization
  tokens" enabled; they are passed through verbatim without being stored server-side.
- `POST /api/oauth/{provider}/refresh` (srs-web#163, ADR-017) reads `{ refresh_token }`, validates
  `Origin`, exchanges with the provider using `grant_type=refresh_token`, and returns a new token
  pair in the same shape as `/token`. This allows silent mid-session re-authentication without a
  popup; the refresh token itself is kept in-memory only in the browser (ADR-017).
- Every other request falls through to `env.ASSETS.fetch(request)`, preserving the SPA and its
  single-page-application not-found handling.
- `wrangler.jsonc` gains `main`, an `ASSETS` binding, and `run_worker_first` for `/api/*`. Secrets
  are set with `wrangler secret put` and are **never** exposed as `VITE_*` or placed in `dist/`.
  Client IDs remain public `VITE_*` values.

The deploy model thus moves from assets-only to **Worker-first-for-`/api/*` + assets fallback**.

**This does not violate ADR-001.** ADR-001 forbids SRS *semantics* in TypeScript/non-Rust code. The
Worker carries zero SRS semantics — no record, type, relation, validation, or `.srsj` logic. It is
an OAuth relay. srs-web remains a thin client of the WASM engine.

## Consequences

- **Positive:** GitHub/Codeberg sign-in matches the existing one-click popup UX; no secret ships in
  the browser; the proxy is shared across git providers (Codeberg reuses the route). PKCE + Origin
  + `redirect_uri` allow-listing keep the endpoint from being abused.
- **Negative:** srs-web is no longer a purely static site — it now has a server-side surface and a
  Cloudflare secret to provision (`GITHUB_CLIENT_SECRET`). Local dev needs `wrangler dev` (proxied
  from Vite) for the `/api/*` route to work.
- **Neutral:** OAuth scope for GitHub is `repo` (public + private) per the owner decision of
  2026-07-07, recorded in the plan; narrowing it later would force re-consent.
