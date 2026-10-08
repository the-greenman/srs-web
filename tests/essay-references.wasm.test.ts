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
const fixture = () =>
  readFileSync(path.join(__dirname, "../e2e/fixtures/essay-pool.srsj"), "utf8");

describe.skipIf(!haveBindings)("references pool on the real engine", () => {
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
    expect(file).toMatchObject({ label: "call-transcript.md", kind: "transcript", paragraphIds: [p1] });
    const web = after.references.find((r) => r.id === linked);
    expect(web).toMatchObject({ kind: "web", url: "https://example.org/paper", paragraphIds: [p1] });
    // the hover card previews the attached text; the pinned pane reads all of it
    expect(after.attachments[p1].find((a) => a.neighbourId === pooled)?.text).toContain("We agreed to meet.");
    expect(doc.referenceText(repo, pooled)).toBe("# Call notes\nWe agreed to meet.\n");
    expect(doc.referenceText(repo, linked)).toBe("");
    expect(doc.repoBytes(repo)).toBeGreaterThan(bytes.length);

    const report = repo.validate();
    expect(report.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toEqual([]);
  });

  it("an exploded tree with an attachment survives exportTree -> load_tree (source-documents/ included)", async () => {
    const doc = await import("../src/lib/essay/essay-document.js");
    const { exportTree } = await import("../src/lib/srs-client.js");
    const mod = await engine();
    const repo = mod.SrsRepository.load(fixture());
    const m = doc.loadEssay(repo, doc.listEssays(repo)[0].id, { repair: true });
    const [id] = doc.addReferences(repo, m, {
      files: [{ name: "paper.md", type: "text/markdown", bytes: new TextEncoder().encode("the text") }],
    });
    const tree = exportTree(repo);
    expect(Object.keys(tree).filter((k) => k.startsWith("source-documents/")).sort()).toEqual([
      "source-documents/paper.md",
      "source-documents/paper.meta.json",
    ]);

    const reopened = mod.SrsRepository.load_tree(tree);
    expect(doc.referenceText(reopened, id)).toBe("the text");
    const again = doc.loadEssay(reopened, m.essayId);
    expect(again.references.map((r) => r.id)).toContain(id);
  });
});
