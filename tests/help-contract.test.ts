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

const records = walk(join(ROOT, "help/records"))
  .filter((p) => p.endsWith(".json"))
  .map((p) => JSON.parse(readFileSync(p, "utf8")))
  .filter((r) => r.typeName === "ui-feature")
  .map((r) => ({
    id: r.fieldValues.feature_id as string,
    placement: r.fieldValues.placement as string,
    title: r.fieldValues.title as string,
  }));

const USE = /\bdata-feature=("[^"]*"|\{[^}]*\})/g;
const uses = walk(join(ROOT, "src"))
  .filter((p) => p.endsWith(".svelte"))
  .flatMap((p) =>
    [...readFileSync(p, "utf8").matchAll(USE)].map((m) => ({
      file: relative(ROOT, p),
      raw: m[1].trim(),
    }))
  );
const literal = (raw: string) => /^"([\w.-]+)"$/.exec(raw)?.[1];

describe("help feature contract (decision 9441693e)", () => {
  it("every data-feature names a string literal", () => {
    expect(uses.filter((u) => !literal(u.raw)).map((u) => `${u.file}: ${u.raw}`)).toEqual([]);
  });

  it("every data-feature has a help record", () => {
    const known = new Set(records.map((r) => r.id));
    expect(
      uses
        .filter((u) => !known.has(literal(u.raw) ?? ""))
        .map((u) => `${u.file}: ${u.raw} has no help`)
    ).toEqual([]);
  });

  it("every help record placed in the UI is presented by a component", () => {
    const used = new Set(uses.map((u) => literal(u.raw)));
    expect(
      records
        .filter((r) => r.placement === "ui" && !used.has(r.id))
        .map((r) => `${r.id} (${r.title}) is on no component`)
    ).toEqual([]);
  });

  it("no feature id is used by two records", () => {
    const ids = records.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});
