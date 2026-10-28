// @vitest-environment node
/**
 * Narrative affirmation against the REAL engine (srs-web#622): method.srsj holds one conversation (an
 * identity note tagged `conversation`, two vignettes). The view lists it, keeps the vignettes in outline
 * order with the owner's words, and shows each record derived from a vignette with its layer; a tick forks
 * a derived problem into Affirmed and the view then shows it affirmed, with no act left.
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

async function engine() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "narrative.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "narrative.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}
const fixture = () => readFileSync(path.join(__dirname, "../e2e/fixtures/method.srsj"), "utf8");

describe.skipIf(!haveBindings)("narrative affirmation on the real engine", () => {
  it("lists the conversation, keeps vignette order and words, affirms a derived problem", async () => {
    const { listConversations, loadConversation } = await import("../src/lib/method/narrative.js");
    const { affirmRecord, loadMethod } = await import("../src/lib/method/method-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    repo.set_actor(JSON.stringify({ kind: "human", id: "local:owner" }));

    const [c] = listConversations(repo);
    expect(c.title).toBe("2026-10-28 · Suggestions nobody reads");
    const vs = loadConversation(repo, c.containerId, loadMethod(repo));
    expect(vs.map((v) => v.title)).toEqual(["Suggestions pile up", "Who holds the line"]);
    expect(vs[0].words).toBe("The agents keep suggesting things and nobody reads the queue.");
    expect(vs[0].derived.map((d) => [d.typeName, d.entity, d.layer]).sort()).toEqual([
      ["problem", "problem", "suggested"],
      ["remedy", "remedy", "suggested"],
    ]);
    expect(vs[1].derived.map((d) => [d.typeName, d.entity])).toEqual([["tension", undefined]]);

    const p = vs[0].derived.find((d) => d.typeName === "problem")!;
    affirmRecord(repo, loadMethod(repo), p.id, "problem");
    const after = loadConversation(repo, c.containerId, loadMethod(repo))[0].derived.find((d) => d.id === p.id)!;
    expect(after).toMatchObject({ layer: "affirmed", entity: undefined });
    expect(repo.validate().summary.errors).toBe(0);
  });
});
