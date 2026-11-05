// @vitest-environment node
/**
 * A restored session commits only what changed (srs-web#732): the recovery copy is an archive, so
 * tree -> archive -> load -> tree must give back the bytes the tree opened with, or a save from a
 * restored session would commit noise.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));

async function engine() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "restore-tree.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "restore-tree.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

function readDir(root: string, at = ""): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(path.join(root, at))) {
    const rel = at ? `${at}/${name}` : name;
    if (statSync(path.join(root, rel)).isDirectory()) Object.assign(files, readDir(root, rel));
    else files[rel] = new Uint8Array(readFileSync(path.join(root, rel)));
  }
  return files;
}

describe.skipIf(!haveBindings)("a restored tree on the real engine", () => {
  it("exports the files it opened with, byte for byte, after the archive round trip", async () => {
    const mod = await engine();
    const opened = readDir(path.join(__dirname, "../e2e/fixtures/exploded"));
    const archive = mod.SrsRepository.load_tree(opened).export_archive();
    const out: Record<string, Uint8Array> = mod.SrsRepository.load_archive(archive).export_tree();
    const asText = (files: Record<string, Uint8Array>) =>
      Object.fromEntries(
        Object.entries(files)
          .map(([p, b]) => [p, Buffer.from(b).toString("latin1")])
          .sort(([a], [b]) => a.localeCompare(b))
      );
    expect(asText(out)).toEqual(asText(opened));
  });
});
