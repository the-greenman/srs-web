# ADR-017: GitHub refresh tokens are kept in-memory only, not in browser storage

- **Status:** accepted
- **Date:** 2026-07-22
- **Issue:** [srs-web#163](https://github.com/the-greenman/srs-web/issues/163) · story [muDemocracy.org#104](https://github.com/the-greenman/muDemocracy.org/issues/104)
- **Supersedes:** —
- **Superseded by:** —

## Context

GitHub App user-to-server refresh tokens carry a ~6-month lifetime and can be exchanged for a new
`access_token` + `refresh_token` pair at any time. Storing them across page reloads would let the
app re-authenticate silently even after the browser tab is closed and reopened, removing re-auth
popups entirely. Three storage options were considered:

1. **In-memory only** — fields on `GitHubProvider`; cleared on page reload.
2. **`sessionStorage`** — survives same-tab reloads; cleared on tab close.
3. **`localStorage`** — survives tab close and browser restart.

## Decision

Store GitHub refresh tokens **in-memory only** (option 1). On page reload the refresh token is
gone; the next `authenticate()` call opens the popup once, as before. The silent-refresh path only
operates within the same page lifecycle (preventing the 8h mid-session re-auth popup).

**Rationale:**

- Refresh tokens with a 6-month lifetime are higher-value credentials than access tokens. Placing
  them in `sessionStorage` or `localStorage` means any XSS attack in the app can exfiltrate a
  token that will remain valid for months.
- srs-web's threat model is: the editor is a single-page app running third-party WASM (the Rust
  engine); a `sessionStorage`/`localStorage` write is visible to all scripts on the origin,
  including any future `<script>` tag.
- The issue spec (srs-web#163) explicitly says "in memory" — this is an intentional owner
  constraint.
- For the primary UX goal (avoiding mid-session popups after 8h), in-memory is sufficient: a
  session that involves opening the app, editing a document, and saving back rarely exceeds the
  ~6-month refresh token lifetime anyway. The pain point is the 8h access token expiry, not the
  page-reload case.

## Consequences

- **Positive:** No XSS exfiltration of long-lived credentials from browser storage.
- **Negative / Trade-offs:** After a page reload, the popup fires once. Users who reload during a
  long session will re-authenticate.
- **Neutral:** If a future revision moves to `sessionStorage`, a separate ADR and security review
  is required. This ADR's decision is the explicit **default until that review happens** — don't
  add `sessionStorage.setItem('srs.github.refresh_token', …)` without a new ADR.
