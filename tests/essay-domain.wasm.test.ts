// @vitest-environment node
/**
 * The essay's domain on the REAL engine (srs-web#571): fixture essay-domain.srsj holds boundary "Small groups"
 * (scopes two problems, one of which a paragraph bears on; one claim; one tension; narrows "Local governance")
 * and a remedy that answers the untouched problem.
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-domain.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "essay-domain.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}
const fixture = () =>
  readFileSync(path.join(__dirname, "../e2e/fixtures/essay-domain.srsj"), "utf8");
const labels = (xs: { label: string }[]) => xs.map((x) => x.label).sort();

describe.skipIf(!haveBindings)("essay domain on the real engine", () => {
  it("has no map until a boundary is chosen; choosing builds it; removing clears it", async () => {
    const dom = await import("../src/lib/essay/essay-domain.js");
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    expect(dom.boundaryOf(repo, essay)).toBeNull();
    expect(dom.domainMap(repo, essay)).toBeNull();

    const bs = dom.listBoundaries(repo);
    expect(bs.map((b) => b.label)).toEqual(["Large cities", "Local governance", "Small groups"]);
    const small = bs.find((b) => b.label === "Small groups")!;
    dom.setBoundary(repo, essay, small.id);
    expect(dom.boundaryOf(repo, essay)).toBe(small.id);

    const map = dom.domainMap(repo, essay)!;
    expect(map.boundary.label).toBe("Small groups");
    expect(labels(map.problems.touched)).toEqual(["Small groups lose touch"]);
    expect(labels(map.problems.untouched)).toEqual(["Nobody owns the commons"]);
    expect(labels(map.claims)).toEqual(["Polycentric rules scale"]);
    expect(labels(map.tensions)).toEqual(["Autonomy against coordination"]);
    expect(labels(map.remedies)).toEqual(["Shared commons ledger"]);
    expect(map.parents.map((p) => p.boundary.label)).toEqual(["Local governance"]);

    dom.setBoundary(repo, essay, null);
    expect(dom.boundaryOf(repo, essay)).toBeNull();
    expect(dom.domainMap(repo, essay)).toBeNull();
    const report = repo.validate();
    expect(report.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual(
      []
    );
  });

  it("switching boundary replaces the relation rather than adding a second", async () => {
    const dom = await import("../src/lib/essay/essay-domain.js");
    const doc = await import("../src/lib/essay/essay-document.js");
    const { listRelations } = await import("../src/lib/srs-client.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    const [a, b] = dom.listBoundaries(repo);
    dom.setBoundary(repo, essay, a.id);
    dom.setBoundary(repo, essay, a.id); // unchanged: no churn
    dom.setBoundary(repo, essay, b.id);
    const rels = listRelations(repo, { source: essay, relationType: dom.WITHIN_BOUNDARY });
    expect(rels.map((r) => r.targetInstanceId)).toEqual([b.id]);
  });

  it("an existing claim reaches a paragraph, for the writer and for an agent under the guard; the brief says so (srs-web#754)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    let m = doc.loadEssay(repo, essay, { repair: true });
    const p = Object.keys(m.paragraphs)[0];

    // The writer: search, add, link
    expect(doc.findExistingReferences(repo, m, " ")).toEqual([]);
    const claims = repo.find(JSON.stringify({ typeName: "claim" })).hits;
    expect(claims.length).toBeGreaterThan(0);
    const claim = claims[0];
    const word = String(claim.label).split(" ")[0];
    const matches = doc.findExistingReferences(repo, m, word);
    expect(matches.map((x) => x.id)).toContain(claim.instanceId);
    expect(matches.find((x) => x.id === claim.instanceId)?.type).toBe("claim");
    doc.addExistingReference(repo, m, claim.instanceId, false);
    m = doc.loadEssay(repo, essay);
    expect(m.references.map((r) => r.id)).toContain(claim.instanceId);
    expect(doc.findExistingReferences(repo, m, word).map((x) => x.id)).not.toContain(claim.instanceId);
    doc.linkReference(repo, claim.instanceId, p);
    m = doc.loadEssay(repo, essay);
    expect(m.references.find((r) => r.id === claim.instanceId)?.paragraphIds).toEqual([p]);
    expect(m.attachments[p].some((a) => a.neighbourId === claim.instanceId)).toBe(true);
    doc.removeAttachment(repo, m.attachments[p].find((a) => a.neighbourId === claim.instanceId)!.id);
    doc.removeReference(repo, m, claim.instanceId);
    m = doc.loadEssay(repo, essay);

    // The agent: only what the brief says, under the write guard
    const brief = doc.agentHandoff({
      repositoryId: "r",
      essay: { id: essay, title: m.title },
      containerId: m.containerId,
      referencesContainerId: m.referencesContainerId,
    });
    expect(brief).not.toContain("as with a claim");
    expect(brief).toContain("existing claim → paragraph");
    expect(brief).toContain("search it with find");
    const session = repo.open_mcp_session();
    session.set_write_guard(JSON.stringify(doc.essayWriteGuard(m)));
    let n = 0;
    const rpc = (method: string, params?: unknown) =>
      JSON.parse(session.handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params })) ?? "null");
    rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    session.handle(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });
    const add = tool("container_member_add", { containerId: m.referencesContainerId, instanceId: claim.instanceId });
    expect(add.result.isError, JSON.stringify(add)).not.toBe(true);
    const link = tool("relation_create", { relationType: "evidences", sourceInstanceId: claim.instanceId, targetInstanceId: p });
    expect(link.result.isError, JSON.stringify(link)).not.toBe(true);
    m = doc.loadEssay(repo, essay);
    expect(m.references.find((r) => r.id === claim.instanceId)?.paragraphIds).toEqual([p]);
    const report = repo.validate();
    expect(report.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual([]);
  });

  it("finds nothing, without failing, in a repository with none of the types", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const mod = await engine();
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Empty" }));
    expect(doc.findExistingReferences(repo, { references: [] }, "anything")).toEqual([]);
  });
});
