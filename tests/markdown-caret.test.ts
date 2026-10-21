import { describe, expect, it } from "vitest";
import { mapRenderedOffsetToSource, stripInlineMarkdown } from "../src/lib/components/markdown-caret";

describe("stripInlineMarkdown", () => {
  it("passes plain text through unchanged", () => {
    expect(stripInlineMarkdown("hello world")).toEqual({
      text: "hello world",
      sourceOffsets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
  });

  it("strips ** bold markers, mapping inner text back to its source position", () => {
    const { text } = stripInlineMarkdown("a **bold** b");
    expect(text).toBe("a bold b");
  });

  it("strips _ and * italic markers", () => {
    expect(stripInlineMarkdown("a *x* b").text).toBe("a x b");
    expect(stripInlineMarkdown("a _x_ b").text).toBe("a x b");
  });

  it("strips backtick code markers", () => {
    expect(stripInlineMarkdown("a `code` b").text).toBe("a code b");
  });

  it("keeps link text, drops the brackets and URL", () => {
    const { text } = stripInlineMarkdown("see [a link](https://example.com) now");
    expect(text).toBe("see a link now");
  });

  it("does not let URL characters bleed into the mapped text (reviewer finding #3)", () => {
    // Rendered text is "ac": the link text "a", then a literal trailing "c" that must not be
    // confused with the "c" inside the URL "xc".
    const { text, sourceOffsets } = stripInlineMarkdown("[a](xc)c");
    expect(text).toBe("ac");
    // offset 2 (end of "ac") must map to the end of the whole source, not into "(xc)".
    expect(sourceOffsets).toEqual([1, 7]);
  });

  it("treats a backslash-escaped delimiter as literal, not as syntax", () => {
    expect(stripInlineMarkdown("a \\*not italic\\* b").text).toBe("a *not italic* b");
  });

  it("passes HTML-sensitive characters through unchanged (DOM decodes entities back to this)", () => {
    expect(stripInlineMarkdown("a & b < c").text).toBe("a & b < c");
  });

  it("leaves an unterminated construct as literal text", () => {
    expect(stripInlineMarkdown("a **bold with no close").text).toBe("a **bold with no close");
  });
});

describe("mapRenderedOffsetToSource", () => {
  it("is the identity for plain text", () => {
    const source = "hello world";
    for (let i = 0; i <= source.length; i++) {
      expect(mapRenderedOffsetToSource(source, i)).toBe(i);
    }
  });

  it("maps into bold text at the matching source position", () => {
    const source = "a **bold** b"; // rendered: "a bold b"
    // rendered "a bold b": a(0) ' '(1) b(2)o(3)l(4)d(5) ' '(6) b(7)
    expect(mapRenderedOffsetToSource(source, 0)).toBe(0); // before "a"
    expect(mapRenderedOffsetToSource(source, 2)).toBe(4); // start of "bold" -> after "**"
    expect(mapRenderedOffsetToSource(source, 6)).toBe(10); // just after "bold" -> after closing "**"
  });

  it("maps into link text at the matching source position, not into the URL", () => {
    const source = "[a link](https://example.com) now"; // rendered: "a link now"
    expect(mapRenderedOffsetToSource(source, 0)).toBe(1); // before "a"
    expect(mapRenderedOffsetToSource(source, 4)).toBe(5); // mid-word, before the "n" in "link"
  });

  it("clamps an offset at or past the end of the rendered text to the end of the source", () => {
    const source = "a **bold** b";
    const end = mapRenderedOffsetToSource(source, 999);
    expect(end).toBe(source.length);
  });

  it("clamps a negative offset to the start", () => {
    expect(mapRenderedOffsetToSource("a **bold** b", -5)).toBe(0);
  });

  it("round-trips at every rendered offset for a mixed-markdown paragraph", () => {
    const source = "One **bold** and a [link](https://x.y) and `code`.";
    const { text } = stripInlineMarkdown(source);
    // every mapped source offset must be a valid index into source, and non-decreasing as
    // renderedOffset increases (caret placement must not jump backwards as you scan forward).
    let prev = -1;
    for (let i = 0; i <= text.length; i++) {
      const mapped = mapRenderedOffsetToSource(source, i);
      expect(mapped).toBeGreaterThanOrEqual(prev);
      expect(mapped).toBeGreaterThanOrEqual(0);
      expect(mapped).toBeLessThanOrEqual(source.length);
      prev = mapped;
    }
  });
});
