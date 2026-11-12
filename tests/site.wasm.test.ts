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
    // a note on the about page is not a block
    expect(pageBlocks(repo, about).map((b) => b.record.typeName)).toEqual([
      "hero",
      "homepage-prose",
    ]);
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
    const { evidenceReferences } = await import("../src/lib/site/mudemocracy/evidence.js");
    const repo = await load();
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const extras = [guideReferences(repo), evidenceReferences(repo)];
    const pages = exportSite(repo, site, (...a) => extras.forEach((x) => x(...a)));
    const text = `${JSON.stringify(pages, null, 2)}\n`;
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, text);
    expect(text).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("attaches what backs each block and item, and finds a page's gaps as the evidence check does (#694)", async () => {
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { exportSite } = await import("../src/lib/site/site-export.js");
    const { evidenceReferences, pageEvidence, sourceRows, statements } = await import(
      "../src/lib/site/mudemocracy/evidence.js"
    );
    const repo = await load();
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const pages = exportSite(repo, site, evidenceReferences(repo));
    const home = pages.find((p) => p.key === "home");
    const about = pages.find((p) => p.key === "about");
    if (!home || !about) throw new Error("fixture pages missing");
    const block = (page: typeof home, type: string) => page.blocks.find((b) => b.type === type);
    // a quotation carries the source it is derived from
    expect(block(home, "hero")?.evidence).toEqual([
      expect.objectContaining({
        relation: "evidences",
        kind: "quotation",
        level: "secondary",
        quote: "Decisions are made together.",
        source: expect.objectContaining({ title: "A verified source", level: "verified" }),
      }),
    ]);
    // evidence before challenges
    const why = block(home, "homepage-prose")?.evidence as {
      relation: string;
      kind: string;
      code?: string;
    }[];
    expect(why.map((e) => [e.relation, e.kind])).toEqual([
      ["evidences", "source"],
      ["challenges", "claim"],
    ]);
    expect(why[1]?.code).toBe("C-1");
    // an item carries its own
    const faq = block(home, "faq-group");
    expect(faq?.items?.find((i) => i.faq_item_key === "q1")?.evidence).toEqual([
      expect.objectContaining({ title: "A verified source" }),
    ]);
    // one source row gathers every statement it backs
    const rows = sourceRows(home.blocks.flatMap((b) => statements(b)));
    const verified = rows.find((r) => r.entry.title === "A verified source");
    expect(verified?.backs).toContain("Why");
    expect(verified?.backs).toHaveLength(2);
    expect(rows.map((r) => r.entry.relation)).toEqual(["evidences", "evidences", "challenges"]);
    // the gaps: an unbacked argument, a weak one, our reading
    const { findings, backed } = pageEvidence(about);
    expect(backed).toBe(1);
    expect(findings.map((f) => `${f.severity} ${f.message}`)).toEqual([
      'WARN "About." has no evidence recorded',
      'INFO "About." is our reading, awaiting the owner\'s decision',
      'INFO "Our story" rests only on recalled evidence',
    ]);
    expect(pageEvidence({ key: "scratch", blocks: [] }).findings).toEqual([
      { severity: "INFO", page: "scratch", message: "no evidence on this page yet (0 statements)" },
    ]);
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

describe("evidence rules on exported blocks (#694)", () => {
  const src = (level?: string, relation: "evidences" | "challenges" = "evidences") => ({
    relation,
    kind: "source" as const,
    id: `${relation}-${level}`,
    title: `${level ?? "no"} source`,
    level,
  });
  const block = (
    type: string,
    fields: Record<string, unknown>,
    evidence?: ReturnType<typeof src>[],
    items?: Record<string, unknown>[]
  ) => ({
    type,
    view: "v",
    fields,
    evidence,
    items,
  });

  it("a statement only challenged is weak; a missing level is reported, not weak", async () => {
    const { gapOf, pageEvidence } = await import("../src/lib/site/mudemocracy/evidence.js");
    expect(gapOf({ evidence: [src("verified", "challenges")] })).toBe("weak");
    expect(gapOf({ evidence: [src(undefined)] })).toBeUndefined();
    const { findings } = pageEvidence({
      key: "p",
      blocks: [block("hero", { headline: "H." }, [src(undefined)])],
    });
    expect(findings.map((f) => f.message)).toEqual(['source "no source" has no checked-to level']);
  });

  it("drops marks where they are not the subject, and counts a statement once per page", async () => {
    const { pageEvidence, statements } = await import("../src/lib/site/mudemocracy/evidence.js");
    const marks = [{ mark_key: "vote", mark_title: "Vote" }];
    expect(statements(block("story", { story_key: "rooms" }, undefined, marks))).toEqual([]);
    expect(statements(block("story", { story_key: "marks" }, undefined, marks))).toEqual(marks);
    const twice = block("homepage-prose", { section_key: "why", section_body: "Why." }, [
      src("verified"),
    ]);
    expect(pageEvidence({ key: "p", blocks: [twice, twice] }).statements).toHaveLength(1);
  });
});
