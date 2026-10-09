// Static guards for Lenses (ADR-025): the plan's no-literals and gap-cites checks, committed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const walk = (p: string): string[] =>
  statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p];
const files = (...paths: string[]) => paths.flatMap((p) => walk(join(ROOT, p)));
const read = (p: string) => readFileSync(p, "utf8");

/** A UUID, a quoted `com.*` namespace, or a quoted core relation key. */
const LITERAL =
  /[0-9a-f]{8}-[0-9a-f]{4}-|["'`]com\.[a-z]|["'`](contains|depends-on|supersedes|refines|derived-from|evidences|precedes)["'`]/;

describe("lens guards", () => {
  it("no-literals: no UUID, namespace or core relation key in lens code or RecordProse", () => {
    const hits = files("src/lib/lens", "src/rendering/RecordProse.svelte").flatMap((p) =>
      read(p)
        .split("\n")
        .map((line, i) => (LITERAL.test(line) ? `${relative(ROOT, p)}:${i + 1}: ${line.trim()}` : ""))
        .filter(Boolean)
    );
    expect(hits).toEqual([]);
  });

  it("gap-cites: every ADR-025 gap cited in src is an item of ADR-025's gap list", () => {
    const adr = read(join(ROOT, "docs/adr/025-lenses.md"));
    const cited = new Set(
      files("src").flatMap((p) => [...read(p).matchAll(/ADR-025 gap (\d+)/g)].map((m) => m[1]))
    );
    expect(cited.size).toBeGreaterThan(0);
    const missing = [...cited].filter((n) => !new RegExp(`^${n}\\. `, "m").test(adr));
    expect(missing).toEqual([]);
  });

  it("the guard pattern catches each kind of literal", () => {
    for (const bad of ['"006a853f-7e58-4842"', '"com.semanticops.spec"', "'depends-on'", "`precedes`"])
      expect(LITERAL.test(bad)).toBe(true);
    expect(LITERAL.test("humanise(key)")).toBe(false);
  });
});
