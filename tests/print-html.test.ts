import { expect, it } from "vitest";
import { printHtml } from "../src/lib/guides/print-html.js";

it("embeds the theme css and body verbatim, with the print rule in a second style block", () => {
  const html = printHtml("body{color:red}", "<h1>Guide</h1>");
  expect(html).toContain("<style>body{color:red}</style>");
  expect(html).toContain("<style>@media print { body { margin: 0; } }</style>");
  expect(html).toContain("<body><h1>Guide</h1></body>");
  expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
});
