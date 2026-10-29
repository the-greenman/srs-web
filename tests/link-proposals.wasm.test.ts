// @vitest-environment node
/**
 * Link proposals against the REAL engine (srs-web#617): method.srsj carries comments 1.1.0 and one agent's
 * proposal on SP-1. The proposal loads with its target, a tick from the owner writes an `agree` response at
 * the newest comment version, a second tick clears it (`withdrawn`), the plain thread does not show the
 * proposal, and the repository still validates clean.
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "link-proposals.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "link-proposals.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}
const fixture = () => readFileSync(path.join(__dirname, "../e2e/fixtures/method.srsj"), "utf8");

describe.skipIf(!haveBindings)("link proposals on the real engine", () => {
  it("loads the proposal, ticks it, clears it, keeps it out of the thread, validates clean", async () => {
    const { listRecords, listTypes } = await import("../src/lib/srs-client.js");
    const { loadProposals, respond } = await import("../src/lib/link-proposals.js");
    const { loadInstanceNotes } = await import("../src/lib/instance-notes.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const owner = { kind: "human", id: "human:owner" };
    repo.set_actor(JSON.stringify(owner));
    const sp1 = listRecords(repo, {}).find((r) => r.fieldValues.problem_id === "SP-1");
    expect(sp1).toBeTruthy();
    const id = sp1!.instanceId;

    const [p] = loadProposals(repo, listTypes(repo), id);
    expect(p).toMatchObject({ relationType: "com.semanticops.method/held-by", answers: {} });
    expect(p.author?.id).toBe("agent:analyst");
    const notes = loadInstanceNotes(repo, id);
    expect(notes.proposals.map((x) => x.targetLabel)).toEqual(["Owner"]);
    expect(notes.comments.some((c) => c.id === p.id)).toBe(false);

    respond(repo, p.id, "agree");
    expect(loadProposals(repo, listTypes(repo), id)[0].answers).toEqual({ "human:owner": "agree" });
    const tick = listRecords(repo, {}).find(
      (r) => r.fieldValues.kind === "agree" && r.createdBy?.id === "human:owner"
    );
    expect(tick?.typeVersion).toBe(2);

    respond(repo, p.id, "withdrawn");
    expect(loadProposals(repo, listTypes(repo), id)[0].answers).toEqual({});
    expect(repo.validate().summary.errors).toBe(0);
  });
});
