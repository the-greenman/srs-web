// @vitest-environment node
/**
 * The help loader against the REAL engine and the real help/ repository (srs-web#639): an editor's
 * help is its container's ui-feature records in entry order; an editor with no container has none.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}
const HELP = path.resolve(__dirname, "../help");
const tree = (dir: string): Record<string, Uint8Array> =>
  Object.fromEntries(
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      // as the app's import.meta.glob sees it: dot directories (the .srs marker) are skipped
      .filter((p) => !p.startsWith(".") && statSync(path.join(dir, p)).isFile())
      .map((p) => [p.split(path.sep).join("/"), new Uint8Array(readFileSync(path.join(dir, p)))])
  );

describe.skipIf(!haveBindings)("helpFor on the real engine", () => {
  it("reads an editor's container in entry order, and nothing for an editor with no help", async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "help.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "help.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const { helpFor } = await import("../src/lib/help/help.js");
    const client = await import("../src/lib/srs-client.js");
    const repo = mod.SrsRepository.load_tree(tree(HELP));

    expect(helpFor("no-such-editor", repo)).toEqual([]);
    const essay = client.listContainers(repo).find((c) => c.title === "Essay editor help");
    expect(essay).toBeDefined();
    const before = helpFor("essay", repo).length;
    const UI_FEATURE = "b6981a3a-d0e4-429b-9f1b-ae5090326570";
    const add = (feature_id: string, placement: string) => {
      const r = client.createRecord(repo, UI_FEATURE, 1, {
        fieldValues: { feature_id, placement, title: feature_id, summary: "s" },
      });
      client.addContainerMember(repo, essay!.containerId, r.instanceId);
    };
    add("test.second", "concept");
    add("test.third", "ui");
    const items = helpFor("essay", repo).slice(before);
    expect(items.map((i) => [i.featureId, i.placement])).toEqual([
      ["test.second", "concept"],
      ["test.third", "ui"],
    ]);
  });
});
