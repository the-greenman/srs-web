// @vitest-environment node
/**
 * Create a blank repository and install the pinned essay bundle against the REAL engine (the
 * default test config stubs the WASM bindings, so the generated JS is copied aside).
 */
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

describe.skipIf(!haveBindings)("install an editor's packages on the real engine", () => {
  async function blank() {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "editor-install.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "editor-install.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    return mod.SrsRepository.create(JSON.stringify({ title: "My Essays" }));
  }

  it("offers essay as installable, installs it, validates clean and is idempotent", async () => {
    const { EDITORS, availableEditors, installEditor } = await import(
      "../src/lib/editors/registry.js"
    );
    const { checkPackageRequirements, installBundles, listTypes } = await import(
      "../src/lib/srs-client.js"
    );
    const { newEssay } = await import("../src/lib/essay/essay-document.js");
    const repo = await blank();
    const essay = EDITORS.find((e) => e.id === "essay")!;

    const [offered] = availableEditors(repo, listTypes(repo));
    expect(offered.editor.id).toBe("essay");
    expect(offered.unmet?.install).toEqual(essay.requires);

    const e0 = repo.write_epoch();
    installEditor(repo, offered);
    expect(repo.write_epoch()).toBeGreaterThan(e0);
    expect(repo.validate().summary.errors).toBe(0);
    // essay 1.3.0 is satisfied by the installed 1.5.0 (the core's compatibility band)
    expect(checkPackageRequirements(repo, essay.requires)[0].satisfied).toBe(true);
    expect(availableEditors(repo, listTypes(repo))[0].unmet).toBeNull();
    expect(() => newEssay(repo, "First")).not.toThrow();

    const e1 = repo.write_epoch();
    const [again] = installBundles(
      repo,
      essay.requires.map((r) => r.packageId)
    );
    expect(again.installed).toBe(0);
    expect(again.skippedIdentical).toBeGreaterThan(0);
    expect(repo.write_epoch()).toBe(e1);
  });
});
