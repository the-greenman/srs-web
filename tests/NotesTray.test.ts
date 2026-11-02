// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import NotesTray from "../src/lib/components/NotesTray.svelte";

const items = [
  { id: "n1", title: "First conversation", produced: [{ id: "r1", label: "Claim A" }] },
  { id: "n2", title: "Timeline", produced: [] },
];

it("lists the notes in order, with a chip per record derived from a note and none otherwise", () => {
  const { getAllByTestId, getByText } = render(NotesTray, { items, onopen: vi.fn(), onopenrecord: vi.fn() });
  expect(getAllByTestId("note-row")).toHaveLength(2);
  expect(getByText("First conversation")).toBeTruthy();
  expect(getAllByTestId("note-produced").map((c) => c.textContent?.trim())).toEqual(["→ Claim A"]);
});

it("Open pins the note; a chip opens the record it produced; an empty tray explains itself", async () => {
  const onopen = vi.fn();
  const onopenrecord = vi.fn();
  const { getByLabelText, getByTestId, rerender, getByText } = render(NotesTray, { items, onopen, onopenrecord });
  await fireEvent.click(getByLabelText("Open Timeline"));
  expect(onopen).toHaveBeenCalledWith("n2");
  await fireEvent.click(getByTestId("note-produced"));
  expect(onopenrecord).toHaveBeenCalledWith("r1");
  await rerender({ items: [], onopen, onopenrecord });
  expect(getByText(/conversation this essay grew from/)).toBeTruthy();
});
