// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import NotesTray from "../src/lib/components/NotesTray.svelte";

vi.mock("$lib/srs-client.js", () => ({ renderMarkdown: (s: string) => `<p>${s}</p>` }));

const items = [
  { id: "n1", title: "First conversation", text: "Words of the first.", preview: "Words of the first.", produced: [{ id: "r1", label: "Claim A" }] },
  { id: "n2", title: "Timeline", text: "", produced: [] },
];

it("lists the notes in order, with a chip per record derived from a note and none otherwise", () => {
  const { getAllByTestId, getByText } = render(NotesTray, { items, onpin: vi.fn(), onopenrecord: vi.fn() });
  expect(getAllByTestId("note-row")).toHaveLength(2);
  expect(getByText("First conversation")).toBeTruthy();
  expect(getAllByTestId("note-produced").map((c) => c.textContent?.trim())).toEqual(["→ Claim A"]);
});

it("Pin pins the note; a chip opens the record it produced; an empty tray explains itself", async () => {
  const onpin = vi.fn();
  const onopenrecord = vi.fn();
  const { getByLabelText, getByTestId, rerender, getByText } = render(NotesTray, { items, onpin, onopenrecord });
  await fireEvent.click(getByLabelText("Pin Timeline"));
  expect(onpin).toHaveBeenCalledWith("n2");
  await fireEvent.click(getByTestId("note-produced"));
  expect(onopenrecord).toHaveBeenCalledWith("r1");
  await rerender({ items: [], onpin, onopenrecord });
  expect(getByText(/conversation this essay grew from/)).toBeTruthy();
});

it("shows a note's opening words and opens all of them in place (#787)", async () => {
  const { getByTestId, getByRole } = render(NotesTray, { items, onpin: vi.fn() });
  expect(getByTestId("entry-preview").textContent).toBe("Words of the first.");
  await fireEvent.click(getByRole("button", { name: "First conversation" }));
  expect(getByTestId("entry-full").textContent).toContain("Words of the first.");
});
