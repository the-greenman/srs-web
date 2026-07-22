# Plan: GitHub OAuth on Cloudflare preview deployments (#164)

## Summary

The OAuth token-exchange Worker (`worker/index.ts`) guards its `/api/oauth/github/token` endpoint
by comparing the request `Origin` header against `APP_ORIGIN` (a static var in `wrangler.jsonc`).
With `preview_urls: true`, every preview deployment gets a unique per-deployment URL, so sign-in
always 403s with `forbidden_origin` on previews. This plan adds a `[env.preview]` configuration
block in `wrangler.jsonc` that points `APP_ORIGIN` + `GITHUB_REDIRECT_URI` at the **stable**
workers.dev hostname for the preview environment (enabled via `workers_dev: true`), and updates the
README to document the required operator steps (create a separate preview GitHub OAuth App, fill in
the placeholder vars, deploy with `vite build --mode preview && wrangler deploy --env preview`).

No changes to `worker/index.ts` or any Svelte/TS source are needed — the existing single-origin
check already works per-env once the vars are correctly set. The worker already fails safely with
`{ "error": "server_misconfigured" }` (HTTP 500) if `GITHUB_CLIENT_SECRET` is unset, so an
incomplete preview setup fails closed.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Lead Integrator |
| Web App Worker | Web App Worker |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-011](../docs/adr/011-oauth-proxy-worker.md) | Same-origin Worker performs OAuth token exchange with Origin + redirect_uri allow-list | accepted |

No new ADR required — this is an extension of ADR-011's existing per-environment variable pattern;
it adds a named preview env without changing any architectural decision.

---

## Contracts

### WASM API surface

No new or changed WASM methods required. This plan is purely configuration + documentation.

### TypeScript types

No new or changed TS types. `worker/index.ts` already reads `APP_ORIGIN`, `GITHUB_REDIRECT_URI`,
and `GITHUB_CLIENT_ID` from `env` — the preview env supplies different values for the same vars.

---

## Scope

- **`.gitignore`**: Add `!.env.preview.example` exception (mirrors `!.env.example` and `!.env.production`).
- **`wrangler.jsonc`**: Add `"env"` block with a `"preview"` environment entry.
- **`.env.preview.example`**: Template for the Vite build-time `VITE_GITHUB_CLIENT_ID` and
  `VITE_GITHUB_REDIRECT_URI` used by the browser side in a preview build.
- **`package.json`**: Add `"deploy:preview"` script: `vite build --mode preview && wrangler deploy --env preview`.
- **`README.md`**: Document the preview environment setup; update the auth-disabled paragraph.

**Out of scope:**

- Modifying `worker/index.ts` (no code changes needed).
- Modifying Svelte components or `srs-client.ts`.
- Supporting arbitrary per-deployment preview URLs (those remain auth-disabled; only the stable
  workers.dev env URL gets OAuth).
