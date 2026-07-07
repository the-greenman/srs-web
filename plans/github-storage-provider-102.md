# Plan: GitHub storage provider for srs-web (story muDemocracy.org#102)

## Summary

srs-web today opens/saves governance `.srsj` documents only from the local device, Dropbox, and
Google Drive. This plan adds **GitHub** as a first-class storage provider so a Clerk can sign in
with a normal OAuth popup, browse their own repositories, open a single-`.srsj` governance
document, edit it, and save edits back as a new commit — with stale-write (concurrent edit)
protection. It delivers the three srs-web sub-issues of story
[muDemocracy.org#102](https://github.com/the-greenman/muDemocracy.org/issues/102):
**#151** (serverless OAuth token-exchange proxy on the Cloudflare Worker), **#152** (the GitHub
storage provider), and **#154** (registry + env + SourceChooser button + provider-agnostic Save
action). The Codeberg sibling is deferred ("make GitHub work for now"). The Save action is built
provider-agnostic so Dropbox/Drive/Codeberg inherit it. Ships the single-`.srsj`-blob experience;
exploded per-record git layout is Epic 10.

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
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; **zero SRS semantics in TS/backend**. The OAuth proxy carries no SRS semantics — it exchanges an OAuth code for a token only — so it is compliant. | accepted |
| **ADR-011 (new)** | srs-web ships a **minimal same-origin Cloudflare Worker** (`worker/index.ts`) for OAuth token exchange only. The deploy model moves from assets-only to Worker-first-for-`/api/*` + assets fallback. Provider client secrets live as Worker secrets, never in the bundle. No SRS semantics server-side. **Owner-approved 2026-07-07** over the backend-free GitHub Device Flow alternative (better UX, reusable for Codeberg). | proposed |
| **Owner decision 2026-07-07** | OAuth scope is **`repo`** (public + private), not `public_repo` — a Clerk may keep a private governance repo. Fixed now because widening scope later forces re-consent. | accepted |

---

## Contracts

### WASM API surface

**No new or changed WASM methods.** GitHub load/save is pure browser `fetch` against the GitHub
REST API; `loadRepo()` and `exportSrsj()` already exist in `src/lib/srs-client.ts`. State: **No.**

### TypeScript types

No payload-schema-derived types change. New TS types are local storage-layer interfaces only
(`GitHubConfig`, git-contents responses). `StorageProviderId` gains `"github"`.

---

## Scope

In scope:

- `worker/index.ts` — same-origin Worker: `POST /api/oauth/github/token` code→token exchange
  (server-side `client_id`+`client_secret`), Origin + `redirect_uri` allow-listing, everything
  else → `env.ASSETS.fetch(request)`. Codeberg route stubbed only as far as the shared handler
  makes free (no Codeberg secret/registration this story).
- `wrangler.jsonc` — add `main`, `ASSETS` binding, `run_worker_first` for `/api/*`.
- `vite.config.ts` — dev proxy so `npm run dev` forwards `/api/*` to a local `wrangler dev`.
- `src/lib/storage/git-contents.ts` — shared GitHub/Forgejo Contents-API read/write/conflict
  helpers (so Codeberg reuses them later).
- `src/lib/storage/github.ts` — `GitHubProvider`, `GitHubDocumentHandle`,
  `completeGitHubOAuthCallback`, `parseGitHubOAuthCallback`.
- `src/lib/storage/types.ts` — `StorageProviderId += "github"`.
- `src/lib/storage/index.ts` — registry (`github` in `StorageProviders`, `createStorageProviders`,
  `createStorageProvidersFromEnv`), re-export `completeGitHubOAuthCallback`.
- `src/main.ts` — run `completeGitHubOAuthCallback` alongside Dropbox; mount only if no callback handled.
- `.env.example`, `.env.production` — `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_REDIRECT_URI`.
- `src/lib/components/SourceChooser.svelte` — GitHub Open button; generalise the existing Dropbox
  cloud-browser modal to a provider-agnostic browser so GitHub reuses it unchanged in behaviour.
- Save action: `onSave` prop threaded App → GovernanceShell/GuidesShell; a topbar **Save** button
  shown for write-capable handles; `StorageConflictError` → reload-and-retry prompt.
