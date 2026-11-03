// @vitest-environment node
/**
 * Editing a website's pages against the REAL engine (srs-web#680 B1, ADR-029): the headless edits
 * keep a page's outline, drafts and Bin in step, and a new page is a record and its container.
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
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "site-edit.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "site-edit.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

describe.skipIf(!haveBindings)("site editor on the real engine", () => {
  async function open() {
    const mod = await engine();
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/site.srsj"), "utf8")
    );
    const { findSite } = await import("../src/lib/site/site-views.js");
    const model = await import("../src/lib/site/site-model.js");
    const edit = await import("../src/lib/site/site-edit.js");
    const client = await import("../src/lib/srs-client.js");
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const page = (key: string) => {
      const p = model.listPages(repo, site).find((x) => x.key === key);
      if (!p) throw new Error(`no page ${key}`);
      return p;
    };
    const home = page("home");
    const types = () => model.pageBlocks(repo, home).map((b) => b.record.typeName);
    const blockOf = (typeName: string) => {
      const b = model.pageBlocks(repo, home).find((x) => x.record.typeName === typeName);
      if (!b) throw new Error(`no ${typeName}`);
      return b;
    };
    const outline = (c: string) =>
      client.getContainerOutline(repo, c).body.map((e) => [e.instanceId, e.depth]);
    return { repo, site, home, page, types, blockOf, outline, model, edit, client };
  }

  it("moves a group with its items; an item never leaves its group; beside an item means beside its group", async () => {
    const { repo, home, types, blockOf, edit, outline } = await open();
    const faq = blockOf("faq-group");
    const hero = blockOf("hero");
    edit.moveBlock(repo, home, faq.id, { id: hero.id, zone: "before" });
    expect(types()).toEqual([
      "faq-group",
      "hero",
      "homepage-prose",
      "guide-section",
      "primary-cta",
    ]);
    expect(blockOf("faq-group").items).toHaveLength(2);
    const before = outline(home.containerId);
    edit.moveBlock(repo, home, faq.items[0].id, { id: null, zone: "after" }); // an item to the end
    edit.moveBlock(repo, home, faq.items[0].id, { id: hero.id, zone: "after" }); // an item out of its group
    expect(outline(home.containerId)).toEqual(before);
    const prose = blockOf("homepage-prose");
    edit.moveBlock(repo, home, prose.id, { id: faq.items[1].id, zone: "before" }); // beside an item
    expect(types()).toEqual([
      "homepage-prose",
      "faq-group",
      "hero",
      "guide-section",
      "primary-cta",
    ]);
  });

  it("drafts, swap-in and alternatives: an item's alternative takes its place in the group", async () => {
    const { repo, home, blockOf, edit, model, client } = await open();
    const q1 = blockOf("faq-group").items[0];
    const alts = edit.alternativesFor(repo, home, q1.id);
    expect(alts).toHaveLength(1);
    edit.swapIn(repo, home, alts[0], q1.id);
    const faq = blockOf("faq-group");
    expect(faq.items.map((i) => i.record.fieldValues.faq_item_key)).toEqual(["q1-alt", "q2"]);
    expect(
      client
        .listRelations(repo, { source: faq.id, relationType: "contains" })
        .map((r) => r.targetInstanceId)
    ).toContain(alts[0]);
    expect(edit.alternativesFor(repo, home, alts[0])).toEqual([q1.id]); // the replaced item is now the alternative
    edit.toDrafts(repo, home, faq.id);
    expect(model.pageBlocks(repo, home).some((b) => b.id === faq.id)).toBe(false);
    edit.fromDrafts(repo, home, faq.id);
    expect(blockOf("faq-group").items).toHaveLength(2); // a group comes back with its items
  });

  it("the Bin carries a group, restores it, and deletes for good only what nothing else holds", async () => {
    const { repo, home, blockOf, edit, model, client } = await open();
    const faq = blockOf("faq-group");
    const prose = blockOf("homepage-prose");
    expect(() => edit.deleteForever(repo, home, prose.id)).toThrow("Only a block in the Bin");
    edit.toBin(repo, home, faq.id);
    expect(client.getContainerOutline(repo, edit.binIdFor(home)).entries).toHaveLength(3);
    edit.fromBin(repo, home, faq.id);
    expect(blockOf("faq-group").items).toHaveLength(2);
    edit.toBin(repo, home, prose.id);
    edit.deleteForever(repo, home, prose.id); // shared with "Shared prose": kept
    expect(client.getRecord(repo, prose.id)).not.toBeNull();
    const q2 = faq.items[1].id;
    edit.toBin(repo, home, faq.id);
    edit.deleteForever(repo, home, faq.id); // q1 is kept (its alternative derives from it); the rest go
    expect(client.getRecord(repo, faq.id)).toBeNull();
    expect(client.getRecord(repo, q2)).toBeNull();
    expect(client.getRecord(repo, faq.items[0].id)).not.toBeNull();
    expect(model.pageBlocks(repo, home).some((b) => b.id === faq.id)).toBe(false);
  });

  it("undo restores a move to the Bin and a field edit", async () => {
    const { repo, home, blockOf, edit, outline } = await open();
    const { DocumentHistory } = await import("../src/lib/document.js");
    const history = new DocumentHistory();
    edit.ensureAreas(repo, home);
    const run = (fn: () => void) => {
      const before = edit.snapshotPage(repo, home);
      fn();
      history.push(before, edit.snapshotPage(repo, home));
    };
    const start = outline(home.containerId);
    const hero = blockOf("hero");
    run(() => edit.toBin(repo, home, blockOf("faq-group").id));
    run(() => edit.setField(repo, hero.id, "headline", "Changed."));
    expect(blockOf("hero").record.fieldValues.headline).toBe("Changed.");
    history.undo(repo);
    expect(blockOf("hero").record.fieldValues.headline).toBe("Decisions power change.");
    history.undo(repo);
    expect(outline(home.containerId)).toEqual(start);
  });

  it("adds blocks and items of the site's types; nestItems is idempotent and never makes an item a group", async () => {
    const { repo, site, home, types, blockOf, edit, client } = await open();
    const id = edit.addBlock(repo, site, home, "com.mudemocracy.website/homepage-prose", {
      id: blockOf("hero").id,
      zone: "after",
    });
    expect(types()).toEqual([
      "hero",
      "homepage-prose",
      "homepage-prose",
      "faq-group",
      "guide-section",
      "primary-cta",
    ]);
    expect(String(client.getRecord(repo, id)?.fieldValues.section_key)).toMatch(
      /^homepage-prose-\d+$/
    );
    expect(() => edit.addBlock(repo, site, home, "com.mudemocracy.website/homepage")).toThrow(
      "does not offer"
    );
    // keys never repeat, even after a block leaves the page for the Bin
    edit.toBin(repo, home, id);
    const again = edit.addBlock(repo, site, home, "com.mudemocracy.website/homepage-prose");
    expect(client.getRecord(repo, again)?.fieldValues.section_key).not.toBe(
      client.getRecord(repo, id)?.fieldValues.section_key
    );
    const faq = blockOf("faq-group");
    expect(edit.itemTypes(repo, home, faq.id)).toEqual(["com.mudemocracy.website/faq-item"]);
    edit.addItem(repo, site, home, faq.id, "com.mudemocracy.website/faq-item");
    expect(blockOf("faq-group").items).toHaveLength(3);
    expect(edit.nestItems(repo, home.containerId)).toBe(false);
    expect(client.getContainerOutline(repo, home.containerId).body.every((e) => e.depth <= 1)).toBe(
      true
    );
  });

  it("makes a new page: a record of the site's page type, its required fields empty, and its container", async () => {
    const { repo, site, model, edit } = await open();
    const page = edit.newPage(repo, site, "Contact", "contact");
    expect(
      model
        .listPages(repo, site)
        .map((p) => p.key)
        .sort()
    ).toEqual(["about", "contact", "home", "scratch"]);
    expect(model.pageSettings(repo, page).publish).toBe("no");
    expect(model.pageBlocks(repo, page)).toEqual([]);
    expect(repo.validate().summary.errors).toBe(0);
    // keys are addresses: a new page never takes one in use, and a key is never set empty or duplicate
    expect(edit.newPage(repo, site, "Home again", "home").key).toBe("home-2");
    expect(() => edit.setPageKey(repo, site, page, " ")).toThrow("needs a key");
    expect(() => edit.setPageKey(repo, site, page, "about")).toThrow("already has");
    edit.setPageKey(repo, site, page, "contact-us");
    expect(model.listPages(repo, site).map((p) => p.key)).toContain("contact-us");
  });

  it("keeps the page's areas where muSrs has them, and skips notes", async () => {
    const { repo, home, page, model, edit, site } = await open();
    const { areaId } = await import("../src/lib/document.js");
    expect(edit.binIdFor(home)).toBe(areaId(home.anchorId, "bin"));
    expect(edit.alternativesFor(repo, home, model.pageBlocks(repo, home)[0].id)).toEqual([]); // the hero's draft derives from nothing
    expect(model.pageBlocks(repo, page("about")).map((b) => b.record.typeName)).toEqual([
      "hero",
      "homepage-prose",
    ]);
    expect(
      model
        .listPages(repo, site)
        .map((p) => p.key)
        .sort()
    ).toEqual(["about", "home", "scratch"]);
  });
});
