// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import PinnedPane from "../src/lib/components/PinnedPane.svelte";
import { passageIn } from "../src/lib/essay/quote";

vi.mock("$lib/srs-client.js", () => ({ renderMarkdown: (s: string) => `<p>${s}</p>` }));

const source = { title: "Paper", text: "Before the key\nwords, after.", passage: "key words" };

it("a quotation opens with its source text and the passage highlighted (#525)", async () => {
  const { getByText, getByTestId } = render(PinnedPane, {
    items: [{ id: "q", kind: "quotation", title: "Quote", text: "key words", source }],
    onunpin: vi.fn(),
  });
  await fireEvent.click(getByText("Open"));
  expect(getByTestId("pinned-source-title").textContent).toBe("From Paper");
  const marks = [...getByTestId("pinned-source").querySelectorAll("mark")];
  expect(marks.map((m) => m.textContent).join("")).toBe("key\nwords");
});

it("without the source the quotation still shows its words, no highlight", async () => {
  const { getByText, container } = render(PinnedPane, {
    items: [{ id: "q", kind: "quotation", title: "Quote", text: "key words" }],
    onunpin: vi.fn(),
  });
  await fireEvent.click(getByText("Open"));
  expect(container.textContent).toContain("key words");
  expect(container.querySelector("mark")).toBeNull();
});

it("passageIn finds the trimmed words, or nothing once the text is gone", () => {
  expect(passageIn("a key words b", " key words ")).toEqual({ start: 2, end: 11 });
  expect(passageIn("a b", "key")).toBeNull();
});
