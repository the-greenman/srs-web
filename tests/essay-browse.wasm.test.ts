// @vitest-environment node
/** Browsing essays by domain and family on the REAL engine (srs-web#623), over the essay-domain fixture. */
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-browse.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "essay-browse.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}
const fixture = () =>
  readFileSync(path.join(__dirname, "../e2e/fixtures/essay-domain.srsj"), "utf8");

describe.skipIf(!haveBindings)("browse essays on the real engine", () => {
  it("lists a lone essay under 'No domain yet', then under its domain once named", async () => {
    const b = await import("../src/lib/essay/essay-browse.js");
    const dom = await import("../src/lib/essay/essay-domain.js");
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const essay = doc.listEssays(repo)[0].id;
    expect(b.browseEssays(repo).map((g) => [g.label, g.essays.length])).toEqual([
      ["No domain yet", 1],
    ]);
    const small = dom.listBoundaries(repo).find((x) => x.label === "Small groups")!;
    dom.setBoundary(repo, essay, small.id);
    const groups = b.browseEssays(repo);
    expect(groups.map((g) => [g.label, g.depth, g.boundaryId !== null])).toEqual([
      ["Small groups", 0, true],
    ]);
    expect(groups[0].essays[0].family).toEqual([]);
  });

  it("a copy shares every paragraph with its original; both appear in each other's family", async () => {
    const b = await import("../src/lib/essay/essay-browse.js");
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = (await engine()).SrsRepository.load(fixture());
    const original = doc.listEssays(repo)[0].id;
    const m = doc.loadEssay(repo, original, { repair: true });
    const copyId = doc.copyEssay(repo, m);
    const all = b.essayFamilies(repo);
    const o = all.find((e) => e.id === original)!;
    const c = all.find((e) => e.id === copyId)!;
    expect(o.family.map((f) => f.essayId)).toEqual([copyId]);
    expect(c.family.map((f) => f.essayId)).toEqual([original]);
    expect(o.family[0].shared).toBe(c.family[0].shared);
    expect(c.sharedParagraphs).toBe(o.sharedParagraphs);
  });
});
