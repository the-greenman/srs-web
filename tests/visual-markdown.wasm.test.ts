// @vitest-environment happy-dom
/**
 * Visual markdown judged by the REAL core (srs-web#749, decision bf0229dd; finding e640280f).
 * The unit tests (visual-markdown.test.ts) use `marked` as a stand-in judge; this file loads the
 * real renderMarkdown from the WASM bindings, as markdown.wasm.test.ts does.
 *
 * Typed cases: finding e640280f measured 37 cases of text entered in the editor but did not keep
 * the list, so this is a reconstructed set of 37 over the same ground (block markers at the start
 * of a paragraph, inline punctuation, marks, and the two serializer defects it names). A case is
 * "silently wrong" when the core renders the saved markdown differently from the editor's document
 * and the save check does not flag it; none may be.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import { makeEditor, opensVisually, savesFaithfully, toMarkdown } from "../src/lib/visual-markdown.js";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}

let render: (md: string, images?: boolean) => string;

/** Tag skeleton and text of rendered HTML: attributes other than href dropped, whitespace and split marks ignored. */
function canon(html: string): string {
  const t = document.createElement("template");
  t.innerHTML = html;
  const walk = (n: Node): string => {
    // Text is escaped, so a literal "<em>" shown to the reader never equals an <em> element.
    if (n.nodeType === 3) return (n.textContent ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (n.nodeType !== 1) return "";
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const inner = [...el.childNodes].map(walk).join("");
    if (tag === "br") return " ";
    if (tag === "p" && !inner.trim()) return "";
    const href = el.getAttribute("href");
    return `<${tag}${href ? ` href=${href}` : ""}>${inner}</${tag}>`;
  };
  return [...t.content.childNodes]
    .map(walk)
    .join("")
    .replace(/\s+/g, "")
    .replace(/<\/strong><strong>|<\/em><em>|<\/s><s>|<\/del><del>/g, "")
    .replace(/<(\/?)del>/g, "<$1s>");
}

const text = (t: string, marks?: string[], href?: string): JSONContent => ({
  type: "text",
  text: t,
  ...(marks ? { marks: marks.map((m) => (m === "link" ? { type: m, attrs: { href } } : { type: m })) } : {}),
});
const para = (...content: JSONContent[]): JSONContent => ({ type: "doc", content: [{ type: "paragraph", content }] });
const typed = (t: string) => para(text(t));

/** Text a writer types into the editor, as the document it makes (37 cases). */
const TYPED: [string, JSONContent][] = [
  ["numbered marker", typed("1984. A year")],
  ["numbered marker, paren", typed("1984) A year")],
  ["dash bullet", typed("- x")],
  ["plus bullet", typed("+ x")],
  ["star bullet", typed("* x")],
  ["heading marker", typed("# x")],
  ["level-6 heading marker", typed("###### x")],
  ["dash rule", typed("---")],
  ["equals line", typed("===")],
  ["star rule", typed("***")],
  ["underscore rule", typed("___")],
  ["quote marker", typed("> quoted")],
  ["four-space indent", typed("    four spaces")],
  ["backtick fence", typed("```fence")],
  ["tilde fence", typed("~~~tilde")],
  ["snake_case", typed("snake_case_name")],
  ["spaced stars", typed("2 * 3 * 4")],
  ["stars in a word", typed("a*b*c")],
  ["underscores around a word", typed("under_score_ and _x_")],
  ["literal backticks", typed("use `backticks` literally")],
  ["link syntax as text", typed("[not a link](x)")],
  ["reference definition as text", typed("[ref]: https://example.com")],
  ["HTML as text", typed("<em>tag</em> text")],
  ["angle brackets and ampersand", typed("a < b > c & d")],
  ["bare URL", typed("see https://example.com here")],
  ["backslashes", typed("back\\slash \\* escaped")],
  ["tildes as text", typed("~~not strike~~")],
  ["table row as text", typed("| a | b |")],
  ["image syntax as text", typed("![alt](img.png)")],
  ["marker after a hard break", para(text("first"), { type: "hardBreak" }, text("- second"))],
  ["bold mid-sentence", para(text("a "), text("b", ["bold"]), text(" c"))],
  ["italic with a trailing space in the mark", para(text("word ", ["italic"]), text("next"))],
  ["code holding a backtick", para(text("a`b", ["code"]))],
  ["link", para(text("go "), text("here", ["link"], "https://example.com"))],
  ["strikethrough", para(text("gone", ["strike"]))],
  ["defect: bold (a) inside a word", para(text("x"), text("(a)", ["bold"]), text("y"))],
  ["defect: overlapping bold and italic", para(text("a", ["bold"]), text("b", ["bold", "italic"]), text("c", ["italic"]))],
];

describe.skipIf(!haveBindings)("visual markdown on the real core", () => {
  let checker: Editor;
  beforeAll(async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "visual-markdown.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "visual-markdown.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    render = (md, images = true) => mod.renderMarkdown(md, images);
    checker = makeEditor("");
  });

  it("has 37 typed cases", () => expect(TYPED).toHaveLength(37));

  it.each(TYPED)("typed: %s is never silently wrong", (name, doc) => {
    const e = makeEditor("");
    e.commands.setContent(doc);
    const md = toMarkdown(e);
    const faithful = canon(render(md)) === canon(e.getHTML());
    const flagged = !savesFaithfully(e, md, checker, render);
    e.destroy();
    // Either the core shows what the writer saw, or the save check sends the paragraph to source.
    expect({ name, md, silentlyWrong: !faithful && !flagged }).toEqual({ name, md, silentlyWrong: false });
    // No false alarm: a faithful save is never flagged.
    expect({ name, md, falseAlarm: faithful && flagged }).toEqual({ name, md, falseAlarm: false });
    if (name.startsWith("defect:")) expect({ name, md, flagged }).toEqual({ name, md, flagged: true });
  });

  it.each([
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |"],
    ["an image", "![alt](https://example.com/x.png)"],
    ["an image with no alt text", "see ![](https://example.com/x.png) here"],
    ["a rule", "above\n\n---\n\nbelow"],
  ])("a paragraph with %s opens as source", (_n, md) => {
    expect(opensVisually(md, render)).toBe(false);
  });

  it("judges images on, so an essay paragraph's image (rendered as alt text) never opens visually", () => {
    // The essay renders images off (srs-web#763); with images off `![](x)` renders as nothing, and a
    // round trip that dropped the image would pass. The judge renders with images on.
    const md = "before ![](https://example.com/x.png) after";
    expect(render(md, false)).not.toContain("<img");
    expect(opensVisually(md, (m) => render(m))).toBe(false);
  });

  it("no false alarm on public/examples: every paragraph opens and round-trips faithfully, or falls back to source", () => {
    const dir = path.resolve(__dirname, "../public/examples");
    const bodies: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".srsj"))) {
      const data = JSON.parse(readFileSync(path.join(dir, f), "utf8")).data as Record<string, { fieldValues?: Record<string, unknown> }>;
      for (const [k, r] of Object.entries(data)) {
        const body = k.startsWith("records/") ? r.fieldValues?.body : undefined;
        if (typeof body === "string" && body) bodies.push(body);
      }
    }
    expect(bodies.length).toBeGreaterThan(0);
    const falseAlarms: string[] = [];
    let visual = 0;
    for (const md of bodies) {
      if (!opensVisually(md, render)) continue;
      visual++;
      const e = makeEditor(md);
      if (!savesFaithfully(e, toMarkdown(e), checker, render)) falseAlarms.push(md);
      e.destroy();
    }
    expect(falseAlarms).toEqual([]);
    expect(visual).toBeGreaterThan(0);
  });
});