- Token refresh (#163 — separate issue).
- Any other cloud provider's preview auth (Dropbox, Google Drive).

---

## Phases

### Phase 1: Configuration files

**Goal:** `wrangler.jsonc`, `.gitignore`, `package.json`, and `.env.preview.example` are all
updated so a preview deploy is possible and all four files are committed.

**Agent:** Web App Worker

#### Tasks

- [ ] **`.gitignore`**: Add `!.env.preview.example` after the `!.env.production` line (line 10).
  The block should read:
  ```
  .env
  .env.*
  !.env.example
  !.env.production
  !.env.preview.example
  ```

- [ ] **`wrangler.jsonc`**: Add an `"env"` key at the top level (after the closing `]` of
  `"routes"`), before the final `}`. Use this exact structure:

  ```jsonc
  "env": {
    // Preview environment — stable workers.dev deployment for pre-prod OAuth testing.
    // Deploy with: npm run deploy:preview
    // Set the secret: wrangler secret put GITHUB_CLIENT_SECRET --env preview
    //
    // Find your account subdomain: run `wrangler whoami` (look for "workers.dev subdomain").
    // The stable preview URL will be: https://srs-web-preview.<account>.workers.dev
    //
    // Register that URL as the Authorization callback URL in a SEPARATE GitHub OAuth App
    // (keep preview and production apps independent — different client ID + secret).
    "preview": {
      "name": "srs-web-preview",
      "workers_dev": true,
      "preview_urls": false,
      "vars": {
        // PLACEHOLDER: replace <account> with your Cloudflare workers.dev subdomain
        "APP_ORIGIN": "https://srs-web-preview.<account>.workers.dev",
        "GITHUB_REDIRECT_URI": "https://srs-web-preview.<account>.workers.dev/",
        // PLACEHOLDER: replace with the preview OAuth App's public client ID
        "GITHUB_CLIENT_ID": "<preview-github-oauth-app-client-id>"
      }
    }
  }
  ```

- [ ] **`package.json`**: Add `"deploy:preview"` to the `"scripts"` block, after `"deploy"`:
  ```json
  "deploy:preview": "vite build --mode preview && wrangler deploy --env preview"
  ```

- [ ] **`.env.preview.example`**: Create with this exact content:
  ```
  # Preview build config — copy to .env.preview (gitignored) and fill in values.
  # Run: npm run deploy:preview  (uses --mode preview to load this file)
  # These are PUBLIC browser identifiers baked into the preview bundle by Vite.
  # They must match the [env.preview] vars in wrangler.jsonc exactly.
  # Never put the client secret here — use: wrangler secret put GITHUB_CLIENT_SECRET --env preview
  VITE_GITHUB_CLIENT_ID=<preview-github-oauth-app-client-id>
  VITE_GITHUB_REDIRECT_URI=https://srs-web-preview.<account>.workers.dev/
  # Dropbox and Google OAuth remain disabled on preview — separate provider console
  # registration required (not covered by this preview environment).
  ```

#### Acceptance Criteria

- [ ] `grep '!.env.preview.example' .gitignore` exits 0.
- [ ] `grep '"workers_dev": true' wrangler.jsonc` exits 0 (inside env.preview).
- [ ] `grep '"preview_urls": false' wrangler.jsonc` exits 0 (inside env.preview).
- [ ] `grep 'deploy:preview' package.json` exits 0.
- [ ] `.env.preview.example` exists and contains `VITE_GITHUB_CLIENT_ID`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
# Spot-check gitignore:
grep '!.env.preview.example' .gitignore
# Spot-check wrangler config:
grep 'srs-web-preview' wrangler.jsonc
grep 'deploy:preview' package.json
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: add Cloudflare preview env for GitHub OAuth (#164)`.

---

### Phase 2: Update README documentation

**Goal:** README fully documents the preview environment setup end-to-end; no longer states auth is
permanently disabled on previews.

**Agent:** Web App Worker

#### Tasks

- [ ] In the **GitHub** section (under `### GitHub`, around line 255), locate the paragraph that begins
  with the exact text:
  > `Do not configure these production values for arbitrary Cloudflare preview URLs.`

  Replace that entire paragraph (4 sentences ending with `"…registered with both providers."`) with:

  ```markdown
  Do not configure these production values for arbitrary Cloudflare preview URLs — each deployment
  gets a unique hash URL that cannot be statically registered as an OAuth redirect URI. Only the
  stable workers.dev hostname for the `preview` environment (see below) gets OAuth support.

  #### Preview deployments

  To enable GitHub sign-in on a stable preview deployment:

  1. Create a **separate** GitHub OAuth App for preview (Settings → Developer settings → OAuth
     Apps). Keep it independent from the production app so their credential lifecycles don't
     interfere.
  2. Find your stable preview URL: run `wrangler whoami` to get your workers.dev subdomain; the
     URL is `https://srs-web-preview.<account>.workers.dev`.
  3. Register that URL as the Authorization callback URL in the preview GitHub OAuth App.
  4. Copy `.env.preview.example` to `.env.preview` (gitignored) and fill in the preview OAuth
     App's client ID and the stable redirect URI — Vite bakes these into the bundle and they
     **must match** the `[env.preview]` vars in `wrangler.jsonc`.
  5. Set the preview secret: `wrangler secret put GITHUB_CLIENT_SECRET --env preview`.
  6. Deploy: `npm run deploy:preview` (`vite build --mode preview && wrangler deploy --env preview`).
     Plain `npm run deploy` always targets production — the `:preview` variant is required.

  If `GITHUB_CLIENT_SECRET` is not set for the preview environment, the Worker returns
  `{ "error": "server_misconfigured" }` (HTTP 500) — no secret is exposed. Arbitrary
  per-deployment preview URLs (`preview_urls` disabled in `[env.preview]`) remain auth-disabled
  by design; only the stable workers.dev env URL gets OAuth support. Dropbox and Google Drive
  OAuth remain disabled on preview unless separately registered with their provider consoles.
  ```

#### Acceptance Criteria

- [ ] `grep -n '#### Preview deployments' README.md` exits 0.
- [ ] `grep -n 'deploy:preview' README.md` exits 0.
- [ ] `grep -n 'wrangler secret put GITHUB_CLIENT_SECRET --env preview' README.md` exits 0.
- [ ] `grep -n 'Provider authentication should remain disabled on previews' README.md` exits non-zero (string removed).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
grep -n '#### Preview deployments' README.md
grep -n 'deploy:preview' README.md
! grep -n 'Provider authentication should remain disabled on previews' README.md
```

#### Milestone gate

1. All acceptance criteria met (run grep checks above).
2. Run all four suite commands — all must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `docs: document preview OAuth setup (#164)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `grep '!.env.preview.example' .gitignore` exits 0
- [ ] `grep '"workers_dev": true' wrangler.jsonc` exits 0
- [ ] `grep '"preview_urls": false' wrangler.jsonc` exits 0
- [ ] `grep 'deploy:preview' package.json` exits 0
- [ ] `.env.preview.example` exists with `VITE_GITHUB_CLIENT_ID`
- [ ] `grep '#### Preview deployments' README.md` exits 0
- [ ] `grep 'deploy:preview' README.md` exits 0
- [ ] `! grep 'Provider authentication should remain disabled on previews' README.md`

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001) — none are introduced by this plan.
- All placeholder values in config files are clearly marked with `# PLACEHOLDER:` comments.
- Worker error behaviour (`server_misconfigured`) is pre-existing and correct; do not change it.
- `.gitignore` must be updated before `.env.preview.example` is created, or the file will be
  silently excluded from the repo.

## Assumptions

- The Cloudflare account subdomain is unknown at plan time; `<account>` is a placeholder.
  Operators discover it via `wrangler whoami`.
- The preview environment uses a separate GitHub OAuth App (not the production app).
- `npm run deploy:preview` is a manual human step (no CI/CD deploy workflow).
- The existing `server_misconfigured` 500 error is the correct safe failure for unset secrets;
  no new error handling is needed.
