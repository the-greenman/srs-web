// @vitest-environment node
/** The temporary record-duplication helper (srs-web#606/#607) on the REAL engine. */
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "record-duplication.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "record-duplication.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

describe.skipIf(!haveBindings)("duplicateRecord on the real engine", () => {
  it("copies values and meta, links derived-from, and recreates only incident edges", async () => {
    const { duplicateRecord } = await import("../src/lib/record-duplication.js");
    const c = await import("../src/lib/srs-client.js");
    const fixture = readFileSync(path.join(__dirname, "../e2e/fixtures/essay-domain.srsj"), "utf8");
    const repo = (await engine()).SrsRepository.load(fixture);

    const edge = c.listRelations(repo).find((r) => r.relationType !== "contains")!;
    const other = c
      .listRelations(repo)
      .find(
        (r) =>
          r.sourceInstanceId !== edge.sourceInstanceId &&
          r.targetInstanceId !== edge.sourceInstanceId
      )!;
    const id = edge.sourceInstanceId;
    const before = c.getRecord(repo, id)!;
    repo.update_record(
      id,
      JSON.stringify({ fieldValues: before.fieldValues, meta: { mark: [1] } })
    );
    const source = c.getRecord(repo, id)!;

    const relations = [edge, other].map((r) => ({
      relationType: r.relationType,
      sourceId: r.sourceInstanceId,
      targetId: r.targetInstanceId,
    }));
    const dup = duplicateRecord(repo, source, { relations });
    const copy = c.getRecord(repo, dup.record.instanceId)!;

    expect(copy.instanceId).not.toBe(id);
    expect(copy.fieldValues).toEqual(source.fieldValues);
    expect(copy.meta).toEqual({ mark: [1] });
    expect(dup.relation).toMatchObject({
      relationType: "derived-from",
      sourceInstanceId: copy.instanceId,
      targetInstanceId: id,
    });
    // `other` is not incident on the source, so it is skipped.
    expect(
      dup.copiedRelations.map((r) => [r.relationType, r.sourceInstanceId, r.targetInstanceId])
    ).toEqual([[edge.relationType, copy.instanceId, edge.targetInstanceId]]);
    expect(c.getRecord(repo, id)!.fieldValues).toEqual(source.fieldValues);
    const errors = repo
      .validate()
      .diagnostics.filter((d: { severity: string }) => d.severity === "error");
    expect(errors).toEqual([]);
  });
});
