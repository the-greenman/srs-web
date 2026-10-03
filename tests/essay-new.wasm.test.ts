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

describe.skipIf(!haveBindings)("write observation on the real engine (srs-web#345)", () => {
  it("a deferred write (the essay's 400 ms typing commit) marks the document dirty with no further gesture", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { observeWrites, listRecords } = await import("../src/lib/srs-client.js");
    const { DocumentMutationTracker } = await import("../src/lib/document-mutations.js");
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "real.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "real.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const raw = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
    );
    const p = doc.addParagraph(raw, doc.loadEssay(raw, doc.newEssay(raw, "E")));

    // App's wiring: the tracker observes the engine epoch whenever the handle reports a write.
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument(raw.write_epoch());
    let notified = 0;
    const repo = observeWrites(raw, () => {
      notified++;
      tracker.sync(raw.write_epoch());
    });

    listRecords(repo, {}); // reads never notify
    await Promise.resolve();
    expect(notified).toBe(0);

    await new Promise<void>((resolve) =>
      setTimeout(() => {
        doc.setBody(repo, p, "typed");
        resolve();
      }, 400)
    );
    await Promise.resolve(); // the notification is a microtask, not a later gesture
    expect(notified).toBe(1);
    expect(tracker.dirty).toBe(true);
  });
});

describe.skipIf(!haveBindings)("paragraph attachments on the real engine (context_record)", () => {
  it("attachments are non-comment, non-paragraph neighbours in both directions; live after a write", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { COMMENT_TYPE_ID } = await import("../src/lib/essay/type-registry.js");
    const { createRecord, createRelation, listTypes, updateRecord } = await import(
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
    const a = doc.addParagraph(repo, doc.loadEssay(repo, essayId));
    const b = doc.addParagraph(repo, doc.loadEssay(repo, essayId));
    expect(doc.loadEssay(repo, essayId).attachments).toEqual({});

    const v = listTypes(repo).find((t) => t.id === COMMENT_TYPE_ID)?.version ?? 1;
    const mk = (text: string) =>
      createRecord(repo, COMMENT_TYPE_ID, v, { fieldValues: { comment_text: text } }).instanceId;
    const x = mk("a counter-claim");
    createRelation(repo, { relationType: "evidences", sourceInstanceId: x, targetInstanceId: a });
    const y = mk("a source");
    createRelation(repo, { relationType: "refines", sourceInstanceId: a, targetInstanceId: y });
    doc.addComment(repo, a, "just a comment"); // comments-on: the thread's, never a glyph
    createRelation(repo, { relationType: "precedes", sourceInstanceId: a, targetInstanceId: b });

    expect(Object.keys(doc.loadEssay(repo, essayId).attachments)).toEqual([a]);
    // An in-place edit of an attached record (no relation change) refreshes the glyph text.
    updateRecord(repo, x, { fieldValues: { comment_text: "edited counter-claim" } });
    expect(doc.loadEssay(repo, essayId).attachments[a].find((r) => r.neighbourId === x)?.text).toBe(
      "edited counter-claim"
    );
    const att = doc.loadEssay(repo, essayId).attachments;
    // Paragraph-to-paragraph: precedes (structural) is dropped by core category; derived-from shows both ways.
    expect(doc.loadEssay(repo, essayId).related).toEqual({});
    createRelation(repo, {
      relationType: "derived-from",
      sourceInstanceId: b,
      targetInstanceId: a,
    });
    const rel = doc.loadEssay(repo, essayId).related;
    expect(rel[b].map((r) => [r.relationType, r.direction, r.otherId])).toEqual([
      ["derived-from", "out", a],
    ]);
    expect(rel[a].map((r) => [r.relationType, r.direction, r.otherId])).toEqual([
      ["derived-from", "in", b],
    ]);
    expect(att[a].map((r) => [r.relationType, r.direction, r.neighbourId, r.text]).sort()).toEqual(
      [
        ["evidences", "in", x, "edited counter-claim"],
        ["refines", "out", y, "a source"],
      ].sort()
    );
  });
});

