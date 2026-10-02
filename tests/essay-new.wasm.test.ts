// @vitest-environment node
/**
 * New essay against the REAL engine (the default test config stubs the WASM bindings, so the
 * generated JS is copied to node_modules/.cache the stub does not match). Reads go through srs-client.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");

// Skipped locally when the generated bindings are absent (a downloaded build artifact); in CI absence fails.
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}
describe.skipIf(!haveBindings)("newEssay on the real engine", () => {
  it("stores essay record, anchored container, draft container and state; validates clean", async () => {
    // dynamic: srs-client statically imports generated bindings assets absent without the download
    const { newEssay } = await import("../src/lib/essay/essay-document.js");
    const { DOCUMENT_STATE_TYPE_ID, ESSAY_TYPE_ID } = await import(
      "../src/lib/essay/type-registry.js"
    );
    const { getContainer, getContainerArrangement, listContainers, listRecords } = await import(
      "../src/lib/srs-client.js"
    );
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "real.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "real.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
    );

    const e0 = repo.write_epoch();
    const essayId = newEssay(repo, "My essay");
    const e1 = repo.write_epoch();
    expect(e1).toBeGreaterThan(e0); // a write moves the engine epoch (srs-web#345)
    listRecords(repo, {});
    expect(repo.write_epoch()).toBe(e1); // reads do not: a no-op action is never "dirty"

    const essay = listRecords(repo, {}).find((r) => r.typeId === ESSAY_TYPE_ID);
    expect(essay?.instanceId).toBe(essayId);
    const [summary] = listContainers(repo, { anchorInstanceId: essayId });
    const container = getContainer(repo, summary.containerId);
    expect(container.anchorInstanceId).toBe(essayId);
    expect(container.identityInstanceId).toBe(essayId);
    const [first] = getContainerArrangement(repo, summary.containerId);
    expect(first.instanceId).toBe(essayId);
    expect(first.depth ?? 0).toBe(0);

    const state = listRecords(repo, {}).find((r) => r.typeId === DOCUMENT_STATE_TYPE_ID);
    expect(state?.fieldValues.essay).toBe(essayId);
    const draftId = state?.fieldValues.draft_container_id as string;
    expect(listContainers(repo, {}).some((c) => c.containerId === draftId)).toBe(true);
    expect(getContainer(repo, draftId).containerId).toBe(draftId);

    const report = repo.validate();
    expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(report.summary.errors).toBe(0);
  });
});

describe.skipIf(!haveBindings)("essay gestures on the real engine (core relative ops)", () => {
  it("drop / shift / insert-after resolve in the core; illegal targets throw an Error", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { getContainerOutline, moveContainerMemberRelative } = await import(
      "../src/lib/srs-client.js"
    );
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "real.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "real.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
    );
    const essayId = doc.newEssay(repo, "E");
    let m = doc.loadEssay(repo, essayId);
    const a = doc.addParagraph(repo, m);
    const b = doc.addParagraph(repo, m);
    const c = doc.addParagraph(repo, m);
    const order = () =>
      doc.loadEssay(repo, essayId).entries.map((e) => `${e.instanceId}:${e.depth}`);
    expect(order()).toEqual([`${a}:0`, `${b}:0`, `${c}:0`]);

    doc.shiftEntry(repo, m.containerId, b, "indent"); // under a
    expect(order()).toEqual([`${a}:0`, `${b}:1`, `${c}:0`]);
    expect(doc.loadEssay(repo, essayId).entries[1].parentInstanceId).toBe(a);
    doc.shiftEntry(repo, m.containerId, a, "up"); // clamped no-op
    expect(order()).toEqual([`${a}:0`, `${b}:1`, `${c}:0`]);

    doc.moveEntry(repo, m.containerId, c, { id: a, zone: "before" });
    expect(order()).toEqual([`${c}:0`, `${a}:0`, `${b}:1`]);
    doc.moveEntry(repo, m.containerId, c, { id: null, zone: "after" }); // to the end
    expect(order()).toEqual([`${a}:0`, `${b}:1`, `${c}:0`]);

    const d = doc.addParagraph(repo, m, { id: a, zone: "after" }); // past a's run
    expect(order()).toEqual([`${a}:0`, `${b}:1`, `${d}:0`, `${c}:0`]);

    m = doc.loadEssay(repo, essayId);
    expect(() => doc.moveEntry(repo, m.containerId, a, { id: b, zone: "after" })).toThrow(Error);
    expect(() =>
      moveContainerMemberRelative(repo, m.containerId, a, {
        relativeTo: "no-such-entry",
        placement: "after",
      })
    ).toThrow(Error); // unknown target
    expect(getContainerOutline(repo, m.containerId).body.length).toBe(4);
  });
});