- Tests: unit (`tests/storage.test.ts` additions) + e2e (`e2e/cloud-storage.spec.ts` fake GitHub
  provider: open → edit → save round-trip, conflict UX, disabled-when-unconfigured).
- Docs: README GitHub section + Worker/OAuth-proxy production setup; ADR-011.

**Out of scope:**

- Codeberg provider/registration/secret (sibling story; shared code left reusable).
- Create-new-file-in-GitHub as a create target — `StorageProvider.create` does not exist on `main`
  (it is in unmerged #141). Deferred; filed as a follow-up. (`write()` with no `sha` still creates,
  so the capability is latent.)
- Exploded per-record git layout / human-readable diffs (Epic 10).
- Provisioning the real GitHub OAuth App + Worker secret in Cloudflare (external, deploy-time).

---

## Phases

### Phase 1: Serverless OAuth token-exchange proxy (#151)

**Goal:** A same-origin Worker exchanges a GitHub auth code for a token server-side; non-`/api`
routes still serve the SPA; no secret in the bundle.

**Agent:** Web App Worker

#### Tasks

- [ ] `worker/index.ts` `fetch(request, env)`: route `POST /api/oauth/github/token`; read
      `{ code, code_verifier, redirect_uri }`; validate `Origin` equals app origin and
      `redirect_uri` is the registered one (reject 403 otherwise); POST to
      `https://github.com/login/oauth/access_token` with `Accept: application/json` + injected
      `client_id`/`client_secret`; return `{ access_token, expires_in? }` JSON. Structure the
      handler so a Codeberg route can be added later with no rework.
- [ ] Everything else → `return env.ASSETS.fetch(request)`.
- [ ] `wrangler.jsonc`: add `"main": "./worker/index.ts"`, `ASSETS` binding on the existing assets
      config, `run_worker_first` for `/api/*`.
