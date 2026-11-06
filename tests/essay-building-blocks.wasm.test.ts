// @vitest-environment node
/**
 * Essay 1.9.0's building blocks on the REAL engine (srs-web#590, decision fa685656): a new essay holds
 * sources, quotations and problems without the argument or governance packages, an agent files and links
 * them under the write guard, and an older essay gets them by upgrading.
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

async function engine() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-blocks.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "essay-blocks.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

describe.skipIf(!haveBindings)("essay building blocks on the real engine", () => {
  it("a writer's pick of an agent's record reads as kept, not as an agent's unanswered find (srs-web#754)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { installBundles } = await import("../src/lib/srs-client.js");
    const repo = (await engine()).SrsRepository.create(JSON.stringify({ title: "Kept" }));
    installBundles(repo, [ESSAY_PACKAGE_ID]);
    const essay = doc.newEssay(repo, "Kept");
    let m = doc.loadEssay(repo, essay);
    repo.set_actor(JSON.stringify({ kind: "ai", id: "agent:x", name: "X" }));
    const [id] = doc.addReferences(repo, m, { urls: ["https://example.org/agent-find"] });
    repo.set_actor(JSON.stringify({ kind: "human", id: "human:ada", name: "Ada" }));
    doc.removeReference(repo, m, id);
    m = doc.loadEssay(repo, essay);
    doc.addExistingReference(repo, m, id, true);
    expect(doc.loadEssay(repo, essay).references.find((r) => r.id === id)?.verdict).toBe("agree");
  });

  it("a new essay takes a dropped source, and an agent files and links all three under the guard", async () => {
    const BLOCKS = {
      source: "36e85cff-989b-4c6d-9361-3c8906cff87b",
      quotation: "00572b36-7e4f-4cc2-9de1-9eab16a496ef",
      problem: "6e955608-b469-4b8e-8855-5dccdb73fe11",
    };
    const doc = await import("../src/lib/essay/essay-document.js");
    const { installBundles, listTypes } = await import("../src/lib/srs-client.js");
    const mod = await engine();
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Blocks" }));
    installBundles(repo, [ESSAY_PACKAGE_ID]);

    const namespaces = new Set(listTypes(repo).map((t: { namespace: string }) => t.namespace));
    expect(namespaces).toContain("com.mudemocracy.argument"); // the moved types keep their namespace
    expect(namespaces).not.toContain("governance");
    const types = listTypes(repo).map((t: { name: string }) => t.name);
    expect(types).not.toContain("argument");
    expect(types).not.toContain("claim");

    const essayId = doc.newEssay(repo, "Blocks");
    let m = doc.loadEssay(repo, essayId);
    const p = doc.addParagraph(repo, m);
    doc.setBody(repo, p, "Writer's text.");
    m = doc.loadEssay(repo, essayId);

    // The writer: a dropped file, a link, and a context document
    const file = { name: "notes.md", bytes: new TextEncoder().encode("Some notes."), type: "text/markdown" };
    expect(doc.addReferences(repo, m, { files: [file], urls: ["https://x.org"] }, p)).toHaveLength(2);
    expect(doc.addReferences(repo, m, { texts: [{ title: "The call", body: "Apply here." }] }, undefined, true)).toHaveLength(1);

    // The agent, following the brief
    const session = repo.open_mcp_session();
    session.set_write_guard(JSON.stringify(doc.essayWriteGuard(m)));
    let n = 0;
    const rpc = (method: string, params?: unknown) =>
      JSON.parse(session.handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params })) ?? "null");
    rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    session.handle(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });
    const create = (type: string, fieldValues: unknown): string => {
      const res = tool("record_create", {
        type: `com.mudemocracy.argument/${type}`,
        containerId: m.referencesContainerId,
        fieldValues,
      });
      expect(res.result.isError, JSON.stringify(res)).not.toBe(true);
      const s = res.result.structuredContent;
      return s.instanceId ?? s.record.instanceId;
    };
    const link = (relationType: string, sourceInstanceId: string, targetInstanceId: string) => {
      const res = tool("relation_create", { relationType, sourceInstanceId, targetInstanceId });
      expect(res.result.isError, JSON.stringify(res)).not.toBe(true);
    };

    // The brief names each type and everything it requires, so an agent can follow it unaided.
    const brief = doc.agentHandoff({
      repositoryId: "r",
      essay: { id: essayId, title: "Blocks" },
      containerId: m.containerId,
      referencesContainerId: m.referencesContainerId,
    });
    for (const [name, typeId] of Object.entries(BLOCKS)) {
      expect(brief).toContain(`com.mudemocracy.argument/${name}`);
      const res = tool("type_schema", { typeId });
      expect(res.result.isError, JSON.stringify(res)).not.toBe(true);
      const body = res.result.structuredContent ?? JSON.parse(res.result.content[0].text);
      const required: string[] = (body.schema ?? body).required;
      expect(required.length).toBeGreaterThan(0);
      for (const field of required) expect(brief, `${name}.${field}`).toContain(field);
    }
    expect(brief).toContain("Document > Packages");
    expect(brief).not.toMatch(/source(,| or) claim/);

    const source = create("source", { title: "A book", source_kind: "book" });
    const quote = create("quotation", {
      title: "A line",
      quote_text: "Exact words.",
      locator: "p. 1",
      warrant_level: "secondary",
    });
    const problem = create("problem", {
      problem_id: "P-1",
      title: "A problem",
      statement: "Something is wrong.",
      kind: "condition",
      persona: "participant",
      scale: "group",
    });
    link("derived-from", quote, source);
    link("evidences", quote, p);
    link("com.mudemocracy.essay/counters", source, p);
    link("com.mudemocracy.essay/bears-on", p, problem);

    const edit = tool("record_update", { instanceId: p, fieldValues: { body: "Rewritten by agent." } });
    expect(edit.result.isError, JSON.stringify(edit)).toBe(true);

    expect(repo.validate().summary.errors).toBe(0);
    const again = mod.SrsRepository.load(repo.export_srsj());
    expect(again.validate().summary.errors).toBe(0);
    expect(doc.loadEssay(again, essayId).references.map((r: { id: string }) => r.id)).toEqual(
      expect.arrayContaining([source, quote, problem])
    );
  });

  it("an essay older than 1.9.0 says what to do, and has the types once upgraded", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { priorBundleEntries } = await import("../src/lib/packages/bundles.js");
    const { installBundles, upgradeBundles } = await import("../src/lib/srs-client.js");
    const mod = await engine();
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Older" }));
    installBundles(repo, ["9092f84e-fb94-4f81-a523-0f7ef5b02194"]);
    const old = priorBundleEntries(ESSAY_PACKAGE_ID).find((e) => e.version === "1.8.0");
    repo.install_package_bundle(old?.text as string, "{}");

    const essayId = doc.newEssay(repo, "Older");
    const m = doc.loadEssay(repo, essayId);
    expect(() => doc.addReferences(repo, m, { urls: ["https://x.org"] })).toThrow("Document > Packages");

    const [done] = upgradeBundles(repo, [ESSAY_PACKAGE_ID]);
    expect(done.conflicts).toEqual([]);
    expect(doc.addReferences(repo, doc.loadEssay(repo, essayId), { urls: ["https://x.org"] })).toHaveLength(1);
    expect(repo.validate().summary.errors).toBe(0);
  });
});
