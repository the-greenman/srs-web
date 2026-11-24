// @vitest-environment happy-dom
// Visual markdown, headless checks (srs-web#749). The core's renderMarkdown is WASM and is not
// available under vitest, so `marked` stands in as the judge here (same CommonMark rules, bare URLs
// as links like the core). The real-core run over the typed cases is visual-markdown.wasm.test.ts.
import { describe, expect, it } from "vitest";
import { marked } from "marked";
import {
  atStart,
  escapeBlockMarkers,
  FORMATS,
  makeEditor,
  opensVisually,
  savesFaithfully,
  setLink,
  splitAt,
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
    for (const off of [
      "image",
      "table",
      "taskList",
      "underline",
      "horizontalRule",
      "dropcursor",
      "gapcursor",
    ]) {
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
  it.each([
    "Plain **bold** and *italic* with `code`",
    "A [link](https://example.com) here",
    "# Heading",
    "- a\n- b",
    "> quote",
  ])("opens visually: %s", (md) => expect(opensVisually(md, render)).toBe(true));
  it.each(["| a | b |\n|---|---|\n| 1 | 2 |", "![alt](img.png)", "above\n\n---\n\nbelow"])(
    "opens as source (off the allowlist): %s",
    (md) => expect(opensVisually(md, render)).toBe(false)
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

  it.each(["heading2", "bulletList", "orderedList", "blockquote"])(
    "an empty %s passes: its text is not typed yet",
    (name) => {
      for (const md of ["", "text"]) {
        const checker = makeEditor("");
        const e = makeEditor(md);
        if (md) e.chain().setTextSelection(e.state.doc.content.size - 1).splitBlock().run();
        FORMATS.flatMap((f) => ("menu" in f ? f.menu : [f]))
          .find((f) => f.name === name)!
          .run(e);
        expect(savesFaithfully(e, toMarkdown(e), checker, render)).toBe(true);
        e.destroy();
        checker.destroy();
      }
    }
  );

  // Typed text: the editor holds the plain text; the saved markdown must read back the same.
  const typedDoc = (t: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  });
  it.each(["1984. A year", "- x", "# x", "---", "snake_case", "a < b & c"])(
    "passes typed text after the escape fix: %s",
    (t) => {
      const checker = makeEditor("");
      const e = makeEditor("");
      e.commands.setContent(typedDoc(t));
      expect(savesFaithfully(e, toMarkdown(e), checker, render)).toBe(true);
      e.destroy();
      checker.destroy();
    }
  );

  it.each([
    ["1984. A year", "1984. A year"],
    ["- x", "- x"],
    ["# x", "# x"],
  ])("catches typed %s saved without the escape", (t, unescaped) => {
    const checker = makeEditor("");
    const e = makeEditor("");
    e.commands.setContent(typedDoc(t));
    expect(savesFaithfully(e, unescaped, checker, render)).toBe(false);
    e.destroy();
    checker.destroy();
  });

  it("catches bold on (a) inside a word", () => {
    const checker = makeEditor("");
    const e = makeEditor("");
    e.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x" },
            { type: "text", text: "(a)", marks: [{ type: "bold" }] },
            { type: "text", text: "y" },
          ],
        },
      ],
    });
    expect(savesFaithfully(e, toMarkdown(e), checker, render)).toBe(false);
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

describe("keyboard (srs-web#750)", () => {
  /** The document position just before the first occurrence of `text`. */
  const posOf = (e: ReturnType<typeof makeEditor>, text: string) => {
    let at = -1;
    e.state.doc.descendants((n, pos) => {
      const i = n.isText ? n.text!.indexOf(text) : -1;
      if (at < 0 && i >= 0) at = pos + i;
    });
    return at;
  };

  it.each([
    ["one **two** three", "three", ["one **two**", "three"]],
    ["first para\n\nsecond para", "second", ["first para", "second para"]],
    ["- a\n- b", "b", ["- a", "- b"]],
    ["1984\\. A year then more", "then", ["1984\\. A year", "then more"]],
  ])("splits %j at %j into two markdown halves", (md, at, halves) => {
    const e = makeEditor(md);
    expect(splitAt(e, posOf(e, at))).toEqual(halves);
    e.destroy();
  });

  it("a split at the end of a list item leaves no empty item", () => {
    const e = makeEditor("- a\n- b");
    expect(splitAt(e, posOf(e, "a") + 1)).toEqual(["- a", "- b"]);
    e.destroy();
  });

  it("a split with an empty half is no split", () => {
    const e = makeEditor("only text");
    expect(splitAt(e, 1)).toBeNull();
    expect(splitAt(e, e.state.doc.content.size - 1)).toBeNull();
    e.destroy();
  });

  it("start is the document's very start, never inside a list", () => {
    const e = makeEditor("first\n\nsecond");
    e.commands.setTextSelection(1);
    expect(atStart(e)).toBe(true);
    e.commands.setTextSelection(posOf(e, "second"));
    expect(atStart(e)).toBe(false);
    e.commands.setTextSelection(3);
    expect(atStart(e)).toBe(false);
    e.destroy();
    const list = makeEditor("- a\n- b");
    list.commands.setTextSelection(posOf(list, "a"));
    expect(atStart(list)).toBe(false);
    list.destroy();
  });
});

describe("formatting toolbar (srs-web#751)", () => {
  const apply = (md: string, name: string) => {
    const e = makeEditor(md);
    e.commands.selectAll();
    const f = FORMATS.flatMap((f) => ("menu" in f ? f.menu : [f])).find((f) => f.name === name)!;
    f.run(e);
    const out = [toMarkdown(e), f.active(e)];
    e.destroy();
    return out;
  };
  it.each([
    ["bold", "**word**"],
    ["italic", "*word*"],
    ["heading2", "## word"],
    ["heading3", "### word"],
    ["heading4", "#### word"],
    ["bulletList", "- word"],
    ["orderedList", "1. word"],
    ["blockquote", "> word"],
    ["code", "`word`"],
  ])("%s reaches markdown as %s and shows active", (name, md) => {
    expect(apply("word", name)).toEqual([md, true]);
  });

  it.each([
    ["### word", "heading2", "## word"],
    ["### word", "heading3", "word"],
    ["### word", "paragraph", "word"],
    ["##### word", "paragraph", "word"],
    ["word", "paragraph", "word"],
  ])("%s with %s chosen becomes %s", (from, name, to) => {
    expect(apply(from, name)[0]).toBe(to);
  });

  it("links the selection, inserts a bare URL with no selection, and an empty URL unlinks", () => {
    const e = makeEditor("see here");
    e.commands.setTextSelection({ from: 5, to: 9 });
    setLink(e, " https://example.com ");
    expect(toMarkdown(e)).toBe("see [here](https://example.com)");
    e.commands.setTextSelection(7);
    setLink(e, "");
    expect(toMarkdown(e)).toBe("see here");
    e.commands.setTextSelection(1);
    setLink(e, "https://a.org");
    expect(toMarkdown(e)).toBe("[https://a.org](https://a.org)see here");
    e.destroy();
  });
});
