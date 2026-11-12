// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";

vi.mock("../src/lib/srs-client.js", async (orig) => ({
  ...(await orig<object>()),
  renderMarkdown: (s: string, images = true) => `<p data-images="${images}">${s}</p>`,
}));
import EssayReader from "../src/lib/components/EssayReader.svelte";

const reading = {
  title: "An essay",
  purpose: "Why",
  paragraphs: [
    { id: "a", body: "First" },
    { id: "b", body: "Second" },
  ],
};

it("shows the title, the purpose and the paragraphs in order, with nothing to edit", () => {
  const { container } = render(EssayReader, { reading });
  expect(container.querySelector("h1")?.textContent).toBe("An essay");
  expect(container.querySelector(".essay-reader__purpose")?.textContent).toBe("Why");
  expect([...container.querySelectorAll(".essay-reader__paragraph")].map((p) => p.textContent)).toEqual(["First", "Second"]);
  expect(container.querySelector("button, input, textarea, [contenteditable]")).toBeNull();
});

it("a null purpose shows no purpose", () => {
  const { container } = render(EssayReader, { reading: { ...reading, purpose: null } });
  expect(container.querySelector(".essay-reader__purpose")).toBeNull();
});

it("shows an image paragraph as a figure with its bytes, between the text (srs-web#764)", () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const image = { alt: "A circle", caption: "C", size: "original" as const, align: "left" as const, documentId: "d1" };
  const asked: string[] = [];
  const { container } = render(EssayReader, {
    reading: { ...reading, paragraphs: [reading.paragraphs[0], { id: "i", image }, reading.paragraphs[1]] },
    imageBytes: (d: string) => (asked.push(d), svg),
  });
  const order = [...container.querySelectorAll(".essay-reader__paragraph, figure")].map((e) =>
    e.tagName === "FIGURE" ? "image" : e.textContent
  );
  expect(order).toEqual(["First", "image", "Second"]);
  expect(container.querySelector("figure img")?.getAttribute("alt")).toBe("A circle");
  expect(asked).toEqual(["d1"]);
  expect(container.querySelector("svg")).toBeNull();
});

it("a markdown image in a text paragraph never shows in the reading view (decision 2ec3671d, D7)", () => {
  const { container } = render(EssayReader, {
    reading: { title: "T", purpose: null, paragraphs: [{ id: "p", body: "See ![a cat](https://example.org/cat.png) here." }] },
  });
  // the core drops the image when asked (srs-web#763): the reader asks for every text paragraph
  expect(container.querySelector(".essay-reader__paragraph p")?.getAttribute("data-images")).toBe("false");
});
