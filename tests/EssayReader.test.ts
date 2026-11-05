// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";

vi.mock("../src/lib/srs-client.js", async (orig) => ({
  ...(await orig<object>()),
  renderMarkdown: (s: string) => `<p>${s}</p>`,
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
