// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { countText, htmlText } from "../src/lib/essay/essay-model.js";

it("counts the rendered text: markdown syntax and link URLs drop out", () => {
  // The core's renderMarkdown output for `See [the report](https://example.org/x) for **details**.`
  const html = '<p>See <a href="https://example.org/x">the report</a> for <strong>details</strong>.</p>\n';
  expect(countText(htmlText(html))).toEqual({ words: 5, chars: 27 });
  expect(htmlText("<p>a</p>\n<p>b &amp; c</p>\n").trim()).toBe("a\nb & c");
});
