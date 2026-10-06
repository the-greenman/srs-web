// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
vi.mock("../src/lib/srs-client.js", () => ({
  renderMarkdown: (s: string) =>
    `<p>${s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>\n<ul><li>one</li></ul>`,
}));
import { plainText } from "../src/lib/comments";

it("is the rendered output's text: markup stripped, whitespace collapsed", () => {
  expect(plainText("**Bold** start")).toBe("Bold start one");
});
