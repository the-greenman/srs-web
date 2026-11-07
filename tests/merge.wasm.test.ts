// @vitest-environment node
/** Merge changes from a file (srs-web#733) on the REAL engine: what is new, what is left out, and an apply of the ticks. */
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "merge.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "merge.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

const ACTOR = JSON.stringify({ kind: "human", id: "human:test" });

describe.skipIf(!haveBindings)("merge from a file on the real engine", () => {
  it("lists new items and changed ones, and brings in only the ticked items and the links they can carry", async () => {
    const m = await import("../src/lib/merge.js");
    const c = await import("../src/lib/srs-client.js");
    const { SrsRepository } = await engine();
    const fixture = readFileSync(path.join(__dirname, "../e2e/fixtures/gallery.srsj"), "utf8");
    const target = SrsRepository.load(fixture);
    const source = SrsRepository.load(fixture);
    source.set_actor(ACTOR);

    const [first, second] = c.listRecords(source);
    const kept = c.createRecord(source, first.typeId, first.typeVersion, { fieldValues: first.fieldValues });
    const dropped = c.createRecord(source, second.typeId, second.typeVersion, { fieldValues: second.fieldValues });
    c.createRelation(source, { relationType: "refines", sourceInstanceId: kept.instanceId, targetInstanceId: dropped.instanceId });
    c.createRelation(source, { relationType: "refines", sourceInstanceId: kept.instanceId, targetInstanceId: first.instanceId });
    c.updateRecord(source, second.instanceId, { fieldValues: { ...second.fieldValues, title: "Changed over there" } });
    const archive = source.export_archive();

    const report = m.previewMerge(target, archive);
    expect(m.mergeChoices(report).map((x) => x.id).sort()).toEqual([kept.instanceId, dropped.instanceId].sort());
    expect(m.leftOut(report, () => "Second")).toEqual([
      expect.objectContaining({ id: second.instanceId, title: "Second", why: expect.stringContaining("both copies") }),
    ]);

    const before = target.write_epoch();
    m.applyMerge(target, archive, report, new Set([kept.instanceId]));
    expect(target.write_epoch()).not.toBe(before);
    expect(c.getRecordOrNull(target, kept.instanceId)?.createdBy).toEqual({ kind: "human", id: "human:test" });
    expect(c.getRecordOrNull(target, dropped.instanceId)).toBeNull();
    const links = c.listRelations(target).filter((r) => r.sourceInstanceId === kept.instanceId);
    expect(links.map((r) => r.targetInstanceId)).toEqual([first.instanceId]);
    expect(c.getRecord(target, second.instanceId)?.fieldValues.title).not.toBe("Changed over there");
  });

  it("refuses a copy of another repository with the engine's code and writes nothing", async () => {
    const m = await import("../src/lib/merge.js");
    const { SrsRepository } = await engine();
    const target = SrsRepository.load(readFileSync(path.join(__dirname, "../e2e/fixtures/gallery.srsj"), "utf8"));
    const other = SrsRepository.load(readFileSync(path.join(__dirname, "../e2e/fixtures/essay-domain.srsj"), "utf8"));
    const before = target.write_epoch();
    expect(() => m.previewMerge(target, other.export_archive())).toThrow(expect.objectContaining({ code: "merge-repository-mismatch" }));
    expect(target.write_epoch()).toBe(before);
  });
});
