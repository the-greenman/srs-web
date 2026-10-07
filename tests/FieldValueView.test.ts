// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

// srs-web#479 — a markdown-format field value must render through the core's
// sanitized renderMarkdown(), not as a raw string. Same stand-in contract as
// MarkdownView.test.ts: emphasis rendered, raw HTML escaped.
vi.mock("../src/lib/srs-client.js", () => ({
  renderMarkdown: (s: string) =>
    `<p>${s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")}</p>`,
}));
import FieldValueView from "../src/rendering/FieldValueView.svelte";

describe("FieldValueView markdown rendering (srs-web#479)", () => {
  it("renders a scalar markdown value as HTML, not raw text", () => {
    const { container } = render(FieldValueView, {
      props: { value: "See the *model* page.", valueType: "markdown" },
    });
    expect(container.querySelector("em")?.textContent).toBe("model");
    expect(container.textContent).not.toContain("*model*");
  });

  it("sanitizes raw HTML in a markdown value the same way MarkdownView does", () => {
    const { container } = render(FieldValueView, {
      props: { value: "<img src=x onerror=alert(1)>", valueType: "markdown" },
    });
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders each item of a list-cardinality markdown field as HTML", () => {
    const { container } = render(FieldValueView, {
      props: { value: ["*a*", "*b*"], valueType: "markdown" },
    });
    const items = container.querySelectorAll("em");
    expect(Array.from(items).map((el) => el.textContent)).toEqual(["a", "b"]);
  });

  it("still renders a plain string field as raw text (no valueType regression)", () => {
    const { container } = render(FieldValueView, {
      props: { value: "*not markdown*" },
    });
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toContain("*not markdown*");
  });

  it("still renders a url field as a clickable anchor (no valueType regression)", () => {
    const { container } = render(FieldValueView, {
      props: { value: "https://example.com", valueType: "url" },
    });
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });
});
