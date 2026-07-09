import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

// The WASM binary (srs_bindings.js) is a gitignored build artifact absent from the repo.
// In Node-environment tests, Vite's SSR path silently skips unresolvable dynamic imports.
// In the browser-mode pipeline (triggered by happy-dom component tests), unresolvable
// dynamic imports throw a hard error. This plugin intercepts the import and redirects it
// to a no-op stub so component tests can import GovernanceShell without the WASM binary.
const wasmStubPlugin: Plugin = {
  name: "test-wasm-stub",
  enforce: "pre",
  resolveId(id) {
    if (id.includes("srs_bindings/srs_bindings")) {
      return resolve(__dirname, "./tests/__mocks__/srs-bindings-stub.js");
    }
  },
};

export default defineConfig({
  plugins: [wasmStubPlugin, svelte({ hot: !process.env.VITEST }), svelteTesting()],
  resolve: {
    alias: {
      $lib: resolve(__dirname, "./src/lib"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
