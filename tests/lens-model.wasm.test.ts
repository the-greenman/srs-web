// @vitest-environment node
/**
 * Derived lenses, loaders and Context grouping against the REAL engine on the spec fixture
 * (the default test config stubs the WASM bindings, so the generated JS is copied aside).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SrsRepository } from "../src/lib/srs-client.js";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}

const fixture = (name: string) => path.resolve(__dirname, "../e2e/fixtures", name);

const NAV_SECTIONS = [
  "2ea344e1-f64e-4817-99f7-fe1b1e4046ce",
  "752dad23-8a6d-44e5-98c9-f081d2cc634e",
  "2da5d723-f09f-4acf-9b86-a99745193ee5",
  "96965ce5-ad64-45b1-8d74-eccc6773db5e",
  "97838af7-50f8-4da2-9d8f-d7dbf9296c80",
  "fdb7d202-f9a5-4c8f-a2a8-d6c79add89ce",
  "a7b772f2-0093-4ccc-8050-0f7831421eaf",
  "1dc2ab2d-7873-4179-8a40-d591e9c90bb0",
  "618920ec-c417-4f91-acce-c5ea79b743f2",
];
const COMPOSITIONS = [
  "3a000001-0000-4000-a000-000000000001",
  "3a000003-0000-4000-a000-000000000003",
  "3a000004-0000-4000-a000-000000000004",
  "3a000005-0000-4000-a000-000000000005",
  "7a000001-0000-4000-a000-000000000001",
  "7a000002-0000-4000-a000-000000000002",
];
const IDENTITY = "9288ed3d-dba7-4a3a-9fbb-a77ff919816c";
const CONCEPT_TYPE = "2a000004-0000-4000-a000-000000000004";
const PACKAGE = "006a853f-7e58-4842-85e4-ad75d4b0fe5d";
const HUB = "580cfe0e-b23e-4215-a3c4-22cbd0526810";
const DISTRIBUTION = "97838af7-50f8-4da2-9d8f-d7dbf9296c80";

describe.skipIf(!haveBindings)("lens model on the real engine (srs-spec.srs)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: the private bindings module
  let mod: any;
  let repo: SrsRepository;
  let client: typeof import("../src/lib/srs-client.js");
  let lens: typeof import("../src/lib/lens/lens.js");
  let data: typeof import("../src/lib/lens/lens-data.js");

  beforeAll(async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "lens-model.mjs"));
    mod = await import(/* @vite-ignore */ path.join(dir, "lens-model.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    repo = mod.SrsRepository.load_archive(readFileSync(fixture("srs-spec.srs")));
    client = await import("../src/lib/srs-client.js");
    lens = await import("../src/lib/lens/lens.js");
    data = await import("../src/lib/lens/lens-data.js");
  });

  it("derives one nav lens per depth-0 navigation section with a sectionContainerId (9)", () => {
    const nav = lens.deriveLenses(repo).filter((l) => l.id.startsWith("nav:"));
    expect(nav.map((l) => l.id)).toEqual(NAV_SECTIONS.map((id) => `nav:${id}`));
    expect(nav.some((l) => l.id.includes(IDENTITY))).toBe(false);
    expect(nav.every((l) => l.collection.kind === "outline")).toBe(true);
  });

  it("derives one comp lens per composition", () => {
    const comp = lens.deriveLenses(repo).filter((l) => l.id.startsWith("comp:"));
    const expected = client.listDocumentViews(repo).map((c) => `comp:${c.id}`);
    expect(comp.map((l) => l.id)).toEqual(expected);
    expect(expected).toEqual(COMPOSITIONS.map((id) => `comp:${id}`));
  });

  it("derives type lenses ordered by record count", () => {
    const lenses = lens.deriveLenses(repo);
    const types = lenses.filter((l) => l.id.startsWith("type:"));
    const counts = types.map(
      (l) => client.find(repo, { typeId: l.id.slice(5) }, { limit: 0 }).total
    );
    expect(types.length).toBeGreaterThan(1);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(types.some((l) => l.id === `type:${CONCEPT_TYPE}`)).toBe(true);
    expect(types.every((l) => !l.label.includes("/"))).toBe(true);
    expect(lenses.at(-1)?.id).toBe("find");
    expect(lenses.some((l) => l.id === "set")).toBe(false);
    expect(lens.deriveLenses(repo, [PACKAGE]).at(-1)).toMatchObject({
      id: "set",
      collection: { kind: "ids", ids: [PACKAGE] },
    });
  });

  it("lens ids are prefixed engine ids", async () => {
    const { LENS_ID } = await import("../src/lib/address.js");
    for (const l of lens.deriveLenses(repo, [PACKAGE])) {
      expect(LENS_ID.test(l.id)).toBe(true);
      const c = l.collection;
      const engineId =
        c.kind === "outline" ? c.containerId : c.kind === "composition" ? c.compositionId : c.kind === "type" ? c.typeId : null;
      if (engineId) expect(l.id.endsWith(`:${engineId}`)).toBe(true);
    }
  });

  it("type lens loads through find", () => {
    const l = lens.deriveLenses(repo).find((x) => x.id === `type:${CONCEPT_TYPE}`)!;
    const d = data.loadCollection(repo, l);
    expect(d.total).toBe(client.find(repo, { typeId: CONCEPT_TYPE }, { limit: 0 }).total);
    expect(d.items.length).toBeLessThanOrEqual(data.PAGE);
    expect(d.items.length).toBe(Math.min(d.total, data.PAGE));
    expect(d.items.every((i) => i.record && i.typeId === CONCEPT_TYPE)).toBe(true);
    expect(d.columns).toEqual([{ kind: "label" }, { kind: "type" }, { kind: "state" }]);
  });

  it("defaultContext groups only the record's own edges", () => {
    const edges = data.loadEdges(repo, PACKAGE);
    const defs = lens.defaultContext(edges, client.listRelationTypes(repo));
    const present = new Set(edges.map((e) => `${e.direction} ${e.relationType}`));
    expect(defs.length).toBe(present.size);
    for (const d of defs) expect(present.has(`${d.direction} ${d.relationType}`)).toBe(true);
    expect(defs.some((d) => d.relationType === "depends-on" && d.direction === "out")).toBe(true);
    const used = new Set(edges.map((e) => e.relationType));
    for (const t of client.listRelationTypes(repo))
      if (!used.has(t.key)) expect(defs.some((d) => d.relationType === t.key)).toBe(false);
  });

  it("an unlisted relation key sorts last with a humanised label", () => {
    const edges = [
      { id: "x", label: "X", direction: "in" as const, relationType: "ex.ample/made-up_key" },
      { id: "y", label: "Y", direction: "out" as const, relationType: "depends-on" },
    ];
    const defs = lens.defaultContext(edges, client.listRelationTypes(repo));
    expect(defs.at(-1)).toEqual({ relationType: "ex.ample/made-up_key", direction: "in", label: "Ex ample/made up key this" });
    expect(defs[0].relationType).toBe("depends-on");
  });

  it("group labels come from RelationTypeInfo.label", () => {
    const types = client.listRelationTypes(repo);
    const dependsOn = types.find((t) => t.key === "depends-on")!;
    const defs = lens.defaultContext(data.loadEdges(repo, PACKAGE), types);
    const out = defs.find((d) => d.relationType === "depends-on" && d.direction === "out")!;
    expect(out.label).toBe(dependsOn.label);
    expect(out.label).toBe("Depends on");
    // A synthetic engine label wins over the key.
    expect(lens.defaultContext([{ id: "y", label: "Y", direction: "out", relationType: "depends-on" }], [{ key: "depends-on", label: "Needs" }])[0].label).toBe("Needs");
    expect(lens.defaultContext([{ id: "y", label: "Y", direction: "out", relationType: "depends-on" }], [{ key: "depends-on", label: "" }])[0].label).toBe("Depends on");
  });

  it("link groups name their direction: outgoing first as the engine label, incoming after as label + this", () => {
    const edges = [
      { id: "a", label: "A", direction: "in" as const, relationType: "depends-on" },
      { id: "b", label: "B", direction: "out" as const, relationType: "contains" },
      { id: "c", label: "C", direction: "out" as const, relationType: "depends-on" },
      { id: "d", label: "D", direction: "in" as const, relationType: "contains" },
    ];
    const defs = lens.defaultContext(edges, client.listRelationTypes(repo));
    expect(defs.map((d) => [d.direction, d.label])).toEqual([
      ["out", "Contains"],
      ["out", "Depends on"],
      ["in", "Contains this"],
      ["in", "Depends on this"],
    ]);
    // An inverseType naming an installed type labels the incoming group by that type's engine label.
    const types = [
      { key: "precedes", label: "Precedes", inverseType: "follows" },
      { key: "follows", label: "Follows" },
    ];
    expect(lens.defaultContext([{ id: "x", label: "X", direction: "in", relationType: "precedes" }], types)[0].label).toBe("Follows");
    // An inverseType the engine does not install falls back to the generic rule.
    expect(lens.defaultContext([{ id: "x", label: "X", direction: "in", relationType: "precedes" }], types.slice(0, 1))[0].label).toBe("Precedes this");
  });

  it("hub record: loadEdges returns every edge and groups page it", () => {
    const spy = vi.spyOn(repo, "neighbours");
    const edges = data.loadEdges(repo, HUB);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(edges.length).toBe(41);
    expect(edges.length).toBe(client.neighbours(repo, HUB).total);
    const groups = data.groupEdges(edges, lens.defaultContext(edges, client.listRelationTypes(repo)));
    expect(groups.reduce((n, g) => n + g.total, 0)).toBe(41);
    for (const g of groups) expect(g.items.length).toBe(g.total);
  });

  it("loadCollection outline returns members in arranged order with depth", () => {
    const l = lens.deriveLenses(repo).find((x) => x.id === `nav:${DISTRIBUTION}`)!;
    const d = data.loadCollection(repo, l);
    const outline = client.getContainerOutline(repo, DISTRIBUTION).body;
    expect(d.items.map((i) => [i.id, i.depth])).toEqual(outline.map((e) => [e.instanceId, e.depth]));
    expect(d.items.some((i) => i.id === PACKAGE)).toBe(true);
    expect(d.total).toBe(d.items.length);
    // Distribution's ColumnSpec is empty, so the columns fall back to label, type and state (lens-board.test.ts).
    expect(client.resolveContainerView(repo, DISTRIBUTION).columns).toHaveLength(0);
    expect(d.columns).toEqual([{ kind: "label" }, { kind: "type" }, { kind: "state" }]);
  });

  it("item and link type names go through the shared humanise", async () => {
    const { humanise } = await import("../src/lib/labels.js");
    const l = lens.deriveLenses(repo).find((x) => x.id === `nav:${DISTRIBUTION}`)!;
    const typed = data.loadCollection(repo, l).items.filter((i) => i.record?.typeName);
    expect(typed.length).toBeGreaterThan(0);
    for (const i of typed) expect(i.typeName).toBe(humanise(i.record!.typeName!));
    const raw = client.neighbours(repo, PACKAGE).neighbours;
    data.loadEdges(repo, PACKAGE).forEach((e, n) =>
      expect(e.typeName).toBe(raw[n].neighbour.typeName ? humanise(raw[n].neighbour.typeName!) : undefined)
    );
  });

  it("shownIn is empty on srs-spec", () => {
    const containers = client.listContainers(repo).map((c) => c.containerId);
    expect(containers.length).toBeGreaterThan(0);
    expect(data.shownIn(repo, containers)).toEqual([]);
  });

  it("shownIn lists a bound composition (gallery)", () => {
    const gallery: SrsRepository = mod.SrsRepository.load(readFileSync(fixture("gallery.srsj"), "utf8"));
    const record = "ad159754-2edd-4bf8-a70f-a29a617e5809";
    expect(data.shownIn(gallery, data.containersOf(gallery, record))).toContainEqual({
      compositionId: "78b11038-e5d8-4269-9982-fe5c459802b2",
      containerId: "f7562aa3-98c7-44be-b4c5-5474df6441f2",
      label: expect.any(String),
    });
  });
});
