// @vitest-environment node
/**
 * Essay references pool against the REAL engine (srs-web#519): files and URLs become `source` records in
 * the references container, a drop on a paragraph also evidences it, the attached text reads back, and a
 * tree with an attachment survives exportTree -> load_tree (the GitHub exploded-tree save path).
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-references.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "essay-references.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}
const fixture = () => readFileSync(path.join(__dirname, "../e2e/fixtures/essay-pool.srsj"), "utf8");

describe.skipIf(!haveBindings)("references pool on the real engine", () => {
  it("reads the core attachment policy and counts attached bytes, not the whole repository (#234)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const client = await import("../src/lib/srs-client.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    expect(client.attachmentPolicy(repo)).toEqual({ policyRecordPresent: false });
    const before = client.attachedBytes(repo);
    const bytes = new TextEncoder().encode("# Notes\n");
    doc.addReferences(repo, m, { files: [{ name: "notes.md", type: "text/markdown", bytes }] });
    expect(client.attachedBytes(repo)).toBe(before + bytes.length);
    expect(client.attachedBytes(repo)).toBeLessThan(doc.repoBytes(repo));
  });
  it("adds files and URLs as sources, links them to a paragraph, reads the text back, validates clean", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    expect(m.referencesContainerId).toBeTruthy();
    const before = m.references.length;
    const p1 = Object.keys(m.paragraphs)[0];
    const bytes = new TextEncoder().encode("# Call notes\nWe agreed to meet.\n");

    const [pooled] = doc.addReferences(repo, m, {
      files: [{ name: "call-transcript.md", type: "text/markdown", bytes }],
    });
    const [linked] = doc.addReferences(repo, m, { urls: ["https://example.org/paper"] }, p1);
    doc.linkReference(repo, pooled, p1); // later, from the tray

    const after = doc.loadEssay(repo, m.essayId);
    expect(after.references).toHaveLength(before + 2);
    const file = after.references.find((r) => r.id === pooled);
    expect(file).toMatchObject({
      label: "call-transcript.md",
      kind: "transcript",
      paragraphIds: [p1],
    });
    const web = after.references.find((r) => r.id === linked);
    expect(web).toMatchObject({
      kind: "web",
      url: "https://example.org/paper",
      paragraphIds: [p1],
    });
    // the hover card previews the attached text; the pinned pane reads all of it
    expect(after.attachments[p1].find((a) => a.neighbourId === pooled)?.text).toContain(
      "We agreed to meet."
    );
    expect(doc.referenceText(repo, pooled)).toBe("# Call notes\nWe agreed to meet.\n");
    expect(doc.referenceText(repo, linked)).toBe("");
    expect(doc.repoBytes(repo)).toBeGreaterThan(bytes.length);

    const report = repo.validate();
    expect(report.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual(
      []
    );
  });

  it("context documents are kept apart: pasted text reads back from the record, a URL is marked context, validates clean", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    const before = m.references.filter((r) => r.context).length;
    const [url, pasted] = doc.addContextDocuments(repo, m, {
      texts: [{ title: "Funding call", body: "Applicants must show a working prototype." }],
      urls: ["https://example.org/call"],
    });
    const after = doc.loadEssay(repo, m.essayId);
    expect(after.references.filter((r) => r.context)).toHaveLength(before + 2);
    expect(after.references.find((r) => r.id === pasted)).toMatchObject({
      label: "Funding call",
      context: true,
      text: expect.stringContaining("working prototype"),
    });
    expect(after.references.find((r) => r.id === url)).toMatchObject({ context: true });
    const report = repo.validate();
    expect(report.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual(
      []
    );
  });

  it("a connected agent reads an attached context file's text through the MCP attachment resource (srs-web#593)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { repositoryId } = await import("../src/lib/srs-client.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    const bytes = new TextEncoder().encode("Applicants must show a prototype.");
    const [id] = doc.addContextDocuments(repo, m, {
      files: [{ name: "call.md", type: "text/markdown", bytes }],
    });
    const session = repo.open_mcp_session();
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
    const uri = `srs://${repositoryId(repo)}`;
    const read = (u: string) => rpc("resources/read", { uri: u });

    // the path the agent brief describes: the record's repository-document sourceRef, then the resource
    const record = JSON.parse(read(`${uri}/record/${id}`).result.contents[0].text);
    const ref = record.sourceRefs.find(
      (r: { sourceType: string }) => r.sourceType === "repository-document"
    );
    const file = read(`${uri}/attachment/${ref.sourceId}`).result.contents[0];
    expect(file.mimeType).toBe("text/plain");
    expect(file.text).toBe("Applicants must show a prototype.");
    const missing = read(`${uri}/attachment/00000000-0000-4000-8000-000000000000`);
    expect(missing.error.code).toBe(-32002);
  });

  it("an exploded tree with an attachment survives exportTree -> load_tree (source-documents/ included)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { exportTree } = await import("../src/lib/srs-client.js");
    const mod = await engine();
    const repo = mod.SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    const [id] = doc.addReferences(repo, m, {
      files: [
        { name: "paper.md", type: "text/markdown", bytes: new TextEncoder().encode("the text") },
      ],
    });
    const tree = exportTree(repo);
    expect(
      Object.keys(tree)
        .filter((k) => k.startsWith("source-documents/"))
        .sort()
    ).toEqual([
      "source-documents/paper.md",
      "source-documents/paper.md.meta.json", // srs-rust#1329: the sidecar keeps the full filename
    ]);

    const reopened = mod.SrsRepository.load_tree(tree);
    expect(doc.referenceText(reopened, id)).toBe("the text");
    const again = doc.loadEssay(reopened, m.essayId);
    expect(again.references.map((r) => r.id)).toContain(id);
  });

  it("repair makes the notes container; an essay with no notes lists none, and the handoff names the container (srs-web#624)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    expect(m.notesContainerId).toBeTruthy();
    expect(m.notes).toEqual([]);
    const text = doc.agentHandoff({
      repositoryId: "r",
      essay: { id: m.essayId, title: m.title },
      containerId: m.containerId,
      notesContainerId: m.notesContainerId,
    });
    expect(text).toContain(`notes ${m.notesContainerId}`);
    expect(text).toContain("verbatim");
    const report = repo.validate();
    expect(report.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual([]);
  });

  it("notes list what was derived from each, and loading reads relations once, not per note or paragraph (srs-web#805)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const client = await import("../src/lib/srs-client.js");
    const mod = await engine();
    let repo = mod.SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    let m = doc.loadEssay(repo, essay, { repair: true });
    for (let i = 0; i < 3; i++) doc.addParagraph(repo, doc.loadEssay(repo, essay));
    // Notes arrive from agents (note_create), which the bindings lack: put two into the tree.
    const tree = client.exportTree(repo);
    const note = (id: string) =>
      new TextEncoder().encode(JSON.stringify({ instanceId: id, title: id, tags: [], sections: [{ name: "body", content: "said" }] }));
    const [n1, n2] = ["0b5e0805-0000-4000-8000-000000000001", "0b5e0805-0000-4000-8000-000000000002"];
    tree[`records/notes/${n1}.json`] = note(n1);
    tree[`records/notes/${n2}.json`] = note(n2);
    repo = mod.SrsRepository.load_tree(tree);
    m = doc.loadEssay(repo, essay);
    client.addContainerMember(repo, m.notesContainerId as string, n1);
    client.addContainerMember(repo, m.notesContainerId as string, n2);
    const p = m.entries.find((e) => e.instanceId !== essay)?.instanceId as string;
    client.createRelation(repo, { relationType: "derived-from", sourceInstanceId: p, targetInstanceId: n1 });

    const calls: string[] = [];
    const counted = new Proxy(repo, {
      get(t, k) {
        const v = t[k];
        if (typeof v !== "function") return v;
        return (...a: unknown[]) => {
          calls.push(String(k));
          return v.apply(t, a);
        };
      },
    });
    m = doc.loadEssay(counted, essay);
    expect(m.notes.map((n) => [n.id, n.produced.map((x) => x.id)])).toEqual([[n1, [p]], [n2, []]]);
    expect(calls.filter((c) => c === "containers_for_instance")).toEqual([]);
    const relationReads = calls.filter((c) => c === "list_relations").length;
    doc.addParagraph(repo, m);
    calls.length = 0;
    doc.loadEssay(counted, essay);
    expect(calls.filter((c) => c === "list_relations").length).toBe(relationReads);
  });

  it("references already held don't crowd a match out of the search, whichever one is missing (srs-web#754)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    let m = doc.loadEssay(repo, essay, { repair: true });
    const urls = [1, 2, 3, 4, 5, 6, 7].map((n) => `https://example.org/crowded-${n}`);
    const ids = doc.addReferences(repo, m, { urls });
    for (const id of ids) {
      m = doc.loadEssay(repo, essay);
      doc.removeReference(repo, m, id);
      m = doc.loadEssay(repo, essay);
      expect(doc.findExistingReferences(repo, m, "crowded").map((x) => x.id)).toEqual([id]);
      doc.addExistingReference(repo, m, id, false);
    }
  });

  it("adding an agent's record still works on an essay with no comments type: it stays a candidate (srs-web#754)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    let m = doc.loadEssay(repo, essay, { repair: true });
    repo.set_actor(JSON.stringify({ kind: "ai", id: "agent:x", name: "X" }));
    const [id] = doc.addReferences(repo, m, { urls: ["https://example.org/agent-find"] });
    repo.set_actor(JSON.stringify({ kind: "human", id: "human:ada", name: "Ada" }));
    doc.removeReference(repo, m, id);
    m = doc.loadEssay(repo, essay);
    doc.addExistingReference(repo, m, id, true);
    const ref = doc.loadEssay(repo, essay).references.find((r) => r.id === id);
    expect(ref?.foundBy).toBeTruthy();
    expect(ref?.verdict).toBeUndefined();
  });

  it("a source an agent adds reads back as a candidate with its finder; the writer's own does not (srs-web#626)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    const agent = { kind: "ai", id: "agent:research-loop", name: "Research loop" };
    repo.set_actor(JSON.stringify(agent));
    const [found] = doc.addReferences(repo, m, { urls: ["https://example.org/found-by-agent"] });
    repo.set_actor(JSON.stringify({ kind: "human", id: "human:ada", name: "Ada" }));
    const [own] = doc.addReferences(repo, m, { urls: ["https://example.org/mine"] });

    const after = doc.loadEssay(repo, m.essayId);
    const byId = (id: string) => after.references.find((r) => r.id === id);
    expect(byId(found)?.foundBy).toEqual(agent);
    expect(byId(found)?.foundAt).toBeTruthy();
    expect(byId(found)?.verdict).toBeUndefined();
    expect(byId(own)?.foundBy).toBeUndefined();
  });
});
