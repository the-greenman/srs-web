// The feature contract (decision 9441693e, srs-web#639): help and UI cannot drift apart.
//  1. every `data-feature` id in a component has a ui-feature record in help/;
//  2. every record placed in the UI is presented by some component;
//  3. no feature id is used by two records, and every data-feature names a string literal.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const UI_FEATURE_TYPE_ID = "b6981a3a-d0e4-429b-9f1b-ae5090326570";
const records = walk(join(ROOT, "help/records"))
  .filter((p) => p.endsWith(".json"))
  .map((p) => JSON.parse(readFileSync(p, "utf8")))
  .filter((r) => r.typeId === UI_FEATURE_TYPE_ID)
  .map((r) => ({
    instanceId: r.instanceId as string,
    id: r.fieldValues.feature_id as string,
    placed: r.fieldValues.placement !== "concept", // as helpFor reads it
    title: r.fieldValues.title as string,
  }));
/** Ids that are an entry of some container other than the root (an editor's help). */
const rootId = JSON.parse(readFileSync(join(ROOT, "help/manifest.json"), "utf8"))
  .rootContainerId as string;
const inEditorHelp = new Set(
  walk(join(ROOT, "help/containers"))
    .filter((p) => p.includes("/entries/") && !p.includes(rootId))
    .map((p) => JSON.parse(readFileSync(p, "utf8")).instanceId as string)
);

// Every mention of the attribute in markup or code, however written. A declaration is
// `data-feature="slug"`; anything else fails unless listed as a pass-through below.
const MENTION = /data-feature\s*=\s*(\S+?)(?=[\s>/]|$)|["']data-feature["']\s*[:,]/gm;
/** Components that only pass a declared id through (e.g. `data-feature={a.feature}` from action data). */
const PASS_THROUGH: Record<string, string> = {};
const DECLARED = /^"([a-z0-9-]+(?:\.[a-z0-9-]+)+)"$/;
const mentions = walk(join(ROOT, "src"))
  .filter((p) => /\.(svelte|ts)$/.test(p))
  .flatMap((p) =>
    [...readFileSync(p, "utf8").matchAll(MENTION)].map((m) => ({
      file: relative(ROOT, p),
      raw: (m[1] ?? m[0]).trim(),
    }))
  );
const uses = mentions.flatMap((m) => {
  const id = DECLARED.exec(m.raw)?.[1];
  return id ? [{ ...m, id }] : [];
});

describe("help feature contract (decision 9441693e)", () => {
  it('every data-feature is declared as data-feature="slug" (or is a listed pass-through)', () => {
    expect(
      mentions
        .filter((m) => !DECLARED.test(m.raw) && PASS_THROUGH[m.file] !== m.raw)
        .map((m) => `${m.file}: ${m.raw}`)
    ).toEqual([]);
  });

  it("every data-feature has a help record", () => {
    const known = new Set(records.map((r) => r.id));
    expect(
      uses.filter((u) => !known.has(u.id)).map((u) => `${u.file}: ${u.id} has no help`)
    ).toEqual([]);
  });

  it("every help record placed in the UI is presented by a component", () => {
    const used = new Set(uses.map((u) => u.id));
    expect(
      records
        .filter((r) => r.placed && !used.has(r.id))
        .map((r) => `${r.id} (${r.title}) is on no component`)
    ).toEqual([]);
  });

  it("every help record is in some editor's help (else helpFor never shows it)", () => {
    expect(
      records
        .filter((r) => !inEditorHelp.has(r.instanceId))
        .map((r) => `${r.id} (${r.title}) is in no editor's container`)
    ).toEqual([]);
  });

  it("the scanner sees every way of writing the attribute", () => {
    const seen = (src: string) =>
      [...src.matchAll(MENTION)].map((m) => DECLARED.test((m[1] ?? m[0]).trim()));
    expect(seen('<b data-feature="essay.x">')).toEqual([true]);
    for (const bad of [
      "<b data-feature='essay.x'>",
      "<b data-feature=essay.x>",
      "<b data-feature={id}>",
      "{...{ 'data-feature': id }}",
      'el.setAttribute("data-feature", id)',
    ])
      expect(seen(bad)).toEqual([false]);
  });

  it("no feature id is used by two records", () => {
    const ids = records.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});
