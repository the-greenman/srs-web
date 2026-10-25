// @vitest-environment node
/**
 * Who wrote a paragraph, against the REAL engine (srs-web#618): a write made after the writer gave a
 * name carries that human `createdBy`; the engine stamps it from the session actor, the UI never sends it.
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

describe.skipIf(!haveBindings)("essay paragraph author on the real engine", () => {
  it("a paragraph written after the name is saved carries that human createdBy", async () => {
    const { addParagraph, loadEssay, newEssay } = await import("../src/lib/essay/essay-document.js");
    const { getRecord } = await import("../src/lib/srs-client.js");
    const { applyActor, saveLocalName } = await import("../src/lib/actor.js");
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage;

    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-author.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-author.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
    );

    const actor = saveLocalName("Ada");
    expect(actor).not.toBeNull();
    applyActor(repo);
    const essayId = newEssay(repo, "Mine");
    const model = loadEssay(repo, essayId);
    const paragraphId = addParagraph(repo, model!);

    expect(getRecord(repo, paragraphId)?.createdBy).toEqual(actor);
    expect(getRecord(repo, paragraphId)?.createdBy?.kind).toBe("human");
  });
});
