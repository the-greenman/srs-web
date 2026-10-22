// @vitest-environment node
/** Writer undo / redo (srs-web#570) against the REAL engine, as in essay-new.wasm.test.ts. */
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

describe.skipIf(!haveBindings)("essay history on the real engine", () => {
  async function setup() {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { EssayHistory, snapshotEssay } = await import("../src/lib/essay/essay-history.js");
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-history.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-history.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/essay-empty.srsj"), "utf8")
    );
    const essayId = doc.newEssay(repo, "History");
    const history = new EssayHistory();
    const load = () => doc.loadEssay(repo, essayId);
    const refs = () => {
      const m = load();
      return { essayId, containerId: m.containerId, stateId: m.stateId };
    };
    /** Run one writer edit the way the shell does: snapshot, edit, snapshot, remember. */
    const edit = (fn: () => void) => {
      const before = snapshotEssay(repo, refs());
      fn();
      history.push(before, snapshotEssay(repo, refs()));
    };
    const state = () => JSON.stringify(snapshotEssay(repo, refs()));
    return { doc, repo, history, load, edit, state };
  }

  it("undoes and redoes text, add, hide, move and bin, restoring the records exactly", async () => {
    const { doc, repo, history, load, edit, state } = await setup();
    let a = "";
    let b = "";
    edit(() => {
      a = doc.addParagraph(repo, load());
    });
    edit(() => {
      b = doc.addParagraph(repo, load());
    });
    edit(() => doc.setBody(repo, a, "first"));
    edit(() => doc.setBody(repo, b, "second"));
    const afterText = state();

    edit(() => doc.setBody(repo, a, "changed"));
    expect(history.undo(repo)).toBe(true);
    expect(state()).toBe(afterText);
    expect(history.redo(repo)).toBe(true);
    expect(load().paragraphs[a].body).toBe("changed");
    history.undo(repo);

    edit(() => doc.setHidden(repo, load(), a, true));
    expect(load().hidden).toContain(a);
    history.undo(repo);
    expect(state()).toBe(afterText);

    edit(() => doc.shiftEntry(repo, load().containerId, b, "up"));
    expect(load().entries.map((e) => e.instanceId)).toEqual([b, a]);
    history.undo(repo);
    expect(state()).toBe(afterText);
    history.redo(repo);
    expect(load().entries.map((e) => e.instanceId)).toEqual([b, a]);
    history.undo(repo);

    edit(() => doc.binParagraph(repo, load(), a));
    expect(load().entries.map((e) => e.instanceId)).toEqual([b]);
    history.undo(repo);
    expect(load().entries.map((e) => e.instanceId)).toEqual([a, b]);
    expect(load().paragraphs[a].body).toBe("first");
    history.redo(repo);
    expect(load().entries.map((e) => e.instanceId)).toEqual([b]);
    history.undo(repo);

    // Undo all the way back to the empty essay, then all the way forward again.
    while (history.canUndo) history.undo(repo);
    expect(load().entries).toEqual([]);
    while (history.canRedo) history.redo(repo);
    // The last remembered edit was the bin, so it is redone too: `a` is back in the Bin with its text.
    expect(load().entries.length).toBe(1);
    expect(load().binEntries.length).toBe(1);
    expect(
      Object.values(load().paragraphs)
        .map((p) => p.body)
        .sort()
    ).toEqual(["first", "second"]);
    expect(doc.listEssays(repo).length).toBe(1);
  });

  it("keeps nesting, ignores a no-op, and a new edit ends the redo line", async () => {
    const { doc, repo, history, load, edit } = await setup();
    let a = "";
    let b = "";
    edit(() => {
      a = doc.addParagraph(repo, load());
    });
    edit(() => {
      b = doc.addParagraph(repo, load());
    });
    edit(() => doc.shiftEntry(repo, load().containerId, b, "indent"));
    expect(load().entries.find((e) => e.instanceId === b)?.depth).toBe(1);
    history.undo(repo);
    expect(load().entries.find((e) => e.instanceId === b)?.depth).toBe(0);
    history.redo(repo);
    expect(load().entries.find((e) => e.instanceId === b)?.depth).toBe(1);

    const depth = history.canUndo;
    edit(() => {}); // nothing changed: not remembered
    expect(history.canUndo).toBe(depth);

    history.undo(repo);
    expect(history.canRedo).toBe(true);
    edit(() => doc.setBody(repo, a, "new"));
    expect(history.canRedo).toBe(false);
  });

  it("leaves an agent's comment alone when the writer undoes", async () => {
    const { doc, repo, history, load, edit } = await setup();
    const { addComment } = await import("../src/lib/comments.js");
    let a = "";
    edit(() => {
      a = doc.addParagraph(repo, load());
    });
    edit(() => doc.setBody(repo, a, "text"));
    addComment(repo, a, "an agent remark", load().commentsContainerId);
    expect(load().comments[a]?.length).toBe(1);
    history.undo(repo);
    expect(load().paragraphs[a].body).toBe("");
    expect(load().comments[a]?.length).toBe(1);
  });

  it("document history brings a record back with its own type, not as a paragraph (#602)", async () => {
    const { repo } = await setup();
    const { DocumentHistory, snapshotDocument } = await import("../src/lib/document.js");
    const client = await import("../src/lib/srs-client.js");
    const { ESSAY_TYPE_ID } = await import("../src/lib/essay/type-registry.js");
    const { typeVersion } = await import("../src/lib/type-version.js");
    const page = client.createContainer(repo, { title: "A page" }).containerId;
    const block = client.createRecord(repo, ESSAY_TYPE_ID, typeVersion(repo, ESSAY_TYPE_ID), {
      fieldValues: { title: "Not a paragraph" },
    }).instanceId;
    client.addContainerMember(repo, page, block);
    const history = new DocumentHistory();
    const before = snapshotDocument(repo, [page]);
    client.removeContainerMember(repo, page, block);
    client.deleteRecord(repo, block, true);
    history.push(before, snapshotDocument(repo, [page]));

    expect(history.undo(repo)).toBe(true);
    const [back] = client.getContainerOutline(repo, page).body;
    const rec = client.getRecord(repo, back.instanceId);
    expect(rec?.typeId).toBe(ESSAY_TYPE_ID);
    expect(rec?.fieldValues.title).toBe("Not a paragraph");
  });
});
