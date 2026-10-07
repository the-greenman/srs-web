// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import ReferencesTray from "../src/lib/components/ReferencesTray.svelte";

const items = [
  {
    id: "r1",
    label: "Source A",
    type: "source",
    paragraphs: [{ id: "p1", label: "Opening" }],
    openable: true,
  },
  { id: "r2", label: "Loose claim", type: "claim", paragraphs: [], openable: false },
];

it("lists each reference with its type, a chip per linked paragraph, and none when unlinked", () => {
  const { getAllByTestId, getByText } = render(ReferencesTray, {
    items,
    onopen: vi.fn(),
    onfocus: vi.fn(),
    onremove: vi.fn(),
  });
  expect(getAllByTestId("reference-row")).toHaveLength(2);
  expect(getByText("Source A (source)")).toBeTruthy();
  expect(getAllByTestId("reference-chip").map((c) => c.textContent)).toEqual(["¶ Opening"]);
});

it("a chip focuses its paragraph; Remove and Open call back with the reference id; an empty tray explains itself", async () => {
  const onfocus = vi.fn();
  const onremove = vi.fn();
  const onopen = vi.fn();
  const { getByTestId, getByLabelText, queryByLabelText, rerender, getByText } = render(
    ReferencesTray,
    { items, onopen, onfocus, onremove }
  );
  await fireEvent.click(getByTestId("reference-chip"));
  expect(onfocus).toHaveBeenCalledWith("p1");
  await fireEvent.click(getByLabelText("Remove Loose claim from references"));
  expect(onremove).toHaveBeenCalledWith("r2");
  await fireEvent.click(getByLabelText("Open Source A"));
  expect(onopen).toHaveBeenCalledWith("r1");
  expect(queryByLabelText("Open Loose claim")).toBeNull();
  await rerender({ items: [], onopen, onfocus, onremove });
  expect(getByText(/agents and attach flows collect/)).toBeTruthy();
});
