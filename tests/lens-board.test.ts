// @vitest-environment happy-dom
/**
 * The board layout's columns (ADR-010 as extended by ADR-025, D6 follow-up): ColumnSpec on navigation
 * lenses, label/type/state on every other lens (gap 6), and never a column no row fills. The column
 * sources run against the REAL engine on the spec fixture (bindings copied aside, the lens-model pattern).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";
import Collection from "../src/lib/lens/Collection.svelte";
import type { CollectionData, Item } from "../src/lib/lens/lens-data.js";
import type { SrsRepository } from "../src/lib/srs-client.js";

const rec = (id: string, fieldValues: Record<string, unknown>) => ({ instanceId: id, typeId: "t", typeVersion: 1, fieldValues });
const items: Item[] = [
  { id: "a", label: "Alpha", typeName: "Claim", depth: 0, record: rec("a", { kind: "x" }) },
  { id: "b", label: "Beta", typeName: "Source", depth: 0, record: rec("b", {}) },
];
const headers = (c: HTMLElement) => [...c.querySelectorAll("thead th")].map((th) => th.textContent?.trim());

describe("lens board", () => {
  it("board omits columns no row fills", () => {
    const data: CollectionData = {
      items,
      columns: [
        { kind: "field", fieldId: "f-kind", fieldName: "kind", label: "Kind" },
        { kind: "field", fieldId: "f-scale", fieldName: "scale", label: "Scale" },
        { kind: "type" },
        { kind: "state" },
      ],
      total: 2,
    };
    const { container } = render(Collection, { data, mode: "table", by: "none", onSelect: () => {} });
    // Kind has a value; Scale and State do not; Type is dropped under "Nothing" (labels only).
    expect(headers(container)).toEqual(["", "Kind"]);
    const typed = render(Collection, { data, mode: "table", by: "nesting", onSelect: () => {} });
    expect(headers(typed.container)).toEqual(["", "Kind", "Type"]);
  });
});

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
const DISTRIBUTION = "97838af7-50f8-4da2-9d8f-d7dbf9296c80";
const ROLES = "b30db206-e9a7-4588-a9aa-53451aacd243"; // gallery.srsj section with a ColumnSpec
const PACKAGE = "006a853f-7e58-4842-85e4-ad75d4b0fe5d";
const FIXED = [{ kind: "label" }, { kind: "type" }, { kind: "state" }];

describe.skipIf(!haveBindings)("lens board columns on the real engine (srs-spec.srs)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: the private bindings module
  let mod: any;
  let repo: SrsRepository;
  let client: typeof import("../src/lib/srs-client.js");
  let lens: typeof import("../src/lib/lens/lens.js");
  let data: typeof import("../src/lib/lens/lens-data.js");

  beforeAll(async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "lens-board.mjs"));
    mod = await import(/* @vite-ignore */ path.join(dir, "lens-board.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    repo = mod.SrsRepository.load_archive(readFileSync(path.resolve(__dirname, "../e2e/fixtures/srs-spec.srs")));
    client = await import("../src/lib/srs-client.js");
    lens = await import("../src/lib/lens/lens.js");
    data = await import("../src/lib/lens/lens-data.js");
  });

  it("type, composition, find and set lenses show label, type and state columns only", () => {
    const all = lens.deriveLenses(repo, [PACKAGE]);
    const pick = (prefix: string) => all.find((l) => l.id.startsWith(prefix))!;
    for (const l of [pick("type:"), pick("comp:"), pick("find"), pick("set")]) {
      expect(l, l.id).toBeDefined();
      expect(data.loadCollection(repo, l).columns, l.id).toEqual(FIXED);
    }
  });

  it("nav lens columns are the ColumnSpec", () => {
    // srs-spec declares no ColumnSpec on its sections (columns: []); gallery's Roles section declares three.
    const gallery = mod.SrsRepository.load(readFileSync(path.resolve(__dirname, "../e2e/fixtures/gallery.srsj"), "utf8"));
    for (const [r, containerId, n] of [[repo, DISTRIBUTION, 0], [gallery, ROLES, 3]] as const) {
      const l = lens.deriveLenses(r).find((x) => x.id === `nav:${containerId}`)!;
      const spec = [...client.resolveContainerView(r, containerId).columns].sort((a, b) => a.order - b.order).slice(0, 4);
      expect(spec).toHaveLength(n);
      expect(data.loadCollection(r, l).columns).toEqual(
        spec.map((c) => ({ kind: "field", fieldId: c.fieldId, fieldName: c.fieldName, label: c.displayLabel }))
      );
    }
  });
});
