// @vitest-environment node
/** The engine's `changes` read (srs-rust#1522) through $lib/document-changes, on the REAL bindings. */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}

describe.skipIf(!haveBindings)("what changed since the last save, on the real engine", () => {
  it("lists a write, and is empty again after mark_saved", async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "document-changes.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "document-changes.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Changes" }));
    const { markSaved, readChanges } = await import("../src/lib/document-changes.js");
    const { createContainer } = await import("../src/lib/srs-client.js");

    markSaved(repo);
    expect(readChanges(repo).total).toBe(0);

    createContainer(repo, { title: "A new section" });
    const after = readChanges(repo);
    expect(after.total).toBeGreaterThan(0);
    expect(after.groups.flatMap((g) => g.items).some((i) => i.title === "A new section")).toBe(true);

    markSaved(repo);
    expect(readChanges(repo).total).toBe(0);
  });
});
