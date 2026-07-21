/**
 * Unit tests for decision-export-utils.ts — presentation glue for decision-document export.
 *
 * Single-decision and whole-log export now render through the core document-view engine
 * (`renderDocumentView`), so there are no decision-type-specific TS formatters to test
 * (muDemocracy.org#43 box 4). These tests cover the presentation helpers that remain:
 *   - markdownToText: format-generic Markdown → plain-text conversion (plain-text export)
 *   - wrapLogHtml: wraps a bare HTML fragment in a full HTML document
 */

import { describe, expect, it } from "vitest";
import { markdownToText, wrapLogHtml } from "../src/lib/governance/decision-export-utils.js";

// ---------------------------------------------------------------------------
// markdownToText
// ---------------------------------------------------------------------------

describe("markdownToText", () => {
  it("strips ATX heading markers, keeping the text", () => {
    const text = markdownToText("# Meeting cadence\n\n## Decision Statement\n\nWe decided X.");
    expect(text).toContain("Meeting cadence");
    expect(text).toContain("Decision Statement");
    expect(text).not.toContain("#");
  });

  it("removes bold, italic, and inline-code markers", () => {
    expect(markdownToText("**bold** and *italic* and `code`")).toBe("bold and italic and code");
    expect(markdownToText("some _emphasis_ here")).toBe("some emphasis here");
  });

  it("renders links as their text", () => {
    expect(markdownToText("see [the decision](https://example.com/d/1)")).toBe("see the decision");
  });

  it("drops horizontal rules", () => {
    const text = markdownToText("Above\n\n---\n\nBelow");
    expect(text).not.toContain("---");
    expect(text).toContain("Above");
    expect(text).toContain("Below");
  });

  it("converts list bullets to a bullet glyph", () => {
    const text = markdownToText("- first\n- second");
    expect(text).toContain("• first");
    expect(text).toContain("• second");
    expect(text).not.toMatch(/^- /m);
  });

  it("strips blockquote markers", () => {
    expect(markdownToText("> quoted line")).toBe("quoted line");
  });

  it("collapses runs of blank lines and trims", () => {
    expect(markdownToText("\n\nA\n\n\n\nB\n\n")).toBe("A\n\nB");
  });
});

// ---------------------------------------------------------------------------
// wrapLogHtml
// ---------------------------------------------------------------------------

describe("wrapLogHtml", () => {
  it("wraps a fragment in a complete HTML document", () => {
    const fragment = `<div class="srs-document"><p>Content</p></div>`;
    const html = wrapLogHtml(fragment, "Decision Log");
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<title>Decision Log</title>");
    expect(html).toContain("<h1>Decision Log</h1>");
    expect(html).toContain(fragment);
  });

  it("HTML-escapes the title in <title> and <h1>", () => {
    const html = wrapLogHtml("<p>ok</p>", "Log <2026>");
    expect(html).toContain("<title>Log &lt;2026&gt;</title>");
    expect(html).toContain("<h1>Log &lt;2026&gt;</h1>");
  });

  it("includes the raw fragment without escaping it", () => {
    const fragment = "<div><h2>Section</h2><p>Text &amp; more</p></div>";
    const html = wrapLogHtml(fragment, "Log");
    expect(html).toContain(fragment);
  });
});
