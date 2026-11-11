// @vitest-environment node
/**
 * Adding and editing essay image paragraphs on the REAL engine (srs-web#765): the attach, record,
 * place and link as one write; the core's `svg-unsafe` refusal writes nothing and reads in plain
 * words; undo and redo of the add bring the image back with the paragraph.
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

const enc = (s: string) => new TextEncoder().encode(s);
const SVG = enc(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>'
);
const HOSTILE = enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe.skipIf(!haveBindings)("essay image paragraph editing on the real engine", () => {
  async function setup() {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "essay-image-edit.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "essay-image-edit.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const doc = await import("../src/lib/essay/essay-document.js");
    const img = await import("../src/lib/essay/image-paragraph.js");
    const { EssayHistory, snapshotEssay } = await import("../src/lib/essay/essay-history.js");
    const repo = mod.SrsRepository.load_archive(
      new Uint8Array(readFileSync(path.resolve(__dirname, "../e2e/fixtures/essay-images.srs")))
    );
    const [essay] = doc.listEssays(repo);
    const load = () => doc.loadEssay(repo, essay.id);
    const history = new EssayHistory();
    const refs = () => {
      const m = load();
      return { essayId: essay.id, containerId: m.containerId, stateId: m.stateId };
    };
    const edit = (fn: () => void) => {
      const before = snapshotEssay(repo, refs());
      fn();
      history.push(before, snapshotEssay(repo, refs()));
    };
    return { doc, img, repo, load, history, edit };
  }
  const fields = {
    alt: "A black bar",
    caption: "",
    size: "original" as const,
    align: "right" as const,
  };

  it("adds an image paragraph after a paragraph, with its file linked, then edits it", async () => {
    const { doc, img, repo, load } = await setup();
    const first = load().entries[0].instanceId;
    const id = doc.addImageParagraph(repo, load(), { id: first, zone: "after" }, fields, {
      name: "bar.svg",
      type: "image/svg+xml",
      bytes: SVG,
    });
    let m = load();
    expect(m.entries[1].instanceId).toBe(id);
    expect(m.paragraphs[id].image).toMatchObject({
      alt: "A black bar",
      size: "original",
      align: "right",
    });
    expect(img.imageMime(doc.attachmentBytes(repo, m.paragraphs[id].image!.documentId!)!)).toBe(
      "image/svg+xml"
    );
    expect(repo.validate().summary.errors).toBe(0);

    doc.setImage(repo, id, {
      alt: "A bar",
      caption: "Under it",
      size: "full-width",
      align: "left",
    });
    m = load();
    expect(m.paragraphs[id].image).toMatchObject({
      alt: "A bar",
      caption: "Under it",
      size: "full-width",
      align: "centre",
    });
    expect(m.paragraphs[id].image!.documentId).not.toBeNull(); // the image stays
  });

  it("an unsafe SVG is refused by the core: nothing is written, and the writer reads why", async () => {
    const { doc, img, repo, load } = await setup();
    const before = load();
    let refusal = "";
    try {
      doc.addImageParagraph(repo, before, undefined, fields, {
        name: "bad.svg",
        type: "image/svg+xml",
        bytes: HOSTILE,
      });
    } catch (e) {
      expect((e as { code?: string }).code).toBe("svg-unsafe");
      refusal = img.imageRefusal(e);
    }
    expect(refusal).toBe(
      "This SVG contains a script or a link to another file, so it can't be used. Export it again as a plain SVG."
    );
    expect(load().entries).toEqual(before.entries);
  });

  it("undo removes the added image paragraph and redo brings it back with its image", async () => {
    const { doc, repo, load, history, edit } = await setup();
    const count = load().entries.length;
    edit(() => {
      doc.addImageParagraph(repo, load(), undefined, fields, {
        name: "bar.svg",
        type: "image/svg+xml",
        bytes: SVG,
      });
    });
    expect(load().entries).toHaveLength(count + 1);
    expect(history.undo(repo)).toBe(true);
    expect(load().entries).toHaveLength(count);
    expect(history.redo(repo)).toBe(true);
    const m = load();
    const back = m.paragraphs[m.entries.at(-1)!.instanceId];
    expect(back.image?.alt).toBe("A black bar");
    expect(back.image?.documentId).not.toBeNull();
    expect(repo.validate().summary.errors).toBe(0);
  });
});
