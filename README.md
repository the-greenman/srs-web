# srs-web

Opinionated SRS governance web editor (WASM + Vite).

## Cloud storage

The editor can open `.srsj` and `.json` repositories from the local device,
Dropbox, or Google Drive. Cloud credentials are public browser identifiers;
never add a provider client secret to this application.

Copy `.env.example` to `.env.local` and fill in the configured provider values.
Local files remain available when either cloud provider is unconfigured.

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

### Cloudflare Pages production

For `https://app.mudemocracy.org`, configure the provider consoles with:

- Dropbox redirect URI: `https://app.mudemocracy.org/`
- Google authorized JavaScript origin: `https://app.mudemocracy.org`
- Google API key website restriction: `https://app.mudemocracy.org/*`

In Cloudflare, open **Workers & Pages**, select the Pages project, then use
**Settings > Environment variables** to add the five `VITE_*` values from
`.env.example` to the Production environment. Use:

```text
VITE_DROPBOX_REDIRECT_URI=https://app.mudemocracy.org/
```

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

Cloud documents retain their provider ID and revision in a `DocumentHandle`.
Both adapters already implement revision-aware `write()` operations, although
the current UI intentionally exposes only Open and Download. A future Save
action can export the WASM repository and call:

```ts
await activeDocument.write(exportSrsj(repo), activeDocument.revision);
```
