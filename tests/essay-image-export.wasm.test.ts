// @vitest-environment node
/**
 * The essay's text export on the REAL engine (srs-web#766): on the pinned essay package (1.13.0, image
 * paragraph view v2) the markdown export says what each image shows, its alt text labelled Image, above
 * its caption, where the image paragraph sits. An essay UPGRADED from an older package does too: the
 * core renders an id-only view reference with the newest installed version (srs-rust#1648, srs-web#815).
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
const pkg = (id: string) => readFileSync(path.resolve(__dirname, `../src/lib/packages/${id}.srspkg`), "utf8");
const COMMENTS = "9092f84e-fb94-4f81-a523-0f7ef5b02194";
const ESSAY = "5b14a4d4-ec08-4e5b-be75-c183aec90c40";
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAFUlEQVR42mOQC1gARx96NOCIgXoSADk8KyGfULlCAAAAAElFTkSuQmCC",
    "base64"
  )
);

describe.skipIf(!haveBindings)("essay image paragraphs in the markdown export", () => {
  it("a new essay exports each image paragraph as its alt text and caption, never as an image", async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-image-export.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-image-export.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Export" }));
    repo.install_package_bundle(pkg(COMMENTS), "{}");
    repo.install_package_bundle(pkg(ESSAY), "{}");

    const essayId = doc.newEssay(repo, "Pictures");
    let m = doc.loadEssay(repo, essayId);
    const p = doc.addParagraph(repo, m);
    doc.setBody(repo, p, "Text before the picture.");
    m = doc.loadEssay(repo, essayId);
    const fields = { alt: "Two dots", caption: "A small picture", size: "full-width" as const, align: "centre" as const };
    doc.addImageParagraph(repo, m, { id: p, zone: "after" }, fields, { name: "dots.png", type: "image/png", bytes: PNG });
    expect(repo.validate().summary.errors).toBe(0);

    const md = doc.essayMarkdown(repo, doc.loadEssay(repo, essayId));
    expect(md).toMatch(/Text before the picture\.\s+\*\*Image\*\*: Two dots\s+A small picture/);
    expect(md).not.toMatch(/!\[|<img|<svg/);
  }, 30_000);
  it("an essay upgraded from 1.11.0 exports its image paragraphs with the new view (srs-web#815)", async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-image-export-up.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-image-export-up.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const { upgradeBundles } = await import("../src/lib/srs-client.js");
    const doc = await import("../src/lib/essay/essay-document.js");
    const repo = mod.SrsRepository.load_archive(
      new Uint8Array(readFileSync(path.resolve(__dirname, "../e2e/fixtures/essay-images.srs")))
    );
    const [done] = upgradeBundles(repo, [ESSAY]);
    expect(done.conflicts).toEqual([]);
    expect(repo.validate().summary.errors).toBe(0);
    const [essay] = doc.listEssays(repo);
    const md = doc.essayMarkdown(repo, doc.loadEssay(repo, essay.id));
    expect(md).toMatch(
      /A paragraph of text before the pictures\.\s+\*\*Image\*\*: An orange band across a blue field\s+The band at full width/
    );
    expect(md).toContain("**Image**: A picture that was never attached");
    expect(md).not.toMatch(/!\[|<img|<svg/);
  }, 30_000);
});
