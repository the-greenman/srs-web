import { completeDropboxOAuthCallback, completeGitHubOAuthCallback } from "$lib/storage/index.js";
import { mount } from "svelte";
import App from "./App.svelte";
import "@fontsource/ibm-plex-sans/300.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
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

// Hidden, unlinked live styleguide (ADR-019): lazy so it never reaches the app chunk.
const isStyleguide = location.pathname.replace(/\/$/, "") === "/styleguide";
const Root = handledOAuth
  ? null
  : isStyleguide
    ? (await import("./Styleguide.svelte")).default
    : App;
const app = Root ? mount(Root, { target }) : null;

export default app;
