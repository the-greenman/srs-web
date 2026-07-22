# Plan: GitHub App user-token refresh — avoid the 8h re-auth popup (#163)

## Summary

GitHub App user-to-server tokens expire after ~8h. Currently `GitHubProvider.authenticate()` re-opens the sign-in popup on every expiry, forcing a disruptive user interaction mid-session. GitHub returns a `refresh_token` alongside every `access_token`, but the OAuth proxy Worker (`worker/index.ts`) drops it, and `github.ts` has no refresh path. This plan wires up the full refresh flow: the Worker gains a `/api/oauth/{provider}/refresh` endpoint (server-side secret needed, same as the token exchange), and `GitHubProvider` silently refreshes near-expiry tokens before falling back to the popup. Serves muDemocracy.org#104; follow-up from PR #158 review.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS/Worker. The refresh endpoint is an OAuth relay only — no SRS semantics server-side. Compliant. | accepted |
| [ADR-011](../docs/adr/011-oauth-proxy-worker.md) | The same-origin Worker proxy already handles `POST /api/oauth/{provider}/token`; the refresh endpoint follows the same pattern with a new route and the same origin guard. | accepted |
| **[ADR-017](../docs/adr/017-refresh-token-in-memory.md) (new)** | Refresh tokens are kept in `GitHubProvider` private fields only — not `sessionStorage` or `localStorage`. A page reload clears them; the popup re-fires once per new page lifecycle. XSS risk of long-lived credentials in browser storage rejected; issue spec says "in memory". To be accepted (status flip) in Phase 2 before implementation begins. | accepted |
| **No GitHub App setting change** | The implementation works whether "Expire user authorization tokens" is on (implements refresh for 8h tokens) or off (refresh code path is never triggered, harmless). We do not require a GitHub App admin change and document the trade-off in the ADR. | accepted |

---

## Contracts

### WASM API surface

**No new or changed WASM methods.** This is a pure OAuth layer change in the Worker and storage provider. WASM is not involved.

### TypeScript types

- `GitHubAuthMessage` (local interface in `github.ts`): add `refreshToken?: string` and `refreshTokenExpiresAt?: number`.
- Worker `UpstreamToken` (internal to `worker/index.ts`): add `refresh_token?: string` and `refresh_token_expires_in?: number`.
- No changes to srs-rust payload schemas; no srs-bindings types touched.

---

## Scope

In scope:

- `worker/index.ts` — extend `UpstreamToken`, pass through `refresh_token` + `refresh_token_expires_in` on the existing `/token` route; add `POST /api/oauth/{provider}/refresh` with the same origin guard and a `refresh_token` body.
- `src/lib/storage/github.ts` — extend `GitHubAuthMessage` with refresh fields; extend `completeGitHubOAuthCallback` to include them in the popup message; add `refreshToken`/`refreshTokenExpiresAt` fields to `GitHubProvider`; add `refreshSilently()` private method; update `authenticate()` to attempt silent refresh before opening a popup.
- `tests/storage.test.ts` — new unit tests for Worker refresh handler and client refresh code paths.
- `docs/adr/017-refresh-token-in-memory.md` — flip status from `proposed` to `accepted`.

**Out of scope:**

- Codeberg/Forgejo refresh — deferred; tracked in srs-web#254. The Worker's provider table is structured for it but no secret/registration exists.
- Persisting refresh tokens across page reloads (sessionStorage/localStorage) — deferred; the in-memory design is explicit in the issue. Tracked by ADR-017 note.
- GitHub App admin setting change ("Expire user authorization tokens") — operational, not code.

---

## Phases

### Phase 1: Worker — expose refresh token + add refresh endpoint

**Goal:** `POST /api/oauth/{provider}/token` passes through the refresh token; `POST /api/oauth/{provider}/refresh` exists, validates origin, and exchanges a refresh token for a fresh access+refresh pair.

**Agent:** Web App Worker

#### Tasks

