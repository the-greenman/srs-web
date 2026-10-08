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
  },
  { id: "r2", label: "Loose claim", type: "claim", paragraphs: [] },
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
  const { getByTestId, getByLabelText, rerender, getByText } = render(
    ReferencesTray,
    { items, onopen, onfocus, onremove }
  );
  await fireEvent.click(getByTestId("reference-chip"));
  expect(onfocus).toHaveBeenCalledWith("p1");
  await fireEvent.click(getByLabelText("Remove Loose claim from references"));
  expect(onremove).toHaveBeenCalledWith("r2");
  await fireEvent.click(getByLabelText("Open Source A"));
  expect(onopen).toHaveBeenCalledWith("r1");
  expect(getByLabelText("Open Loose claim")).toBeTruthy(); // an unlinked reference opens too (#499)
  await rerender({ items: [], onopen, onfocus, onremove });
  expect(getByText(/agents and attach flows collect/)).toBeTruthy();
});

it("shows a source's kind and a link when it has a URL", () => {
  const { getByText, getByTestId } = render(ReferencesTray, {
    items: [{ id: "w", label: "A page", type: "source", kind: "web", url: "https://example.org/p", paragraphs: [] }],
    onopen: vi.fn(),
    onfocus: vi.fn(),
    onremove: vi.fn(),
  });
  expect(getByText("A page (source · web)")).toBeTruthy();
  const a = getByTestId("reference-url");
  expect(a.getAttribute("href")).toBe("https://example.org/p");
  expect(a.getAttribute("target")).toBe("_blank");
});

it("with a drop zone: shows the repository size against the budget; Link to paragraph offers the unlinked paragraphs", async () => {
  const onlink = vi.fn();
  const { getByTestId, getAllByTestId, getByText, queryByTestId } = render(ReferencesTray, {
    items,
    paragraphs: [
      { id: "p1", label: "Opening" },
      { id: "p2", label: "Closing" },
    ],
    usedBytes: 1048576,
    onfiles: vi.fn(),
    onurls: vi.fn(),
    onlink,
    onopen: vi.fn(),
    onfocus: vi.fn(),
    onremove: vi.fn(),
  });
  expect(getByTestId("references-drop")).toBeTruthy();
  expect(getByText("1 MB of 5 MB")).toBeTruthy();
  await fireEvent.click(getAllByTestId("reference-link")[0]);
  expect(queryByTestId("reference-link-p1")).toBeNull(); // r1 is linked to p1 already
  await fireEvent.click(getByTestId("reference-link-p2"));
  expect(onlink).toHaveBeenCalledWith("r1", "p2");
});
