import { completeDropboxOAuthCallback, completeGitHubOAuthCallback } from "$lib/storage/index.js";
import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/index.css";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Missing #app mount target in index.html");
}

// An OAuth redirect lands in a popup that must finish the exchange and close —
// never mount the app in that window. Check every provider that uses a redirect.
const handledOAuth =
  (await completeDropboxOAuthCallback({
    appKey: import.meta.env.VITE_DROPBOX_APP_KEY ?? "",
    redirectUri: import.meta.env.VITE_DROPBOX_REDIRECT_URI ?? `${window.location.origin}/`,
  })) ||
  (await completeGitHubOAuthCallback({
    clientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? "",
    redirectUri: import.meta.env.VITE_GITHUB_REDIRECT_URI ?? `${window.location.origin}/`,
  }));

const app = handledOAuth ? null : mount(App, { target });

export default app;
