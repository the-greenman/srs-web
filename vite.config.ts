import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), svelte()],
  resolve: {
    alias: {
      $lib: resolve(__dirname, "./src/lib"),
    },
  },
  server: {
    // Forward the OAuth token-exchange routes to a locally-running `wrangler dev`
    // (default port 8787). See README → GitHub / local dev.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    target: "es2022",
  },
});
