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
  build: {
    target: "es2022",
  },
});
