// @vitest-environment node
/**
 * Comment kinds and task responses on the REAL engine (srs-web#591, ruling ff946eb1): a task written
 * with a kind, settled, reopened and rejected with a reason by the writer's response comments, reads
 * back the same after an export and reload, and an agent sees the kind and the responses over MCP.
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
const ESSAY_PACKAGE_ID = "5b14a4d4-ec08-4e5b-be75-c183aec90c40";

describe.skipIf(!haveBindings)("comment kinds and task responses on the real engine", () => {
  it("writes a task, settles, reopens and rejects it, and reloads the same state", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { addComment, kindsAvailable, loadComments } = await import("../src/lib/comments.js");
    const { respond } = await import("../src/lib/link-proposals.js");
    const { installBundles, listTypes, repositoryId } = await import("../src/lib/srs-client.js");
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "comment-kinds.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "comment-kinds.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Kinds" }));
    installBundles(repo, [ESSAY_PACKAGE_ID]); // essay 1.8.0 brings comments 1.1.0 with it
    expect(kindsAvailable(repo)).toBe(true);

    const essayId = doc.newEssay(repo, "Typed");
    let m = doc.loadEssay(repo, essayId);
    const p = doc.addParagraph(repo, m);
    doc.setBody(repo, p, "Writer's text.");
    m = doc.loadEssay(repo, essayId);
    const box = m.commentsContainerId;
    expect(box).toBeTruthy();

    addComment(repo, p, "Which year?", box, "question");
    addComment(repo, p, "Cite the budget sheet.", box, "task");
    const thread = () => loadComments(repo, listTypes(repo))[p];
    const task = () => thread().find((c) => c.kind === "task")!;
    expect(thread().map((c) => c.kind)).toEqual(["question", "task"]);
    expect(task().task).toEqual({ state: "open" });

    respond(repo, task().id, "done", "", box);
    expect(task().task?.state).toBe("done");
    respond(repo, task().id, "withdrawn", "", box);
    expect(task().task?.state).toBe("open");
    respond(repo, task().id, "rejected", "Out of scope.", box);
    expect(task().task).toMatchObject({ state: "rejected", reason: "Out of scope." });
    expect(thread()).toHaveLength(2); // responses never join the paragraph's thread
    expect(repo.validate().summary.errors).toBe(0);

    const again = mod.SrsRepository.load(repo.export_srsj());
    const back = loadComments(again, listTypes(again))[p].find((c) => c.kind === "task")!;
    expect(back.task).toMatchObject({ state: "rejected", reason: "Out of scope." });
    // every response is filed with the essay's comments
    const outline = again.get_container_outline(box);
    expect(JSON.stringify(outline).match(/instanceId/g)?.length).toBeGreaterThanOrEqual(5);

    // an agent reads the task's kind and the writer's responses in the comment's context
    const session = again.open_mcp_session();
    let n = 0;
    const rpc = (method: string, params?: unknown) =>
      JSON.parse(
        session.handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params })) ?? "null"
      );
    rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t", version: "0" },
    });
    session.handle(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    const read = rpc("resources/read", {
      uri: `srs://${repositoryId(again)}/context/${box}/${back.id}`,
    });
    const text = read?.result?.contents?.[0]?.text ?? "";
    expect(text).toContain('"task"');
    expect(text).toContain('"rejected"');
    expect(text).toContain("Out of scope.");
  });
});
