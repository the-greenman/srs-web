// @vitest-environment node
/**
 * The site core against the REAL engine (srs-web#680): the website package (published bundle,
 * e2e/fixtures/site.srsj, built by build-site-fixture.sh) is the link between block types and
 * site components; the export is what the muDemocracy site renders (golden), minus `nav`, plus `view`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}

const GOLDEN = path.join(__dirname, "fixtures/site-export.golden.json");

async function load() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "site.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "site.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod.SrsRepository.load(
    readFileSync(path.join(__dirname, "../e2e/fixtures/site.srsj"), "utf8")
  );
}

describe.skipIf(!haveBindings)("site core on the real engine", () => {
  it("finds the site: 15 Views dispatch the 16 block and item types; the page type is the root, not a block", async () => {
    const { findSite, offeredTypes, viewFor } = await import("../src/lib/site/site-views.js");
    const site = findSite(await load());
    expect(site).not.toBeNull();
    if (!site) return;
    expect(offeredTypes(site)).toHaveLength(16);
    expect(new Set([...site.dispatch.values()].map((v) => v.viewId)).size).toBe(15);
    expect(viewFor(site, "com.mudemocracy.website/homepage")).toBeNull();
    expect(viewFor(site, "com.mudemocracy.website/hero")).toBe(
      viewFor(site, "com.mudemocracy.website/homepage-hero")
    );
    const hero = viewFor(site, "com.mudemocracy.website/hero");
    expect(
      hero?.fields
        .filter((f) => f.hint === "brief")
        .map((f) => f.name)
        .sort()
    ).toEqual(["action_intent", "editorial_objective", "meta_objective", "section_audience"]);
  });

  it("lists every page and reads its settings; blocks in arranged order with items under their group", async () => {
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { listPages, pageBlocks, pageSettings } = await import("../src/lib/site/site-model.js");
    const repo = await load();
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const pages = listPages(repo, site);
    expect(pages.map((p) => p.key).sort()).toEqual(["about", "home", "scratch"]);
    const page = (key: string) => pages.find((p) => p.key === key) as (typeof pages)[number];
    const [home, about, scratch] = [page("home"), page("about"), page("scratch")];
    expect(pageSettings(repo, home)).toEqual({
      publish: "yes",
      closingMark: true,
      layout: "standard",
    });
    expect(pageSettings(repo, about)).toEqual({
      publish: "draft",
      closingMark: false,
      layout: "essay",
    });
    expect(pageSettings(repo, scratch).publish).toBe("no");
    const blocks = pageBlocks(repo, home);
    expect(blocks.map((b) => b.record.typeName)).toEqual([
      "hero",
      "homepage-prose",
      "faq-group",
      "guide-section",
      "primary-cta",
    ]);
    expect(blocks[2].items.map((i) => i.record.fieldValues.faq_item_key)).toEqual(["q1", "q2"]);
  });

  it("writes settings as tags and keeps a tag it does not own", async () => {
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { listPages, pageSettings, setPageSettings } = await import(
      "../src/lib/site/site-model.js"
    );
    const { getContainer, updateContainer } = await import("../src/lib/srs-client.js");
    const repo = await load();
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const scratch = listPages(repo, site).find((p) => p.key === "scratch");
    if (!scratch) throw new Error("no scratch page");
    updateContainer(repo, scratch.containerId, { tags: ["foo"] });
    for (const publish of ["yes", "draft", "no"] as const) {
      setPageSettings(repo, scratch, { publish, closingMark: true, layout: "essay" });
      expect(pageSettings(repo, scratch)).toEqual({ publish, closingMark: true, layout: "essay" });
    }
    setPageSettings(repo, scratch, { closingMark: false, layout: "standard" });
    expect(getContainer(repo, scratch.containerId).tags).toEqual(["foo"]);
  });

  it("exports the published pages as the site renders them (golden)", async () => {
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { exportSite } = await import("../src/lib/site/site-export.js");
    const { guideReferences } = await import("../src/lib/site/mudemocracy/guides.js");
    const repo = await load();
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const text = `${JSON.stringify(exportSite(repo, site, guideReferences(repo)), null, 2)}\n`;
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, text);
    expect(text).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("refuses two published pages with one key, and a guide-section that shows no guide record", async () => {
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { exportSite } = await import("../src/lib/site/site-export.js");
    const { listPages } = await import("../src/lib/site/site-model.js");
    const { guideReferences } = await import("../src/lib/site/mudemocracy/guides.js");
    const { getRecord, listRelations, updateRecord, deleteRelation } = await import(
      "../src/lib/srs-client.js"
    );

    let repo = await load();
    let site = findSite(repo);
    if (!site) throw new Error("no site");
    const about = listPages(repo, site).find((p) => p.key === "about");
    if (!about) throw new Error("no about page");
    const rec = getRecord(repo, about.anchorId);
    if (!rec) throw new Error("no about page");
    updateRecord(repo, about.anchorId, { fieldValues: { ...rec.fieldValues, page_key: "home" } });
    expect(() => exportSite(repo, site as NonNullable<typeof site>)).toThrow(
      'two published pages have page_key "home"'
    );

    repo = await load();
    site = findSite(repo);
    if (!site) throw new Error("no site");
    const uses = listRelations(repo, { relationType: "uses" }).find(
      (r) => getRecord(repo, r.sourceInstanceId)?.typeName === "guide-section"
    );
    if (!uses) throw new Error("fixture has no guide-section uses");
    deleteRelation(repo, uses.relationId);
    expect(() => exportSite(repo, site as NonNullable<typeof site>, guideReferences(repo))).toThrow(
      `page "home": guide-section ${uses.sourceInstanceId} uses no guide record`
    );
  });

  it("allows an unpublished page to share a key, and refuses a block whose type the site does not dispatch", async () => {
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { exportSite } = await import("../src/lib/site/site-export.js");
    const { listPages, setPageSettings } = await import("../src/lib/site/site-model.js");
    const { addContainerMember, getRecord, listRecords, updateRecord } = await import(
      "../src/lib/srs-client.js"
    );
    const repo = await load();
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const scratch = listPages(repo, site).find((p) => p.key === "scratch");
    if (!scratch) throw new Error("no scratch page");
    const rec = getRecord(repo, scratch.anchorId);
    if (!rec) throw new Error("no scratch record");
    updateRecord(repo, scratch.anchorId, { fieldValues: { ...rec.fieldValues, page_key: "home" } });
    expect(
      exportSite(repo, site)
        .map((p) => p.key)
        .sort()
    ).toEqual(["about", "home"]);

    updateRecord(repo, scratch.anchorId, { fieldValues: rec.fieldValues });
    const guide = listRecords(repo).find((r) => r.typeName === "guide");
    if (!guide) throw new Error("fixture has no guide record");
    addContainerMember(repo, scratch.containerId, guide.instanceId);
    setPageSettings(repo, scratch, { publish: "yes" });
    expect(() => exportSite(repo, site)).toThrow(
      'page "scratch": block type "com.mudemocracy/guide" has no View in the site Composition'
    );
  });
});
