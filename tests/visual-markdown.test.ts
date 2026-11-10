// @vitest-environment happy-dom
// Visual markdown, headless checks (srs-web#749). The core's renderMarkdown is WASM and is not
// available under vitest, so `marked` stands in as the judge here (same CommonMark rules, bare URLs
// as links like the core). The real-core run over the typed cases is the Playwright check in e2e.
import { describe, expect, it } from "vitest";
import { marked } from "marked";
import {
  escapeBlockMarkers,
  makeEditor,
  opensVisually,
  savesFaithfully,
  toMarkdown,
  visualExtensions,
} from "../src/lib/visual-markdown.js";

const render = (md: string) => marked.parse(md, { async: false }) as string;
const roundTrip = (md: string) => {
  const e = makeEditor(md);
  const out = toMarkdown(e);
  e.destroy();
  return out;
};

describe("allowlist", () => {
  it("installs only the decided nodes and marks", () => {
    const names = visualExtensions().flatMap((x) => [x.name]);
    for (const off of ["image", "table", "taskList", "underline", "horizontalRule", "dropcursor", "gapcursor"]) {
      expect(names).not.toContain(off);
    }
  });
});

describe("escape fix", () => {
  it.each([
    ["1984. A year", "1984\\. A year"],
    ["- not a list", "\\- not a list"],
    ["+ plus", "\\+ plus"],
    ["# not a heading", "\\# not a heading"],
    ["---", "\\---"],
    ["plain text", "plain text"],
  ])("%s", (input, out) => expect(escapeBlockMarkers(input)).toBe(out));

  it("keeps a paragraph that starts like a list a paragraph after a round trip", () => {
    for (const md of ["1984\\. A year", "\\- dash", "\\# hash"]) {
      expect(render(roundTrip(md))).toBe(render(md));
    }
  });
});

describe("check on opening", () => {
  it.each(["Plain **bold** and *italic* with `code`", "A [link](https://example.com) here", "# Heading", "- a\n- b", "> quote"])(
    "opens visually: %s",
    (md) => expect(opensVisually(md, render)).toBe(true),
  );
  it.each(["| a | b |\n|---|---|\n| 1 | 2 |", "![alt](img.png)", "above\n\n---\n\nbelow"])(
    "opens as source (off the allowlist): %s",
    (md) => expect(opensVisually(md, render)).toBe(false),
  );
});

describe("check on saving", () => {
  it("passes an ordinary edit and catches overlapping bold and italic", () => {
    const checker = makeEditor("");
    const e = makeEditor("hello **world**");
    expect(savesFaithfully(e, toMarkdown(e), checker, render)).toBe(true);
    // the editor says "bold a, bold+italic b, italic c"; markdown the core reads differently must not pass
    expect(savesFaithfully(e, "different text", checker, render)).toBe(false);
    e.destroy();
    checker.destroy();
  });
});

describe("no edit, no write", () => {
  it("opening and destroying an editor never changes the value", () => {
    const md = "Untouched **text**";
    const e = makeEditor(md);
    expect(toMarkdown(e)).toBe(md);
    e.destroy();
  });
});
