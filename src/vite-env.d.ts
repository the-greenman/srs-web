/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_DROPBOX_REDIRECT_URI?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GOOGLE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
