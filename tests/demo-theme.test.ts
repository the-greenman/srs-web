// Contract guard (#421): the demo theme re-points every semantic colour and shadow token, and none
// of its colours equals a default palette value (a bypass would then be visible as a palette colour).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const tokens = read("src/styles/tokens.css");
const demo = read("src/styles/themes/demo.css");

const decls = (css: string) =>
  [...css.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
  }));

const semantic = decls(tokens).filter((d) => /^--(color|shadow)-/.test(d.name));
// Derived tokens follow the token they are mixed from, so they need no override of their own.
const needed = semantic.filter((d) => !d.value.includes("color-mix("));
const demoMap = new Map(decls(demo).map((d) => [d.name, d.value]));

describe("demo theme", () => {
  it("re-points every semantic colour and shadow token", () => {
    const missing = needed.filter((d) => !demoMap.has(d.name)).map((d) => d.name);
    expect(missing).toEqual([]);
  });

  it("re-points no primitive palette token", () => {
    const palette = ["--black", "--paper", "--ink", "--grey-1", "--grey-2", "--grey-3", "--grey-4"];
    expect(palette.filter((n) => demoMap.has(n))).toEqual([]);
  });

  it("uses no default palette colour as a value", () => {
    const palette = new Map(
      decls(tokens)
        .filter((d) => /^--(black|paper|ink|grey-\d)$/.test(d.name))
        .map((d) => [d.value.toLowerCase(), d.name])
    );
    palette.set("#fff", "--color-page");
    const rgbOf = (hex: string) => {
      const h = hex.slice(1);
      const f = h.length <= 4 ? [...h].map((c) => c + c) : h.match(/../g)!;
      return f
        .slice(0, 3)
        .map((x) => Number.parseInt(x, 16))
        .join(",");
    };
    const hslToRgb = (hh: number, ss: number, ll: number) => {
      const s = ss / 100,
        l = ll / 100,
        k = (n: number) => (n + hh / 30) % 12,
        a = s * Math.min(l, 1 - l);
      return [0, 8, 4]
        .map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))))
        .join(",");
    };
    const paletteRgb = new Set([...palette.keys()].map(rgbOf));
    const triples = (v: string) => [
      ...(v.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map(rgbOf),
      ...[...v.matchAll(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/g)].map(
        (m) => `${m[1]},${m[2]},${m[3]}`
      ),
      ...[...v.matchAll(/hsla?\(\s*([\d.]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%/g)].map((m) =>
        hslToRgb(+m[1], +m[2], +m[3])
      ),
    ];
    const clash = [...demoMap]
      .filter(([n]) => n.startsWith("--color-") || n.startsWith("--shadow-"))
      .flatMap(([n, v]) => triples(v).map((t) => [n, t]))
      .filter(([, t]) => paletteRgb.has(t));
    expect(clash).toEqual([]);
  });

  it("overrides only semantic tokens, never a component token", () => {
    const semanticName = /^--(color|shadow|font|radius|size|space|leading|tracking|z|focus|hit)-/;
    expect([...demoMap.keys()].filter((n) => !semanticName.test(n) && n !== "--font-sans")).toEqual(
      []
    );
    const component = new Set(decls(read("src/styles/tokens-components.css")).map((d) => d.name));
    expect([...demoMap.keys()].filter((n) => component.has(n))).toEqual([]);
  });
});
