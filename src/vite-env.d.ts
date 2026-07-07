/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_DROPBOX_REDIRECT_URI?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GOOGLE_APP_ID?: string;
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_GITHUB_REDIRECT_URI?: string;
  /** GitHub App slug, used to build the install/manage link (…/apps/<slug>). */
  readonly VITE_GITHUB_APP_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
