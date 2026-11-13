// @vitest-environment node
/**
 * The recovery copy is the exploded tree (srs-web#816): restoring it through `load_tree` must
 * give the same repository, attachment bytes included, as the `.srs` archive it replaces.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));

it.skipIf(!haveBindings && !process.env.CI)(
  "a tree recovery copy restores the same repository",
  async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "recovery-tree.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "recovery-tree.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.load_archive(
      new Uint8Array(readFileSync(path.resolve(__dirname, "../e2e/fixtures/essay-images.srs")))
    );
    const tree: Record<string, Uint8Array> = repo.export_tree();
    expect(Object.keys(tree).some((p) => p.startsWith("source-documents/"))).toBe(true);
    const restored = mod.SrsRepository.load_tree(structuredClone(tree));
    expect(restored.export_tree()).toEqual(tree);
    expect(restored.export_archive()).toEqual(repo.export_archive());
  }
);
