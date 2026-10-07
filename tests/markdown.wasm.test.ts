// @vitest-environment node
/** The core's renderMarkdown on the REAL engine (default config stubs the bindings). */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
describe.skipIf(!haveBindings)("renderMarkdown on the real engine", () => {
  it("renders markdown and escapes raw HTML", async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "markdown.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "markdown.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    expect(mod.renderMarkdown("**a**")).toContain("<strong>a</strong>");
    expect(mod.renderMarkdown("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });
});
