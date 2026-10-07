# srs-web

A browser editor for SRS repositories: edit them entirely client-side, on storage you own, with an agents panel for connecting MCP agents to the open document. Deployed as a Cloudflare Worker at [`app.semanticops.com`](https://app.semanticops.com) (also served at `app.mudemocracy.org` until the governance editor replaces it there).

SRS (pronounced "source") is an open standard for portable semantic documents that people and AI can both understand and use. [semanticops.com](https://semanticops.com) explains it (agents start at [`/llms.txt`](https://semanticops.com/llms.txt)); [srs.semanticops.com](https://srs.semanticops.com) hosts the specification and schemas.

It is a **thin client** (ADR-001) over the WASM core: it carries zero SRS semantics in TypeScript. All record, type, relation, container, lifecycle, validation, and rendering logic is delegated to the Rust engine ([`srs-rust`](https://github.com/the-greenman/srs-rust)) compiled to WASM; the web app adds presentation only. It works against local files, Dropbox, Google Drive and GitHub.

## The SemanticOps projects

| Project | Kind | In one line |
|---|---|---|
| [srs](https://github.com/the-greenman/srs) | Open standard | The specification, authored as its own data. |
| [srs-rust](https://github.com/the-greenman/srs-rust) | Reference engine | One core behind a CLI, WebAssembly bindings and an MCP server. |
| [srs-web](https://github.com/the-greenman/srs-web) (this repo) | Browser editor | Edit SRS repositories entirely client-side, on storage you own. |
| [srs-vscode](https://github.com/the-greenman/srs-vscode) | VS Code extension | Repositories in your workspace, with views for navigating them. |

muDemocracy is the first consumer of SRS, covering decision practice. See [semanticops.com/projects](https://semanticops.com/projects/) for each project in context.

## Tech stack

Svelte 5 (runes) + Vite 6 · TypeScript · `vite-plugin-wasm` · **Biome** (lint/format) · `svelte-check` (typecheck) · **Vitest** + `@testing-library/svelte` (unit) · **Playwright** (e2e) · **Cloudflare Workers** / `wrangler` (deploy). It is a single-page app (a state machine in `App.svelte`, no client-side router), not SvelteKit.

## Quickstart

```bash
npm install
npm run dev        # Vite dev server (proxies /api/* to a local Worker for GitHub OAuth)
npm run build      # prebuild fetches WASM bindings if missing, then vite build
npm run preview    # preview a production build
npm test           # Vitest unit tests
npm run e2e        # Playwright e2e specs (stop any running dev server first: the suite reuses one on :5173)
npm run typecheck  # svelte-check
npm run lint       # Biome
```

The WASM bindings are **not committed**: `scripts/ensure-bindings.mjs` downloads `srs-bindings-web.tar.gz` from the `srs-rust` GitHub releases over plain HTTPS (no auth). `predev`/`prebuild` fetch when `src/lib/srs_bindings/` is missing or holds a different build than the pin (a `.pin` marker records the downloaded URL + sha256, so a pin bump refreshes every checkout); `predeploy`/`fetch-bindings` always re-download with `--force` so a stale binding can never ship. The installable package bundles are fetched alongside by `scripts/ensure-packages.mjs`; see [Creating a new repository](#creating-a-new-repository-and-installing-editor-packages). See [Cloudflare Workers production](#cloudflare-workers-production) for building bindings locally against an unreleased engine.

## How it uses SRS

`src/lib/srs-client.ts` is a typed facade over the WASM `SrsRepository` class from `srs-bindings`. It dynamically imports the generated `srs_bindings.js` and calls engine methods for records, relations, containers, blueprints, discovery (`find`), rendering, navigation, lifecycle transitions, type schemas, and repository scaffolding. `.srsj` files load through `loadRepo(text)` and serialize back through `exportSrsj(repo)`; new documents are scaffolded from the `governance-seed.srsj` shipped inside the same release artifact, so seed and engine never drift.

## Project structure (`src/`)

```
App.svelte            app shell: WASM init, repo loading, boot/idle/loaded/error state machine
main.ts               Vite entry
lib/srs-client.ts     the WASM facade
lib/editors/           the one editor registry (which shell may open which repository)
lib/components/        design-system Svelte components (Nav, Inspector, RecordForm, Lifecycle, ...)
lib/governance/        GovernanceShell + type-registry, sections, decision-export helpers
lib/guides/            GuidesShell: blueprint-schema-driven guides editor (ADR-003)
lib/essay/             EssayShell: essays as structured paragraphs
lib/generic/           GenericSrsShell: the repository-first explorer
lib/mcp/               the MCP relay host behind the Agents panel
lib/storage/           pluggable providers: local, dropbox, google-drive, github, git-contents
lib/srs_bindings/      generated WASM bindings + governance-seed.srsj (NOT committed)
rendering/             read-only record renderers (RecordView, DecisionView, ...)
styles/                CSS token / utility / layout system
worker/index.ts        the only server code: GitHub OAuth token-exchange proxy (ADR-011)
```

## Editors

A repository opens in the editor that matches its types, or in the generic explorer. Which shell is offered for which repository is one registry (`src/lib/editors/registry.ts`), keyed on type UUID identity (ADR-002 records the original explicit-selection decision).

- **Governance editor**: create/open/edit governance documents: schema-driven record forms, lifecycle transitions (driven entirely by the WASM core, ADR-012), relations including a Decision-Link picker, supersession/successor flow, tags, a Decision Log view with lifecycle filtering, and a diagnostics panel from `validate()`.
- **Guides editor**: a blueprint-schema-driven editor whose forms are generated generically from `blueprintSchema()`.
- **Essay editor**: essays as structured paragraphs, with the Agents panel in its rail and addressable paragraphs (see [Paragraph addresses](#paragraph-addresses)).
- **Generic explorer**: a repository-first reader that renders only what the engine resolves (Compositions, navigation, container membership, discovery results) and works on any valid repository.

---

## Creating a new repository and installing editor packages

The start screen offers **New repository** beside opening an existing file. You enter a name, tick the editors to start with, and press **Create**. The repository is created in the browser only and nothing is saved yet. The first **Save** asks where to put it (this device, Dropbox or Google Drive); later saves go to that file. All semantics run in the WASM core.

- **Governance** scaffolds identity, the Decision Log container and the root container from `governance-seed.srsj`, through `scaffold_new_repository`. The seed ships inside the `srs-bindings-web.tar.gz` release artifact and lands at `src/lib/srs_bindings/governance-seed.srsj` via `scripts/ensure-bindings.mjs`, so it always matches the engine. Never hand-edit or vendor a copy.
- **Any other editor** starts from a blank repository (`SrsRepository.create({title})`, where the core derives the namespace). Its packages are installed from pinned bundles (`install_package_bundle`), then the editor opens.
- **No editor ticked** gives a blank repository in the generic view.

In the generic view, an editor whose packages are missing offers **Install <editor>**. Installing marks the document unsaved and opens the editor. The core decides what is missing (RFC-044 reason `missing`). An outdated or incompatible package is never installed over. It stays blocked with its message.

Installable bundles are pinned in `packages.lock.json` (`packageId`, `url`, `sha256`). `scripts/ensure-packages.mjs` downloads and sha256-verifies them into the gitignored `src/lib/packages/<packageId>.srspkg`. It runs from `predev`, `prebuild`, `pretest`, `pree2e` and `fetch-bindings`, and a mismatch fails the build. To add or bump a bundle, publish it as a public release asset (for example srs-web `packages-essay-1.5.0`) and update the lock entry (`version`, `url`, `sha256`). `scripts/check-pin-freshness.mjs` (CI) warns, never fails, when a newer `packages-<name>-<version>` release exists on srs-web than the lock's `version`; a separate "unchecked" warning means the release list or the lock could not be read.

## Autosave and session restore

The app autosaves the working copy to `localStorage` after every successful write
(create, update, delete, lifecycle transition, relation, tag update). A "Saved" flash appears
briefly in the toolbar after each autosave. If the local write itself fails (quota exceeded,
private-browsing block), the toolbar shows a distinct, non-dismissing "Local recovery copy could
not be saved" message instead of a false "Saved". This does not affect the WASM repository or a
subsequent provider save, only the local recovery copy.

While a provider save (cloud/git) is in flight, every control that would mutate the in-place
repository (New, Edit, Delete, lifecycle transitions, add/remove tag, relation create/delete, and,
in Guides mode, section reorder/removal and "+ New guide") is disabled, so a mutation can never
race a pending write. `DocumentMutationTracker` still independently guards against a stale save
completing after a later mutation (e.g. from an external MCP writer) by comparing epoch/revision;
a stale save reports "Newer changes remain unsaved" and the recovery copy is retained.

On reload, if a cached session is found the app goes directly to the file picker
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
Worker (see [ADR-011](docs/adr/011-oauth-proxy-worker.md)); the secret is a
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
   (Production uses the `semanticops-editor` GitHub App; a classic OAuth App also
   works with this code, but a GitHub App is preferred: fine-grained
   permissions, and tokens scoped to installations.)
2. **Make the app public** (app settings → Advanced → Make public). A private
   GitHub App's authorize page returns **GitHub's 404** for every user except
   the app owner. Sign-in appears to work for the owner while every new user
   gets a 404 in the OAuth popup. Public is required for anyone else to sign
   in or install the app.
3. Set the Authorization callback URL to `http://localhost:5173/` for local dev
   (and the production origin, see below, before deploying).
4. Put the app's **Client ID** in `VITE_GITHUB_CLIENT_ID` and set
   `VITE_GITHUB_REDIRECT_URI` to the matching redirect URI.
5. The app requests the `repo` scope (GitHub Apps ignore the scope parameter
   and use their installation permissions instead) so it can read/write a public **or private**
   governance repository. Sign in, then browse **repo → branch → file** (the
   loader lists branches after you pick a repo; the default branch sorts first),
   open a `.srsj`, edit, and **Save**. Each Save is a new commit whose blob SHA
   becomes the revision; a concurrent edit is reported as a conflict rather than
   silently clobbered. Opening from a branch binds the document to it, so Save
   defaults back to that branch.
6. **Save dialog:** saving a git document opens a dialog to commit to the current
   branch or **create a new branch** (useful when the default branch is
   protected), with an optional commit message. Set `VITE_GITHUB_APP_SLUG` (the
   app's URL slug) so the dialog can show an **Install / manage** link. A GitHub
   App must be *installed* on the repo's account (not just authorized at sign-in)
   before it can list private repos or write.
7. **Exploded-repo mode (Epic 10):** browsing into a directory that contains
   `manifest.json` (a git-diffable, multi-file SRS repository with every record,
   type, and field as its own file, rather than a single `.srsj` blob) shows an
   **"Open as SRS repository"** entry instead of listing `manifest.json` itself.
   Opening it loads every file in that directory via the GitHub Git Data API
   (not the Contents API the single-file flow above uses); the same Save dialog
   then commits only the files that actually changed, in one commit, scoped to
   that directory; everything else in the repo is left byte-identical. See
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
other providers still work; only GitHub sign-in is inert.

### Cloudflare Workers production

Deployed as a Cloudflare Worker (a static-assets SPA **plus** the minimal
`worker/index.ts` OAuth token-exchange route, ADR-011) with the
custom domains attached directly in `wrangler.jsonc`: the primary host
`https://app.semanticops.com` and a second host `https://app.mudemocracy.org`,
served by the same worker until the governance editor replaces it
(`routes: [{ pattern: "app.semanticops.com", custom_domain: true }, { pattern:
"app.mudemocracy.org", custom_domain: true }]`). The first `wrangler deploy` provisions the DNS + custom domain
binding automatically, no dashboard step required. Deploys are done by
Cloudflare Workers Builds on every push to `main` (Cloudflare's own Git
integration, not a GitHub Action, so there is no deploy workflow here).
`npm run deploy` (`vite build && wrangler deploy`) remains a manual override
for the owner only.

The WASM bindings are not committed here: they are fetched from the
`srs-rust` GitHub releases (`srs-bindings-web.tar.gz`, built by that repo's
`release.yml` on every merge to master) by `scripts/ensure-bindings.mjs`, a
plain-HTTPS download with no auth or `gh` CLI required (srs-rust is public;
override the source with `SRS_BINDINGS_URL`). It runs in two modes:

- `npm run dev` / `npm run build` (`predev` / `prebuild` hooks): downloads when
  `src/lib/srs_bindings/` is missing or its `.pin` marker (the URL + sha256 of
  the last verified download) differs from the pin, so a fresh clone builds
  with zero setup and a long-lived checkout never runs stale bindings after a
  pin bump (srs-web#459). A local `wasm-pack` build leaves the marker in place,
  so it is kept until the pin changes; a checkout with no marker yet
  (downloaded before #459) re-downloads once.
- `npm run deploy` (`predeploy` → `npm run fetch-bindings`): always
  re-downloads (`--force`), overwriting whatever was there, so there's no way
  to accidentally ship a stale binding on deploy.

The tarball is verified against a sha256 pinned in `ensure-bindings.mjs` before
extraction; a mismatch fails without touching `src/lib/srs_bindings/`. Bumping
the pin means changing `DEFAULT_URL` and `SHA256` together; get the value with
`gh release download <tag> --repo the-greenman/srs-rust --pattern 'srs-bindings-web.tar.gz.sha256' -O -`.
`SRS_BINDINGS_URL` overrides require `SRS_BINDINGS_SHA256` (without it a loud
warning is printed and verification is skipped).

If you're actively developing new bindings in `srs-rust` and want to test
unreleased changes in srs-web before they're merged, build locally instead.
This overwrites the fetched artifact until you next run `fetch-bindings` or
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

  The public `GITHUB_CLIENT_ID` and the `APP_ORIGINS` (comma-separated)
  allow-list is a plaintext `[vars]` entry in `wrangler.jsonc`. The OAuth `redirect_uri` must equal the
  request's allowed origin plus `/`.

  `vite build` runs in production mode by default and loads `.env.production`
  automatically, so these values are compiled into the static bundle the same
  way any other Vite env file would be. No Cloudflare dashboard environment
  variable configuration is needed (that was a Pages-specific mechanism that
  no longer applies).

Configure the provider consoles with:

For both `https://app.semanticops.com` and `https://app.mudemocracy.org`:

- Dropbox redirect URIs: `https://<host>/`
- Google authorized JavaScript origins: `https://<host>`
- Google API key website restrictions: `https://<host>/*`
- GitHub App authorization callback URLs: `https://<host>/`
- GitHub App visibility: **public** (Advanced → Make public); private apps
  404 the authorize page for every user except the owner

The Dropbox app key, Google OAuth client ID, Google API key, and Google project
number are compiled into the browser bundle by Vite. They are identifiers, not
secrets. Their protection comes from exact provider redirect/origin rules,
minimal OAuth scopes, and restricting the Google API key to the production
hostname and Google Picker API.

Do not configure these production values for arbitrary Cloudflare preview URLs:
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
   OAuth App's client ID and the stable redirect URI. Vite bakes these into the bundle
   and they **must match** the `"preview"` env vars in `wrangler.jsonc`.
5. Set the preview secret: `wrangler secret put GITHUB_CLIENT_SECRET --env preview`.
6. Deploy: `npm run deploy:preview` (`vite build --mode preview && wrangler deploy --env preview`).
   Plain `npm run deploy` always targets production; the `:preview` variant is required.

If `GITHUB_CLIENT_SECRET` is not set for the preview environment, the Worker returns
`{ "error": "server_misconfigured" }` (HTTP 500); no secret is exposed. Arbitrary
per-deployment preview URLs (`preview_urls` is disabled in the `"preview"` env block) remain
auth-disabled by design; only the stable workers.dev env URL gets OAuth support.
Dropbox and Google Drive OAuth remain disabled on preview unless separately registered
with their provider consoles.

## Agents and relays

Agents connect to the open document through an MCP relay. The **Agents** panel (the essay rail, or a floating dock in the other editors; Go → Agents… in the essay and explorer toolbars) is always present once a repository is open, and manages two per-viewer libraries (`localStorage`, client configuration only):

- **Relays** (`srs-web.relays`): add, rename, edit the URL, remove, and mark one as the default. A relay must be `https` (`http` only for `localhost`); it is stored as its bare origin. A relay with agents cannot be removed, and its URL cannot be edited, until those agents are forgotten.
- **Agents** (`srs-web.agent-connections`): each is fixed to one relay at creation (chosen in the connect form when more than one relay exists), keeps its id and channel credentials across reloads, can be renamed while disconnected, and shows when it last connected. With no relay the panel says "No relay yet."; the first-run agent stays hidden and is bound to the first relay you add. The lists refresh when another tab changes them (open agents are never disconnected by it), and Forget is disabled while another tab holds the agent's channel, like Connect.
- **Pair an agent…** (agent `⋯` menu, for an agent that has a channel): shows a secret-free connector URL and a 10-character pairing code, each with Copy, and "Expires in about N min". The code refreshes itself every 10 minutes; paste the URL into any MCP client that supports the standard MCP sign-in and type the code when it asks. **Direct URL…** (same menu) shows the direct (capability) URL in the same slot, with a warning; only one of the two views is open at a time. Real-client verification is tracked in semanticops-relay#1.

- **After a reload**, agents that were connected when the page closed reopen when the same repository opens again (unless another tab holds them), on the same channel and credentials, so paired clients keep working. A different repository does not reopen them, and Disconnect or Forget means "stay closed". The host remembers each agent's last `initialize` (per agent, in this browser, client metadata only) and replays it into the fresh session, so a client does not need to re-initialize; with several clients on one channel the last one to initialize wins. Forget or Rotate URL discards it. Without it, a call on a fresh session gets HTTP 404 with the engine's "not initialized" error and the client must re-initialize.

`VITE_MCP_RELAY_URL` (empty in `.env.example`; `.env.production` sets the hosted relay) and the legacy `localStorage["srs-web.mcp-relay-url"]` key (the dev and e2e seed) **seed the relay library once**. Deleting a seeded relay sticks, and changing `VITE_MCP_RELAY_URL` in a later build does not re-seed a viewer who already has a library: they add the new relay by hand. e2e sets the legacy key in an init script before the first load, and `playwright.config.ts` pins `VITE_MCP_RELAY_URL` empty so a developer's `.env.local` cannot leak in.

## Save-ready storage contract

Cloud/git documents retain their provider ID and revision in a `DocumentHandle`.
The **Save** button (shown for write-capable handles) exports the WASM
repository and calls the provider-agnostic, revision-aware `write()`:

```ts
await activeDocument.write(exportSrsj(repo), activeDocument.revision);
```

The revision is the provider's concurrency token: Dropbox `rev`, Drive `etag`,
GitHub blob SHA. A stale write raises `StorageConflictError`, which the UI
surfaces as a reload-and-retry prompt instead of clobbering the newer version.
Local browser files remain download-only (`Open` + `Download`).

## Documentation

- [`docs/adr/`](docs/adr/): architecture decision records (001 thin client, 002 editor modes, 011 OAuth proxy, 012 lifecycle-via-WASM, and more).
- [`CLAUDE.md`](CLAUDE.md): contributor guidance.

## Licence

The SRS web editor is released under the [Apache License 2.0](LICENSE).

Contributions to this repository are made under the terms of the [Developer Certificate of Origin](CONTRIBUTING.md#developer-certificate-of-origin). By submitting a pull request, you certify that you have the right to submit that work under the Apache License 2.0 by signing off your commits with `git commit -s`.

## Paragraph addresses

The essay editor keeps its state in the URL hash: `#e=<essayId>&p=<paragraphId>` opens an essay and scrolls to and focuses a paragraph (rendered, not editing); `&z=<paragraphId>` zooms into it instead. Ids are instance UUIDs, so `#e=…&p=…` is the stable paragraph address (agents can cite it). Parsing lives in `src/lib/essay/address.ts`.
