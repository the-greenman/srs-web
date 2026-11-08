// @vitest-environment node
/**
 * A website's menu against the REAL engine (srs-web#681, ADR-029 E7): add a page as a dropdown
 * entry, rename it, reorder it, move it back to the bar, undo; the export draws what the menu holds.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));

async function engine() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "site-menu.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "site-menu.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

describe.skipIf(!haveBindings)("site menu on the real engine", () => {
  async function open() {
    const mod = await engine();
    const repo = mod.SrsRepository.load(
      readFileSync(path.join(__dirname, "../e2e/fixtures/site.srsj"), "utf8")
    );
    const { findSite } = await import("../src/lib/site/site-views.js");
    const { listPages } = await import("../src/lib/site/site-model.js");
    const menu = await import("../src/lib/site/site-menu.js");
    const { DocumentHistory, snapshotDocument } = await import("../src/lib/document.js");
    const site = findSite(repo);
    if (!site) throw new Error("no site");
    const menuId = menu.findMenu(repo);
    if (!menuId) throw new Error("no menu");
    const page = (key: string) => {
      const p = listPages(repo, site).find((x) => x.key === key);
      if (!p) throw new Error(`no page ${key}`);
      return p;
    };
    const shape = () => menu.menuItems(repo, menuId).map((i) => [i.label, i.depth, i.href ?? null]);
    return { repo, site, menuId, menu, page, shape, DocumentHistory, snapshotDocument };
  }

  it("reads the menu: page items follow their page's key, a heading has no href", async () => {
    const { shape } = await open();
    expect(shape()).toEqual([
      ["Home", 0, "/"],
      ["About", 0, "/about"],
      ["Guides", 0, null],
      ["Recording", 1, "/guides/recording"],
    ]);
  });

  it("adds a page as a dropdown entry, renames, reorders and moves it back to the bar, each undoable", async () => {
    const { repo, site, menuId, menu, page, shape, DocumentHistory, snapshotDocument } =
      await open();
    const history = new DocumentHistory();
    const step = (fn: () => void) => {
      const before = snapshotDocument(repo, [menuId], [], menu.MENU_RELATIONS);
      fn();
      history.push(before, snapshotDocument(repo, [menuId], [], menu.MENU_RELATIONS));
    };
    const start = shape();
    let id = "";
    step(() => {
      id = menu.addMenuPage(repo, site, page("about"));
    });
    expect(shape().at(-1)).toEqual(["About", 0, "/about"]);
    step(() => menu.shiftMenuItem(repo, menuId, id, "indent")); // into Guides' dropdown
    expect(shape().slice(2)).toEqual([
      ["Guides", 0, null],
      ["Recording", 1, "/guides/recording"],
      ["About", 1, "/about"],
    ]);
    step(() => menu.renameMenuItem(repo, id, "Who we are"));
    step(() => menu.shiftMenuItem(repo, menuId, id, "up"));
    expect(shape().slice(3)).toEqual([
      ["Who we are", 1, "/about"],
      ["Recording", 1, "/guides/recording"],
    ]);
    expect(() => menu.shiftMenuItem(repo, menuId, id, "indent")).toThrow(/one dropdown level/);
    step(() => menu.shiftMenuItem(repo, menuId, id, "outdent"));
    expect(menu.menuItems(repo, menuId).find((i) => i.id === id)?.depth).toBe(0);
    expect(shape().every(([, d]) => (d as number) <= 1)).toBe(true);

    // undo walks every step back, the add included
    const end = shape();
    while (history.canUndo) history.undo(repo);
    expect(shape()).toEqual(start);
    // redo recreates the item with its `uses`: it still goes to the About page
    while (history.canRedo) history.redo(repo);
    expect(shape()).toEqual(end);
  });

  it("refuses to put a dropdown inside another, and a page item's address is its page's", async () => {
    const { repo, menuId, menu } = await open();
    const guides = menu.menuItems(repo, menuId).find((i) => i.label === "Guides");
    expect(() => menu.shiftMenuItem(repo, menuId, guides?.id ?? "", "indent")).toThrow(
      /one dropdown level/
    );
    const home = menu.menuItems(repo, menuId).find((i) => i.label === "Home");
    expect(() => menu.setMenuHref(repo, home?.id ?? "", "/x")).toThrow(/follows the page/);
    expect(() => menu.renameMenuItem(repo, home?.id ?? "", "  ")).toThrow(/needs a label/);
  });

  it("exports the bar and its dropdowns, and refuses an item that uses an unpublished page", async () => {
    const { repo, site, menu, page } = await open();
    expect(menu.exportMenu(repo, site)).toEqual([
      { label: "Home", href: "/", children: [] },
      { label: "About", href: "/about", children: [] },
      { label: "Guides", children: [{ label: "Recording", href: "/guides/recording" }] },
    ]);
    menu.addMenuLink(repo, site, "Contact", "/contact");
    expect(menu.exportMenu(repo, site)?.at(-1)).toEqual({
      label: "Contact",
      href: "/contact",
      children: [],
    });
    menu.addMenuPage(repo, site, page("scratch"));
    expect(() => menu.exportMenu(repo, site)).toThrow(/not a published page/);
  });
});