- [ ] `vite.config.ts`: dev `server.proxy` maps `/api` → `http://localhost:8787` (wrangler dev).
- [ ] Types for `Env` (`ASSETS`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_ORIGIN`,
      `GITHUB_REDIRECT_URI`).

#### Acceptance Criteria

- [ ] Code→token exchange returns a token JSON for a valid same-origin request.
- [ ] Foreign `Origin` or unregistered `redirect_uri` → rejected (not an open oracle).
- [ ] Non-`/api` route falls through to `ASSETS`.
- [ ] No secret in `dist/` or any `VITE_*` var: `rg -r dist -e CLIENT_SECRET` finds nothing.
- [ ] `npm run typecheck`, `npm run build` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

#### Milestone gate

Run typecheck+build; mark checkboxes; commit `feat: OAuth token-exchange Worker proxy (#151)`.

---

### Phase 2: GitHub storage provider (#152)

**Goal:** Sign in, browse repos, open a `.srsj`, read it, and save back as a commit whose blob SHA
is the new revision; stale-sha write raises a conflict.

**Agent:** Web App Worker

#### Tasks

- [ ] `src/lib/storage/git-contents.ts`: shared helpers for the Contents API — base64 read
      (`GET /repos/{o}/{r}/contents/{path}?ref={branch}` → decode `content`, capture `sha`),
      revision-aware write (`PUT` with `{ message, content: base64, sha, branch }`; `409`/`422` →
      `StorageConflictError`; success → new `content.sha`), UTF-8-safe base64 encode/decode.
- [ ] `src/lib/storage/github.ts`:
  - `parseGitHubOAuthCallback(url)` and `completeGitHubOAuthCallback(config)` — popup parses
    `code`/`state`, POSTs `{ code, code_verifier, redirect_uri }` to `/api/oauth/github/token`,
    `postMessage`s `{ accessToken, expiresAt }` to opener, closes. Mirror Dropbox's
    state/verifier `sessionStorage` + origin-checked `postMessage`.
  - `GitHubProvider implements StorageProvider` (`id:"github"`, `label:"GitHub"`, `configured`
    from `VITE_GITHUB_CLIENT_ID`): `authenticate()` PKCE popup to
    `https://github.com/login/oauth/authorize` `scope=repo` S256 + `state` (reuse Dropbox
    popup/timeout/cancel logic); `list(path?)` — `""` → `GET /user/repos?per_page=100` →
    `kind:"folder"`, `path:"owner/repo"` carrying `default_branch`; `"owner/repo[/dir]"` →
    `GET /repos/{o}/{r}/contents/{dir}` filtered to folders + `.srsj|.json`; emit the **same
    `StorageEntry` shape** as Dropbox. `open(entry)` → `GitHubDocumentHandle`.
  - `GitHubDocumentHandle implements DocumentHandle` (`capabilities {read:true,write:true}`) bound
    to `{owner,repo,path,branch,sha}`, delegating to `git-contents.ts`; missing `expires_in` →
    treat token as long-lived; token in-memory only.
- [ ] Unit tests mirroring the Dropbox/Drive tests: base64 read + sha capture; `write()` sends sha
      and advances revision; `409`/`422` → `StorageConflictError`; `parseGitHubOAuthCallback`
      success + denied.

#### Acceptance Criteria

- [ ] Open→edit→save round-trip; new blob SHA becomes the revision.
- [ ] Stale-sha write → `StorageConflictError`, no clobber.
- [ ] `npm run typecheck`, `lint`, `build`, `test` pass.

#### Milestone gate

Commit `feat: GitHub storage provider — load/save single .srsj (#152)`.

---

### Phase 3: Registry + env + SourceChooser + Save action (#154)

**Goal:** GitHub appears as an Open source (disabled when unconfigured); a Save button round-trips
edits and handles conflicts; local/Dropbox/Drive unchanged.

**Agent:** Web App Worker

#### Tasks

- [ ] `types.ts`: `StorageProviderId += "github"`.
- [ ] `index.ts`: `github` in `StorageProviders`, both `createStorageProviders*`
      (read `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_REDIRECT_URI`); re-export
      `completeGitHubOAuthCallback`. Keep the registry open for Codeberg.
- [ ] `main.ts`: `completeGitHubOAuthCallback` alongside Dropbox; mount only if none handled.
- [ ] `.env.example` + `.env.production`: `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_REDIRECT_URI`
      (`.env.example` empty + secrets comment; `.env.production` sets the redirect URI to the app
      origin, client id left for the user to provision).
- [ ] `SourceChooser.svelte`: generalise the Dropbox cloud-browser to a provider-agnostic
      browser (active provider id + entries + path + parents); add a GitHub button
      (`data-testid="source-github"`) disabled when `!configured`; reuse the same `run()` error
      helper and folder-browse→open flow. Dropbox behaviour unchanged.
- [ ] Save action: thread an `onSave` prop App → both shells; render a topbar **Save** button
      (`data-testid="save-document"`) shown only when `activeDocument?.capabilities.write`; on
      click `await activeDocument.write(exportSrsj(repo), activeDocument.revision)` then refresh the
      shown revision; `StorageConflictError` → inline reload-and-retry prompt. Local (download) and
      Drive/Dropbox behaviour unchanged; Save is provider-agnostic.
- [ ] e2e `cloud-storage.spec.ts`: fake GitHub provider via `window.__SRS_STORAGE_PROVIDERS__`
      (extend the registry-injection shape) — open → edit → save round-trip; conflict prompt;
      disabled button when unconfigured.

#### Acceptance Criteria

- [ ] GitHub Open source visible+enabled when configured, disabled when not.
- [ ] Save round-trips and surfaces conflicts as reload-and-retry.
- [ ] Existing local/Dropbox/Drive flows + tests green.
- [ ] `typecheck`, `lint`, `build`, `test`, `e2e` pass.

#### Milestone gate

Commit `feat: wire GitHub provider + provider-agnostic Save (#154)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run e2e` passes
- [ ] No provider secret in `dist/` or any `VITE_*` variable
- [ ] Dropbox/Drive/local open flows unchanged; Save works for write-capable handles

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript **or** in the Worker (ADR-001). The Worker does OAuth exchange only.
- Verification Agent runs after implementation and before sign-off.

## Resolved contracts (post-review, 2026-07-07)

Both plan reviewers flagged under-specified signatures; resolved here (binding for implementation):

- **Registry shape (blocking).** `github` is **optional** on `StorageProviders`
  (`github?: StorageProvider`) so existing e2e fixtures that inject only `{ dropbox, googleDrive }`
  keep type-checking and don't `TypeError` at runtime. `SourceChooser` guards `providers.github?.`.
  `createStorageProviders*` always construct it, so the live app always has it.
- **`completeGitHubOAuthCallback(config: GitHubConfig): Promise<boolean>`**, where
  `GitHubConfig = { clientId: string; redirectUri: string }`; returns `true` iff it handled an
  OAuth callback (mirrors `completeDropboxOAuthCallback`).
- **`GitHubProvider.configured = Boolean(config.clientId && config.redirectUri)`** — both non-empty.
- **`busy` union** in `SourceChooser` gains `"github"`; **grid** `grid-template-columns` becomes
  `repeat(auto-fit, minmax(0, 1fr))` (extensible) so the 4th button doesn't wrap-break.
- **Cloud-browser generalisation.** Lift `{ activeProvider: StorageProviderId, entries, path,
  parents }` into one browser state; `openBrowser(id)`, `chooseEntry`, `goUp` operate on the active
  provider via `providers[id].list(path)`. Dropbox path = `/folder`; GitHub path = `owner/repo[/dir]`
  (opaque to the modal). Each provider keeps its own button + `run()` error path.
- **`GitHubDocumentHandle.write(content, expectedRevision = currentRevision)`** — `PUT contents`
  with `{ message, content: base64, sha: expectedRevision, branch }`; **`409` or `422` →
  `StorageConflictError`**; on success `currentRevision = response.content.sha`. Capture the remote
  sha from the response so a reload-and-retry can rebind.
- **Save action ownership.** `App.svelte` owns `handleSave()` →
  `activeDocument.write(exportSrsj(repo), activeDocument.revision)`, catches `StorageConflictError`,
  refreshes the shown revision, and owns a `saveStatus` message. Shells receive
  `onSave?: () => Promise<void>` (**undefined** when no write-capable handle) + a `saveStatus` prop;
  they render the topbar **Save** button (`data-testid="save-document"`) iff `onSave` is defined and
  display `saveStatus`. `activeDocument` is **not** added to shell Props.
- **Worker `Env`** (exported `interface` in `worker/index.ts`):
  `{ ASSETS: Fetcher; GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string; APP_ORIGIN: string;
  GITHUB_REDIRECT_URI: string }`. `GITHUB_CLIENT_ID`, `APP_ORIGIN`, `GITHUB_REDIRECT_URI` are
  plaintext `[vars]` in `wrangler.jsonc`; **only `GITHUB_CLIENT_SECRET`** is a `wrangler secret put`
  value. Validation uses `env.APP_ORIGIN`, never a spoofable `Host` header.
- **Open-oracle guard (blocking-adjacent).** Reject with **403** when `Origin` is missing/null **or**
  `!== env.APP_ORIGIN`, **or** `redirect_uri !== env.GITHUB_REDIRECT_URI`. Absent `Origin` must fail
  closed.
- **e2e injection shape.** `window.__SRS_STORAGE_PROVIDERS__` typed
  `Partial<Record<StorageProviderId, StorageProvider>>` so a fake `github` can be injected; existing
  fixtures remain valid.
- **Dev UX (nit).** Two terminals: `npm run dev` (Vite, proxies `/api/*` → `:8787`) + `wrangler dev`;
  documented in README. GitHub sign-in is non-functional until wrangler runs locally.

## Assumptions

- The GitHub OAuth App (public `client_id` + `client_secret`) and the Cloudflare Worker secret are
  provisioned by the user at deploy time (mirrors the existing Dropbox/Google console setup). The
  code ships functional with `VITE_GITHUB_CLIENT_ID` empty → provider shows disabled, exactly like
  Dropbox/Drive when unconfigured. The PR does not depend on this provisioning.
- Local dev uses `wrangler dev` (port 8787) for `/api/*`, proxied from Vite; `npm run dev` alone
  serves the SPA with the GitHub button effectively non-functional until wrangler is running — will
  be documented.
- **`repo` scope** (public + private) — owner decision 2026-07-07, so a Clerk can keep a private
  governance repo as well as an open one. Broader than the story's minimum but chosen deliberately;
  a later narrowing would force re-consent, so it is fixed now.
