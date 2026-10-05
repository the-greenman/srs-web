// Drift guard (#421): every @media width in src/ must be named in BREAKPOINTS.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BREAKPOINTS, DRAWER_INSPECTOR, DRAWER_NAV, NARROW, RAIL, tierOf } from "../src/lib/breakpoints";

const SRC = join(__dirname, "..", "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "srs_bindings") return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const known = new Set<number>(Object.values(BREAKPOINTS));

describe("breakpoints", () => {
  it("every @media width is named in BREAKPOINTS", () => {
    const bad: string[] = [];
    for (const file of walk(SRC).filter((p) => /\.(css|svelte)$/.test(p))) {
      const text = readFileSync(file, "utf8");
      for (const media of text.matchAll(/@media[^{]*\{/g)) {
        for (const w of media[0].matchAll(/\(\s*(max|min)-width\s*:\s*(\d+)px\s*\)/g)) {
          const n = Number(w[2]);
          // min-width: N+1 is the complement of max-width: N
          const ok = w[1] === "min" ? known.has(n - 1) : known.has(n);
          if (!ok) bad.push(`${relative(SRC, file)}: ${w[0]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("derived queries embed the BREAKPOINTS values and tierOf picks narrow, compact, full", () => {
    expect(NARROW).toContain(`${BREAKPOINTS.phone}px`);
    expect(RAIL).toContain(`${BREAKPOINTS.rail}px`);
    expect(DRAWER_NAV).toContain(`${BREAKPOINTS.compact}px`);
    expect(DRAWER_INSPECTOR).toContain(`${BREAKPOINTS.wide}px`);
    expect([tierOf(true, true), tierOf(false, true), tierOf(false, false)]).toEqual([
      "narrow",
      "compact",
      "full",
    ]);
  });
});
