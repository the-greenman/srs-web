// @vitest-environment node
/**
 * The essay write guard against the REAL engine (srs-web#494): with a snapshot bundle present (its
 * children include the comments and references containers) an agent session can still file a comment
 * into the comments container, and still cannot edit a paragraph body.
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

describe.skipIf(!haveBindings)("essayWriteGuard on the real engine", () => {
  it("lets an agent file a comment into the comments container but refuses a paragraph body edit, bundle or not", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { bundledPackage } = await import("../src/lib/packages/bundles.js");
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-guard.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-guard.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(bindings, "governance-seed.srsj"), "utf8")
    );
    // a repository without the essay package, then the bundled 1.7.0 installed as the editor does
    repo.install_package_bundle(bundledPackage(ESSAY_PACKAGE_ID) as string, "{}");

    const essayId = doc.newEssay(repo, "Guarded");
    let m = doc.loadEssay(repo, essayId);
    expect(m.commentsContainerId, "essay package 1.7.0 installed").toBeTruthy();
    const p = doc.addParagraph(repo, m);
    doc.setBody(repo, p, "Writer's text.");
    m = doc.loadEssay(repo, essayId);
    doc.refreshBundle(repo, m); // the bundle now has the comments and references containers as children
    m = doc.loadEssay(repo, essayId);
    expect(m.bundleContainerId).toBeTruthy();

    const session = repo.open_mcp_session();
    session.set_write_guard(JSON.stringify(doc.essayWriteGuard(m)));
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
    const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });

    const edit = tool("record_update", {
      instanceId: p,
      fieldValues: { body: "Rewritten by agent." },
    });
    expect(edit.result.isError, JSON.stringify(edit)).toBe(true);
    expect(JSON.stringify(edit)).toContain("Rejected by the session write guard");

    const comment = tool("record_create", {
      type: "com.mudemocracy.essay/comment",
      containerId: m.commentsContainerId,
      fieldValues: { comment_text: "Consider rephrasing." },
    });
    expect(comment.error, JSON.stringify(comment)).toBeUndefined();
    expect(comment.result.isError, JSON.stringify(comment)).not.toBe(true);
  });
});