- [ ] Extend `UpstreamToken` in `worker/index.ts` with `refresh_token?: string` and `refresh_token_expires_in?: number`.
- [ ] Update `handleTokenExchange` return value (line 122): return `{ access_token: data.access_token, expires_in: data.expires_in, refresh_token: data.refresh_token, refresh_token_expires_in: data.refresh_token_expires_in }` — all fields are optional so absent fields are dropped by `JSON.stringify`.
- [ ] Add `TokenRefreshBody` interface: `{ refresh_token?: string }`.
- [ ] Add `REFRESH_ROUTE = /^\/api\/oauth\/([a-z]+)\/refresh$/` regex constant.
- [ ] Add `handleTokenRefresh(request: Request, env: Env, providerId: string): Promise<Response>` function:
  - Resolve `provider` from `PROVIDERS`; 404 if unknown.
  - Same `Origin` guard as `handleTokenExchange` (compare `request.headers.get("Origin")` to `env.APP_ORIGIN`; 403 if missing or mismatched).
  - Guard: `if (!clientId || !clientSecret) return json({ error: "server_misconfigured" }, 500)` — same as `handleTokenExchange`.
  - Parse body as `TokenRefreshBody`; 400 if `refresh_token` is absent.
  - POST to `provider.tokenUrl` with headers `{ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }` (the `Accept` header is required — without it GitHub returns form-encoded, not JSON) and body `grant_type=refresh_token&client_id=…&client_secret=…&refresh_token=…`.
  - Parse `UpstreamToken`; if `!upstream.ok || data.error || !data.access_token`, return 502 with error.
  - Return `json({ access_token, expires_in, refresh_token, refresh_token_expires_in })` (undefined fields omitted).
- [ ] Update `fetch` handler: after the `TOKEN_ROUTE` match block, add a `REFRESH_ROUTE` match block (same structure — require `POST`, call `handleTokenRefresh`). Control flow: TOKEN_ROUTE → REFRESH_ROUTE → `env.ASSETS.fetch(request)`.

#### Acceptance Criteria

- [ ] `POST /api/oauth/github/token` response body includes `refresh_token` and `refresh_token_expires_in` when GitHub returns them; omits them when absent.
- [ ] `POST /api/oauth/github/refresh` with valid body + correct `Origin` returns `{ access_token, refresh_token, ... }`.
- [ ] `POST /api/oauth/github/refresh` with wrong `Origin` returns 403.
- [ ] `POST /api/oauth/github/refresh` with missing `refresh_token` in body returns 400.
- [ ] `POST /api/oauth/github/refresh` when `GITHUB_CLIENT_SECRET` is unset returns 500 `server_misconfigured`.
- [ ] `npm run typecheck` passes.

#### Testing

Worker unit tests are in `tests/storage.test.ts` (vitest). Phase 3 adds the `handleTokenRefresh` test cases.

```bash
npm run typecheck
npm run lint
npm run build
```

#### Milestone gate

1. Verify all acceptance criteria above.
2. Run `npm run typecheck && npm run lint && npm run build` — all must pass.
3. Mark checkboxes `[x]`.
4. Commit: `feat(worker): expose refresh token + add /refresh endpoint (#163)`.

---

### Phase 2: Accept ADR-017 + client silent refresh in GitHubProvider

**Goal:** ADR-017 is accepted; `GitHubProvider.authenticate()` silently refreshes a near-expiry access token using the stored refresh token before falling back to the popup.

**Agent:** Web App Worker

#### Tasks

