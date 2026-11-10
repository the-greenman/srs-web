// @vitest-environment node
/**
 * Essay image paragraphs on the REAL engine (srs-web#764): e2e/fixtures/essay-images.srs loads its image
 * paragraphs as essay members beside the text paragraph, in order, with their layout and the attached
 * file the core resolves; the reading puts them in place; a paragraph with no attachment has none.
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

describe.skipIf(!haveBindings)("essay image paragraphs on the real engine", () => {
  it("loads image paragraphs as members, in order, with layout, alt text and their bytes", async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-images.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-images.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const doc = await import("../src/lib/essay/essay-document.js");
    const { imageMime } = await import("../src/lib/essay/image-paragraph.js");
    const repo = mod.SrsRepository.load_archive(
      new Uint8Array(readFileSync(path.resolve(__dirname, "../e2e/fixtures/essay-images.srs")))
    );
    const [essay] = doc.listEssays(repo);
    const m = doc.loadEssay(repo, essay.id);
    const ps = m.entries.map((e) => m.paragraphs[e.instanceId]);
    expect(ps.map((p) => (p.image ? `${p.image.size}/${p.image.align}` : "text"))).toEqual([
      "text",
      "full-width/centre",
      "original/left",
      "original/centre",
      "original/right",
      "full-width/centre",
      "full-width/centre",
      "full-width/centre",
    ]);
    expect(ps[1].title).toBe("Band");
    expect(ps[1].image).toMatchObject({ alt: "An orange band across a blue field", caption: "The band at full width" });
    const mimes = ps.slice(1, 7).map((p) => imageMime(doc.attachmentBytes(repo, p.image!.documentId!)!));
    expect(mimes).toEqual(["image/png", "image/png", "image/svg+xml", "image/svg+xml", "image/svg+xml", "image/svg+xml"]);
    expect(ps[7].image?.documentId).toBeNull();
    const reading = doc.essayReading(m);
    expect(reading.paragraphs.map((p) => (p.image ? "image" : "text"))).toEqual([
      "text",
      ...Array(7).fill("image"),
    ]);
  });
});