describe.skipIf(!haveBindings)(
  "many documents on the real engine (copy, shared, make local copy)",
  () => {
    it("copy shares paragraphs and forks the title; make-local-copy forks one paragraph here only", async () => {
      const doc = await import("../src/lib/essay/essay-document.js");
      const { listRecords } = await import("../src/lib/srs-client.js");
      const { PARAGRAPH_TYPE_ID } = await import("../src/lib/essay/type-registry.js");
      const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
      mkdirSync(dir, { recursive: true });
      copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "real.mjs"));
      const mod = await import(/* @vite-ignore */ path.join(dir, "real.mjs"));
      mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
      const repo = mod.SrsRepository.load(
        readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
      );
      const aId = doc.newEssay(repo, "A");
      const p = doc.addParagraph(repo, doc.loadEssay(repo, aId));
      const q = doc.addParagraph(repo, doc.loadEssay(repo, aId));
      const paragraphs = () =>
        listRecords(repo, {}).filter((r) => r.typeId === PARAGRAPH_TYPE_ID).length;
      expect(doc.loadEssay(repo, aId).sharedIn).toEqual({});

      const bId = doc.copyEssay(repo, doc.loadEssay(repo, aId));
      expect(bId).not.toBe(aId);
      expect(paragraphs()).toBe(2); // a copy duplicates no paragraph records
      expect(
        doc
          .listEssays(repo)
          .map((e) => e.title)
          .sort()
      ).toEqual(["A", "Copy of A"]);
      const b = doc.loadEssay(repo, bId);
      expect(b.entries.map((e) => e.instanceId)).toEqual([p, q]);
      expect(b.stateId).not.toBeNull(); // fresh editor state, like a new essay
      expect(b.draftContainerId).not.toBeNull();
      expect(b.draftContainerId).not.toBe(doc.loadEssay(repo, aId).draftContainerId);
      expect(Object.keys(b.sharedIn).sort()).toEqual([p, q].sort());
      expect(b.sharedIn[p].map((e) => e.id)).toEqual([aId]);
      expect(doc.loadEssay(repo, aId).sharedIn[p].map((e) => e.id)).toEqual([bId]);

      // Rename (srs-web#380): the essay record, its container and its draft container follow.
      doc.setEssayTitle(repo, b, "Renamed");
      const { getContainer: gc } = await import("../src/lib/srs-client.js");
      const renamed = doc.loadEssay(repo, bId);
      expect(renamed.title).toBe("Renamed");
      expect(gc(repo, renamed.containerId).title).toBe("Renamed");
      expect(gc(repo, renamed.draftContainerId as string).title).toBe("Renamed (draft)");

      doc.setHidden(repo, doc.loadEssay(repo, bId), p, true);
      doc.makeLocalCopy(repo, doc.loadEssay(repo, bId), p);
      expect(paragraphs()).toBe(3);
      const b2 = doc.loadEssay(repo, bId);
      const a2 = doc.loadEssay(repo, aId);
      expect(b2.entries.length).toBe(2);
      expect(b2.sharedIn[p]).toBeUndefined();
      const forkId = b2.entries.map((e) => e.instanceId).find((id) => id !== q) as string;
      expect(b2.hidden).toEqual([forkId]); // hidden stays hidden, as the fork (not the original id)
      expect(a2.entries.map((e) => e.instanceId)).toEqual([p, q]); // the other document is unchanged
      expect(Object.keys(a2.sharedIn)).toEqual([q]);
      const fork = b2.entries.map((e) => e.instanceId).find((id) => id !== q) as string;
      expect(b2.related[fork]?.map((r) => [r.relationType, r.direction, r.otherId])).toEqual([
        ["derived-from", "out", p],
      ]);
      const report = repo.validate();
      expect(report.summary.errors).toBe(0);
    });
  }
);
