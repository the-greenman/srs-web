# srs-web

An opinionated **SRS governance web editor** — a browser app for creating, viewing, and editing SRS (Semantic Record System) governance documents (`.srsj` / `.json`). Deployed as a Cloudflare Worker at [`app.mudemocracy.org`](https://app.mudemocracy.org).

It is a **thin client** (ADR-001): it carries zero SRS semantics in TypeScript. All record, type, relation, container, lifecycle, validation, and rendering logic is delegated to the Rust engine (`srs-rust`) compiled to WASM; the web app adds presentation only.

## The ecosystem

Part of the SemanticOps monorepo — four independent git repos under a shared parent:

| Repo | Role |
|------|------|
| [`srs`](../srs) | Canonical spec: RFCs, JSON schemas, spec-as-records |
| [`srs-rust`](../srs-rust) | Reference implementation — the `srs` CLI engine + WASM bindings |
| [`srs-vscode`](../srs-vscode) | VS Code extension (thin client over the `srs` CLI) |
| **srs-web** (this repo) | Governance web editor (thin client over the WASM bindings) |

## Tech stack

Svelte 5 (runes) + Vite 6 · TypeScript · `vite-plugin-wasm` · **Biome** (lint/format) · `svelte-check` (typecheck) · **Vitest** + `@testing-library/svelte` (unit) · **Playwright** (e2e) · **Cloudflare Workers** / `wrangler` (deploy). It is a single-page app (a state machine in `App.svelte`, no client-side router), not SvelteKit.

## Quickstart

```bash
npm install
npm run dev        # Vite dev server (proxies /api/* to a local Worker for GitHub OAuth)
npm run build      # prebuild fetches WASM bindings if missing, then vite build
npm run preview    # preview a production build
npm test           # Vitest unit tests
npm run e2e        # Playwright e2e specs
npm run typecheck  # svelte-check
npm run lint       # Biome
```

The WASM bindings are **not committed** — `scripts/ensure-bindings.mjs` downloads `srs-bindings-web.tar.gz` from the `srs-rust` GitHub releases over plain HTTPS (no auth). `prebuild` fetches only if `src/lib/srs_bindings/` is missing (so fresh clones and CI build with zero setup); `predeploy`/`fetch-bindings` always re-download with `--force` so a stale binding can never ship. See [Cloudflare Workers production](#cloudflare-workers-production) for building bindings locally against an unreleased engine.

## How it uses SRS

`src/lib/srs-client.ts` is a typed facade over the WASM `SrsRepository` class from `srs-bindings`. It dynamically imports the generated `srs_bindings.js` and calls engine methods for records, relations, containers, blueprints, discovery (`find`), rendering, navigation, lifecycle transitions, type schemas, and repository scaffolding. `.srsj` files load through `loadRepo(text)` and serialize back through `exportSrsj(repo)`; new documents are scaffolded from the `governance-seed.srsj` shipped inside the same release artifact, so seed and engine never drift.

## Project structure (`src/`)

```
App.svelte            app shell — WASM init, repo loading, boot/idle/loaded/error state machine
main.ts               Vite entry
lib/srs-client.ts     the WASM facade (~1,150 LOC)
lib/components/        design-system Svelte components (Nav, Inspector, RecordForm, Lifecycle, ...)
lib/governance/        GovernanceShell + type-registry, sections, decision-export helpers
lib/guides/            GuidesShell — blueprint-schema-driven guides editor (ADR-003)
lib/storage/           pluggable providers: local, dropbox, google-drive, github, git-contents
lib/srs_bindings/      generated WASM bindings + governance-seed.srsj (NOT committed)
rendering/             read-only record renderers (RecordView, DecisionView, ...)
styles/                CSS token / utility / layout system
worker/index.ts        the only server code — GitHub OAuth token-exchange proxy (ADR-011)
```

~10,800 LOC across `src/` + `worker/` (47 Svelte components), 13 ADRs in `docs/adr/`.

## Editor modes

The app offers two editors (ADR-002):

- **Governance editor** — create/open/edit governance documents: schema-driven record forms, lifecycle transitions (driven entirely by the WASM core, ADR-012), relations including a Decision-Link picker, supersession/successor flow, tags, a Decision Log view with lifecycle filtering, and a diagnostics panel from `validate()`.
- **Guides editor** — a blueprint-schema-driven editor whose forms are generated generically from `blueprintSchema()`.

---

## Creating a new governance document

The governance editor's start screen offers **Create new** alongside opening
an existing file: enter a name, pick a destination (this device / Dropbox /
Google Drive), and the app scaffolds a complete governance document — identity
record, Decision Log container, and root container — via the WASM
`scaffold_new_repository` binding. The seed ships inside the
`srs-bindings-web.tar.gz` release artifact and lands at
`src/lib/srs_bindings/governance-seed.srsj` via `scripts/ensure-bindings.mjs`,
so it always matches the engine that scaffolds it — never hand-edit or vendor
a copy.

## Autosave and session restore

The governance editor autosaves the working copy to `localStorage` after every successful write
(create, update, delete, lifecycle transition, relation, tag update). A "Saved" flash appears
briefly in the topbar after each autosave.

On reload, if a cached session is found the app goes directly to the governance file-picker
with a **Restore session** banner. Clicking **Restore session** reloads the in-memory repository
from the cache and resumes editing. Clicking **Discard** or opening a different file clears the
cache.

The cache is a single `localStorage` slot (`srs-web:working-copy`). It is cleared whenever the
user opens another file or explicitly discards the session.

## Cloud storage

The editor can open `.srsj` and `.json` repositories from the local device,
Dropbox, Google Drive, or a GitHub repository; create new files on Dropbox or
Google Drive (`StorageProvider.create`); and **Save** edits back to any
write-capable cloud/git document. Cloud client IDs are public browser
identifiers; never add a provider client secret to this application. GitHub's
token exchange needs a secret, so it runs server-side in a tiny same-origin
Worker (see [ADR-011](docs/adr/011-oauth-proxy-worker.md)) — the secret is a
Worker secret, never in the bundle.

Copy `.env.example` to `.env.local` and fill in the configured provider values.
Local files remain available when any cloud provider is unconfigured; each
provider's button is disabled until its client ID is set.

### Dropbox

1. Create a scoped Dropbox app with **Full Dropbox** access.
2. Enable `files.metadata.read`, `files.content.read`, and
   `files.content.write`.
3. Add the exact redirect URI, initially `http://localhost:5173/`.
4. Put the app key in `VITE_DROPBOX_APP_KEY`.

The browser uses OAuth authorization code flow with PKCE and short-lived
in-memory access tokens. No Dropbox client secret is used.

### Google Drive

1. Create a Google Cloud project and configure its OAuth consent screen.
2. Enable Google Picker API and Google Drive API.
3. Create a web OAuth client with `http://localhost:5173` as an authorized
   JavaScript origin.
4. Create an API key restricted to that origin and Google Picker API.
5. Set the OAuth client ID, API key, and numeric cloud project number in the
   corresponding `VITE_GOOGLE_*` variables.

The app requests only `https://www.googleapis.com/auth/drive.file`. Google
Workspace-native documents are not supported; repositories must be ordinary
Drive files.

Add the deployed HTTPS origin and Dropbox redirect URI to both provider
consoles before production deployment.

### GitHub

1. Create a **GitHub App** (Settings → Developer settings → GitHub Apps) with
   **Contents: Read & write** and **Metadata: Read** repository permissions.
   (Production uses the `mudemocracy` GitHub App; a classic OAuth App also
   works with this code, but a GitHub App is preferred — fine-grained
   permissions, and tokens scoped to installations.)
2. **Make the app public** (app settings → Advanced → Make public). A private
   GitHub App's authorize page returns **GitHub's 404** for every user except
   the app owner — sign-in appears to work for the owner while every new user
   gets a 404 in the OAuth popup. Public is required for anyone else to sign
   in or install the app.
3. Set the Authorization callback URL to `http://localhost:5173/` for local dev
   (and the production origin — see below — before deploying).
4. Put the app's **Client ID** in `VITE_GITHUB_CLIENT_ID` and set
   `VITE_GITHUB_REDIRECT_URI` to the matching redirect URI.
5. The app requests the `repo` scope (GitHub Apps ignore the scope parameter
   and use their installation permissions instead) so it can read/write a public **or private**
   governance repository. Sign in, then browse **repo → branch → file** (the
   loader lists branches after you pick a repo; the default branch sorts first),
   open a `.srsj`, edit, and **Save** — each Save is a new commit whose blob SHA
   becomes the revision; a concurrent edit is reported as a conflict rather than
   silently clobbered. Opening from a branch binds the document to it, so Save
   defaults back to that branch.
6. **Save dialog:** saving a git document opens a dialog to commit to the current
   branch or **create a new branch** (useful when the default branch is
   protected), with an optional commit message. Set `VITE_GITHUB_APP_SLUG` (the
   app's URL slug) so the dialog can show an **Install / manage** link — a GitHub
   App must be *installed* on the repo's account (not just authorized at sign-in)
   before it can list private repos or write.
7. **Exploded-repo mode (Epic 10):** browsing into a directory that contains
   `manifest.json` (a git-diffable, multi-file SRS repository — every record,
   type, and field as its own file — rather than a single `.srsj` blob) shows an
   **"Open as SRS repository"** entry instead of listing `manifest.json` itself.
   Opening it loads every file in that directory via the GitHub Git Data API
   (not the Contents API the single-file flow above uses); the same Save dialog
   then commits only the files that actually changed, in one commit, scoped to
   that directory — everything else in the repo is left byte-identical. See
   [ADR-016](docs/adr/016-exploded-repo-tree-storage.md).

GitHub's token endpoint requires a client secret and has no browser CORS, so the
browser cannot exchange the auth code directly. A same-origin Worker route,
`POST /api/oauth/github/token` ([`worker/index.ts`](worker/index.ts)), performs
the exchange server-side. It validates the `Origin` and `redirect_uri` against
an allow-list so it can't be used as an open token oracle.

**Local dev** needs the Worker running alongside Vite: in one terminal run
`npm run dev` (Vite proxies `/api/*` to `http://localhost:8787`); in another run
`wrangler dev`. Copy `.dev.vars.example` to `.dev.vars` (gitignored) and fill in
the OAuth App's client ID + secret. Without `wrangler dev`, local files and the
other providers still work — only GitHub sign-in is inert.

### Cloudflare Workers production

Deployed as a Cloudflare Worker — a static-assets SPA **plus** the minimal
`worker/index.ts` OAuth token-exchange route (ADR-011) — with the
custom domain `https://app.mudemocracy.org` attached directly in
`wrangler.jsonc` (`routes: [{ pattern: "app.mudemocracy.org", custom_domain:
true }]`) — the first `wrangler deploy` provisions the DNS + custom domain
binding automatically, no dashboard step required. Deploys are run locally by
a human via `npm run deploy` (`vite build && wrangler deploy`); there is no
CI/CD deploy workflow.

The WASM bindings are not committed here — they are fetched from the
`srs-rust` GitHub releases (`srs-bindings-web.tar.gz`, built by that repo's
`release.yml` on every merge to master) by `scripts/ensure-bindings.mjs`, a
plain-HTTPS download with no auth or `gh` CLI required (srs-rust is public;
override the source with `SRS_BINDINGS_URL`). It runs in two modes:

- `npm run build` (`prebuild` hook): downloads only if
  `src/lib/srs_bindings/` is missing, so a fresh clone — including automated
  Cloudflare Workers builds — builds with zero setup, while a locally built
  binding is never clobbered.
- `npm run deploy` (`predeploy` → `npm run fetch-bindings`): always
  re-downloads (`--force`), overwriting whatever was there, so there's no way
  to accidentally ship a stale binding on deploy.

If you're actively developing new bindings in `srs-rust` and want to test
unreleased changes in srs-web before they're merged, build locally instead —
this overwrites the fetched artifact until you next run `fetch-bindings` or
`deploy`:

```bash
wasm-pack build crates/srs-bindings --target web --out-dir ../../srs-web/src/lib/srs_bindings
```

(run from the `srs-rust` checkout).

Before deploying:

- Ensure `wrangler` is authenticated: `npx wrangler whoami` (run
  `wrangler login` if not).
- `.env.production` is **committed** and holds every build-time value: the
  public browser identifiers (client IDs, Dropbox app key, Google Picker API
  key) and the production redirect URIs. They are baked into the served
  bundle, so they were never secret; committing them is what lets isolated
  builds (Cloudflare Workers Builds, CI) produce a working bundle with no
  environment configuration.

- Set the GitHub App **client secret** as a Worker secret (never a
  `VITE_*` var, never in the bundle):

  ```bash
  wrangler secret put GITHUB_CLIENT_SECRET
  ```

  The public `GITHUB_CLIENT_ID` and the `APP_ORIGIN` / `GITHUB_REDIRECT_URI`
  allow-list values are plaintext `[vars]` in `wrangler.jsonc`.

  `vite build` runs in production mode by default and loads `.env.production`
  automatically — these values are compiled into the static bundle the same
  way any other Vite env file would be. No Cloudflare dashboard environment
  variable configuration is needed (that was a Pages-specific mechanism that
  no longer applies).

Configure the provider consoles with:

- Dropbox redirect URI: `https://app.mudemocracy.org/`
- Google authorized JavaScript origin: `https://app.mudemocracy.org`
- Google API key website restriction: `https://app.mudemocracy.org/*`
- GitHub App authorization callback URL: `https://app.mudemocracy.org/`
- GitHub App visibility: **public** (Advanced → Make public) — private apps
  404 the authorize page for every user except the owner

The Dropbox app key, Google OAuth client ID, Google API key, and Google project
number are compiled into the browser bundle by Vite. They are identifiers, not
secrets. Their protection comes from exact provider redirect/origin rules,
minimal OAuth scopes, and restricting the Google API key to the production
hostname and Google Picker API.

Do not configure these production values for arbitrary Cloudflare preview URLs —
each deployment gets a unique hash URL that cannot be statically registered as an
OAuth redirect URI. Only the stable workers.dev hostname for the `preview`
environment (see below) gets OAuth support.

#### Preview deployments

To enable GitHub sign-in on a stable preview deployment:

1. Create a **separate** GitHub OAuth App for preview (Settings → Developer settings
   → OAuth Apps). Keep it independent from the production app so their credential
   lifecycles don't interfere.
2. Find your stable preview URL: run `wrangler whoami` to get your workers.dev
   subdomain; the URL is `https://srs-web-preview.<account>.workers.dev`.
3. Register that URL as the Authorization callback URL in the preview GitHub OAuth App.
4. Copy `.env.preview.example` to `.env.preview` (gitignored) and fill in the preview
   OAuth App's client ID and the stable redirect URI — Vite bakes these into the bundle
   and they **must match** the `"preview"` env vars in `wrangler.jsonc`.
5. Set the preview secret: `wrangler secret put GITHUB_CLIENT_SECRET --env preview`.
6. Deploy: `npm run deploy:preview` (`vite build --mode preview && wrangler deploy --env preview`).
   Plain `npm run deploy` always targets production — the `:preview` variant is required.

If `GITHUB_CLIENT_SECRET` is not set for the preview environment, the Worker returns
`{ "error": "server_misconfigured" }` (HTTP 500) — no secret is exposed. Arbitrary
per-deployment preview URLs (`preview_urls` is disabled in the `"preview"` env block) remain
auth-disabled by design; only the stable workers.dev env URL gets OAuth support.
Dropbox and Google Drive OAuth remain disabled on preview unless separately registered
with their provider consoles.

## Save-ready storage contract

Cloud/git documents retain their provider ID and revision in a `DocumentHandle`.
The **Save** button (shown for write-capable handles) exports the WASM
repository and calls the provider-agnostic, revision-aware `write()`:

```ts
await activeDocument.write(exportSrsj(repo), activeDocument.revision);
```

The revision is the provider's concurrency token — Dropbox `rev`, Drive `etag`,
GitHub blob SHA. A stale write raises `StorageConflictError`, which the UI
surfaces as a reload-and-retry prompt instead of clobbering the newer version.
Local browser files remain download-only (`Open` + `Download`).

## Documentation

- [`docs/adr/`](docs/adr/) — 13 architecture decision records (001 thin client, 002 editor modes, 011 OAuth proxy, 012 lifecycle-via-WASM, …).
- [`CLAUDE.md`](CLAUDE.md) — contributor guidance.
