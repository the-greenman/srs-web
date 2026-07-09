# srs-web

Opinionated SRS governance web editor (WASM + Vite).

## Creating a new governance document

The governance editor's start screen offers **Create new** alongside opening
an existing file: enter a name, pick a destination (this device / Dropbox /
Google Drive), and the app scaffolds a complete governance document — identity
record, Decision Log container, and root container — via the WASM
`scaffold_new_repository` binding. The bundled seed lives at
`src/lib/governance/seed/` (RFC-014-migrated; see the README there for
provenance and regeneration — never hand-edit it).

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

1. Create a **GitHub OAuth App** (Settings → Developer settings → OAuth Apps).
2. Set the Authorization callback URL to `http://localhost:5173/` for local dev
   (and the production origin — see below — before deploying).
3. Put the app's **Client ID** in `VITE_GITHUB_CLIENT_ID` and set
   `VITE_GITHUB_REDIRECT_URI` to the matching redirect URI.
4. The app requests the `repo` scope so a Clerk can keep a public **or private**
   governance repository. Sign in, then browse **repo → branch → file** (the
   loader lists branches after you pick a repo; the default branch sorts first),
   open a `.srsj`, edit, and **Save** — each Save is a new commit whose blob SHA
   becomes the revision; a concurrent edit is reported as a conflict rather than
   silently clobbered. Opening from a branch binds the document to it, so Save
   defaults back to that branch.
5. **Save dialog:** saving a git document opens a dialog to commit to the current
   branch or **create a new branch** (useful when the default branch is
   protected), with an optional commit message. Set `VITE_GITHUB_APP_SLUG` (the
   app's URL slug) so the dialog can show an **Install / manage** link — a GitHub
   App must be *installed* on the repo's account (not just authorized at sign-in)
   before it can list private repos or write.

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

- Set the GitHub OAuth App **client secret** as a Worker secret (never a
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
- GitHub OAuth App authorization callback URL: `https://app.mudemocracy.org/`

The Dropbox app key, Google OAuth client ID, Google API key, and Google project
number are compiled into the browser bundle by Vite. They are identifiers, not
secrets. Their protection comes from exact provider redirect/origin rules,
minimal OAuth scopes, and restricting the Google API key to the production
hostname and Google Picker API.

Do not configure these production values for arbitrary Cloudflare preview URLs.
Provider authentication should remain disabled on previews unless a separate
preview credential set and stable preview hostname are registered with both
providers.

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