- [ ] In `docs/adr/017-refresh-token-in-memory.md`: change `**Status:** proposed` to `**Status:** accepted`.
- [ ] Add `GITHUB_REFRESH_ENDPOINT = "/api/oauth/github/refresh"` constant to `github.ts` (named with provider prefix to parallel future Codeberg constant; see srs-web#254).
- [ ] Extend `GitHubAuthMessage` with `refreshToken?: string` and `refreshTokenExpiresAt?: number`.
- [ ] In `completeGitHubOAuthCallback`: cast the token response to include `refresh_token?: string` and `refresh_token_expires_in?: number`. When present: `message.refreshToken = token.refresh_token; message.refreshTokenExpiresAt = token.refresh_token_expires_in ? Date.now() + token.refresh_token_expires_in * 1000 : Number.POSITIVE_INFINITY`.
- [ ] In `GitHubProvider`: add private fields `private refreshToken: string | null = null` and `private refreshTokenExpiresAt = 0`.
- [ ] Add private method `private async refreshSilently(): Promise<boolean>`:
  - Guard: `if (!this.refreshToken || Date.now() >= this.refreshTokenExpiresAt) return false`.
  - `const response = await fetch(GITHUB_REFRESH_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: this.refreshToken }) })`.
  - If `!response.ok` (4xx or 5xx) or the parsed token lacks `access_token`: `this.refreshToken = null; return false`. (Only clears on definitive failure — a network-level `fetch` throw is re-thrown so the caller can decide; see below.)
  - On success: `this.accessToken = token.access_token; this.expiresAt = token.expires_in ? Date.now() + token.expires_in * 1000 : Number.POSITIVE_INFINITY; this.refreshToken = token.refresh_token ?? this.refreshToken; this.refreshTokenExpiresAt = token.refresh_token_expires_in ? Date.now() + token.refresh_token_expires_in * 1000 : Number.POSITIVE_INFINITY; return true`.
  - Wrap the `fetch` call in try/catch: on `TypeError` (network failure), log and return `false` — do **not** clear `refreshToken` (the token is still valid; the network was at fault).
- [ ] Update `GitHubProvider.authenticate()`:
  - Replace: `if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;`
  - With: `if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;` (unchanged — early return when token is still valid).
  - Then add, immediately after: `if (this.accessToken && Date.now() >= this.expiresAt - 30_000 && await this.refreshSilently()) return;` — attempt silent refresh only when we had a token that is now near/past expiry; skip entirely on cold start (`this.accessToken` is null).
  - The existing popup flow follows unchanged.
- [ ] In the popup message handler inside `authenticate()`: after setting `this.accessToken` and `this.expiresAt`, add: `this.refreshToken = event.data.refreshToken ?? null; this.refreshTokenExpiresAt = event.data.refreshTokenExpiresAt ?? Number.POSITIVE_INFINITY`.

#### Acceptance Criteria

- [ ] `docs/adr/017-refresh-token-in-memory.md` status is `accepted`.
- [ ] `completeGitHubOAuthCallback` includes `refreshToken` and `refreshTokenExpiresAt` in the posted message when the server returns them.
- [ ] `GitHubProvider.authenticate()` does not open a popup when `refreshSilently()` returns `true`.
- [ ] `refreshSilently()` clears `refreshToken` only on a non-ok HTTP response from the endpoint, not on a network-level `TypeError`.
- [ ] `authenticate()` goes directly to the popup on cold start (`accessToken` null), without calling `refreshSilently()`.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above.
2. `npm run typecheck && npm run lint && npm run build && npm test` — all must pass.
3. Mark checkboxes `[x]`.
4. Commit: `feat(github): silent token refresh before popup fallback (#163)`.

---

### Phase 3: Unit tests — refresh code paths (Worker + client)

**Goal:** Both the Worker's `handleTokenRefresh` and the client's silent-refresh flow are covered by unit tests; no existing tests regress.

**Agent:** Web App Worker

#### Tasks

**Worker tests** (add to the describe block that exercises `worker/index.ts` in `tests/storage.test.ts`, or create a new describe block `"GitHub Worker /refresh endpoint"`):

- [ ] `"POST /api/oauth/github/refresh returns 403 for wrong Origin"`: construct a `Request` with a mismatched `Origin` header and a valid body; assert the response status is 403.
- [ ] `"POST /api/oauth/github/refresh returns 400 for missing refresh_token"`: construct a `Request` with correct `Origin` but `{}` body; assert 400.
- [ ] `"POST /api/oauth/github/refresh exchanges refresh token and returns new token pair"`: mock `fetch` returning `{ access_token: "new-at", expires_in: 28800, refresh_token: "new-rt", refresh_token_expires_in: 15897600 }`; assert response includes all four fields.
- [ ] `"POST /api/oauth/github/token passthrough includes refresh_token when GitHub returns it"`: mock `fetch` returning a token response including `refresh_token` and `refresh_token_expires_in`; assert the proxied response body includes them.
- [ ] `"POST /api/oauth/github/token passthrough omits refresh_token when absent"`: mock `fetch` returning `{ access_token, expires_in }` only; assert the response body has no `refresh_token` key.

**Client tests** (add under the "GitHub storage adapter" describe block in `tests/storage.test.ts`):

- [ ] `"completeGitHubOAuthCallback posts refresh token when server returns one"`: stub `sessionStorage`, `window.opener.postMessage`, `window.close`, and `fetch` returning `{ access_token, refresh_token: "rt", refresh_token_expires_in: 15897600 }`; verify `postMessage` was called with a message containing `refreshToken: "rt"` and a numeric `refreshTokenExpiresAt > Date.now()`.
- [ ] `"authenticate() refreshes silently when access token is near expiry"`: create a `GitHubProvider`; pre-seed via `Object.assign(provider, { accessToken: "old-at", expiresAt: Date.now() - 1, refreshToken: "rt", refreshTokenExpiresAt: Date.now() + 1_000_000 })`; stub `window` with no `open` mock (or assert `open` not called); stub `fetch` returning `{ access_token: "new-at", expires_in: 28800, refresh_token: "new-rt" }`; call `await provider.authenticate()`; assert `(provider as any).accessToken === "new-at"` and `window.open` was never called (use `vi.stubGlobal("window", { open: vi.fn(), ... })` and check mock was not called).
- [ ] `"authenticate() falls back to popup when refresh returns 400"`: pre-seed near-expiry token + valid refresh token; stub `fetch` returning a 400 response; stub `window.open` (via `vi.stubGlobal`); confirm `window.open` is called (popup launched). No need to await the full popup flow — the test confirms the popup path was entered.
- [ ] `"authenticate() goes straight to popup when no refresh token"`: pre-seed `accessToken: "old"`, `expiresAt: Date.now() - 1`, `refreshToken: null`; stub `window.open`; call `authenticate()` in a way that confirms `window.open` is called without a preceding `fetch` call to the refresh endpoint.
- [ ] `"refreshSilently() does not clear refreshToken on network TypeError"`: call `refreshSilently()` on a provider seeded with a valid refresh token while `fetch` throws a `TypeError`; assert `refreshToken` is still non-null after the call.

#### Acceptance Criteria

- [ ] All nine new tests pass (five Worker, four client).
- [ ] No existing tests regressed.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All nine new tests pass; zero regressions.
2. `npm run typecheck && npm run lint && npm run build && npm test` pass.
3. Mark checkboxes `[x]`.
4. Commit: `test(github): unit tests for token-refresh paths (#163)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all unit tests, including nine new refresh tests)
- [ ] `docs/adr/017-refresh-token-in-memory.md` status is `accepted`
- [ ] Worker `handleTokenRefresh` validates `Origin`, rejects missing `refresh_token`, sends `Accept: application/json`, guards `server_misconfigured`
- [ ] `GitHubProvider.authenticate()` does not open a popup when silent refresh succeeds
- [ ] `refreshSilently()` preserves `refreshToken` on network errors; clears only on definitive 4xx
- [ ] Popup fallback remains intact when refresh token is absent or refresh fails
- [ ] No regressions in Dropbox, Google Drive, or existing GitHub tests

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). This plan touches only the OAuth layer.
- Lead Integrator confirms ADR-011 extension is in scope before implementation (confirmed: adding a new `/api/*` route follows the established pattern).
- Verification Agent runs after Phase 3 (final milestone gate before review loop).

## Assumptions

- GitHub returns `refresh_token` and `refresh_token_expires_in` alongside `access_token` when "Expire user authorization tokens" is enabled in the GitHub App settings. If the App has this setting off, the implementation is a no-op (no refresh token received, code path never hit).
- `GITHUB_CLIENT_SECRET` is already provisioned as a Worker secret for both production and preview environments — no new secrets to add.
- The refresh token endpoint at `https://github.com/login/oauth/access_token` with `grant_type=refresh_token` is stable GitHub App behaviour (documented; in use since GitHub Apps token expiry was added).
- The existing `tests/storage.test.ts` vitest patterns (`vi.stubGlobal`, `vi.fn()`) apply to Worker handler testing as well as client testing.

## Deferred items filed

- srs-web#254: Codeberg/Forgejo token refresh support (follow-up from out-of-scope section above)
