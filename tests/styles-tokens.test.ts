// Static guard (#421): shared component styles read only semantic or component
// tokens. No raw palette, no colour literals, no colour fallbacks.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const EXCLUDED_CSS = [
  "src/styles/tokens.css",
  "src/styles/tokens-components.css",
  "src/styles/components/styleguide.css",
];
const css = walk(join(ROOT, "src/styles"))
  .map((p) => relative(ROOT, p))
  .filter(
    (p) => p.endsWith(".css") && !EXCLUDED_CSS.includes(p) && !p.startsWith("src/styles/themes/")
  );
const svelteIn = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((n) => n.endsWith(".svelte"))
    .map((n) => `${dir}/${n}`);
/** The four shells (#424, #463): all on component CSS, so they may carry no scoped style at all. */
const SHELL_FILES = [
  ...svelteIn("src/lib/generic"),
  ...svelteIn("src/lib/governance"),
  ...svelteIn("src/lib/guides"),
  ...svelteIn("src/lib/essay"),
];
/** Editors whose controls moved onto Button/IconButton (#428): scanned for raw colour too. */
const EDITOR_FILES = ["src/lib/editor/SectionForm.svelte", "src/lib/editor/BlueprintDocumentEditor.svelte"];
const svelte = [...svelteIn("src/lib/components"), ...SHELL_FILES, ...EDITOR_FILES];
/** Files migrated onto the Modal and Button primitives (#428): no one-off button or dialog classes. */
const MIGRATED = [
  ...EDITOR_FILES,
  ...["GitSaveModal", "SuccessorModal", "DecisionLinkPicker", "DecisionLogView", "SourceChooser"].map(
    (n) => `src/lib/components/${n}.svelte`
  ),
];
const ONE_OFF = /[\w-]*(?:modal-btn|modal-overlay|modal-dialog|te-btn|__[\w-]*btn|group__add)\b/g;

/** Allowed exceptions: every entry needs a reason. */
const HUE =
  "hue is per element (--actor-hue); saturation and lightness come from --hue-pill-* tokens";
const ALLOW: { file: string; pattern: RegExp; reason: string }[] = [
  { file: "src/styles/components/comments.css", pattern: /^hsl\($/, reason: HUE },
];

const FLAGS: [string, RegExp][] = [
  ["raw palette token", /var\(--(ink|paper|black|grey-\d|white)\b/g],
  ["hex colour", /#[0-9a-fA-F]{3,8}\b/g],
  ["rgb()", /rgba?\(/g],
  ["hsl()", /hsla?\(/g],
  [
    "colour fallback",
    /var\(--[\w-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|(white|black|red|gray|grey|blue|green|yellow|orange)\b)/g,
  ],
];

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

function scannable(file: string): string {
  const src = readFileSync(join(ROOT, file), "utf8");
  if (file.endsWith(".css")) return stripComments(src);
  const blocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return blocks.map((b) => stripComments(b[1])).join("\n");
}

describe("styles use tokens only", () => {
  it("flags no raw colour in shared styles", () => {
    const hits: string[] = [];
    for (const file of [...css, ...svelte]) {
      const text = scannable(file);
      for (const [name, re] of FLAGS) {
        for (const m of text.matchAll(re)) {
          if (ALLOW.some((a) => a.file === file && a.pattern.test(m[0]))) continue;
          const line = text.slice(0, m.index).split("\n").length;
          hits.push(`${file}:${line} ${name}: ${m[0]}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("migrated files carry no one-off button or dialog class", () => {
    const hits = MIGRATED.flatMap((file) =>
      [...readFileSync(join(ROOT, file), "utf8").matchAll(ONE_OFF)].map((m) => `${file}: ${m[0]}`)
    );
    expect(hits).toEqual([]);
  });

  it("a converted shell has no scoped style block (its CSS is a component stylesheet)", () => {
    for (const file of SHELL_FILES) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/<style[\s>]/);
    }
  });

  it("every ALLOW entry has a reason", () => {
    for (const a of ALLOW) expect(a.reason.length).toBeGreaterThan(0);
  });
});
