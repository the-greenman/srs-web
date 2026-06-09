import { completeDropboxOAuthCallback } from "$lib/storage/index.js";
import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/index.css";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Missing #app mount target in index.html");
}

const handledOAuth = await completeDropboxOAuthCallback({
  appKey: import.meta.env.VITE_DROPBOX_APP_KEY ?? "",
  redirectUri: import.meta.env.VITE_DROPBOX_REDIRECT_URI ?? `${window.location.origin}/`,
});

const app = handledOAuth ? null : mount(App, { target });

export default app;
