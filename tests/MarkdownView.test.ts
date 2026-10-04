// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";

// The core's renderMarkdown is covered on the real engine (markdown.wasm.test.ts); here a stand-in
// with the same contract (emphasis rendered, raw HTML escaped) proves MarkdownView only passes it through.
vi.mock("../src/lib/srs-client.js", () => ({
  renderMarkdown: (s: string) =>
    `<p>${s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")}</p>`,
}));
import MarkdownView from "../src/lib/components/MarkdownView.svelte";

it("renders emphasis and shows raw HTML as text", () => {
  const { container } = render(MarkdownView, { value: "*hi* <img src=x onerror=alert(1)>" });
  expect(container.querySelector("em")?.textContent).toBe("hi");
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("<img src=x");
});
