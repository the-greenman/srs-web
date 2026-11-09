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
  const { getByTestId, getByLabelText, rerender, getByText } = render(ReferencesTray, {
    items,
    onopen,
    onfocus,
    onremove,
  });
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
    items: [
      {
        id: "w",
        label: "A page",
        type: "source",
        kind: "web",
        url: "https://example.org/p",
        paragraphs: [],
      },
    ],
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

it("lists context documents apart from references and adds pasted text and a URL as context", async () => {
  const oncontext = vi.fn();
  const { getByTestId, getAllByTestId, queryByTestId } = render(ReferencesTray, {
    items: [
      {
        id: "c1",
        label: "Funding call",
        type: "source",
        kind: "context",
        context: true,
        paragraphs: [],
      },
      ...items,
    ],
    onopen: vi.fn(),
    onfocus: vi.fn(),
    onremove: vi.fn(),
    oncontext,
  });
  const ctx = getByTestId("context-documents");
  expect(ctx.textContent).toContain("Funding call");
  expect(getAllByTestId("reference-row")).toHaveLength(3);
  expect(queryByTestId("context-file-note")).toBeNull();

  await fireEvent.input(getByTestId("context-title"), { target: { value: "Call" } });
  await fireEvent.input(getByTestId("context-text"), { target: { value: "Scope text" } });
  await fireEvent.submit(getByTestId("context-text").closest("form")!);
  expect(oncontext).toHaveBeenCalledWith({ texts: [{ title: "Call", body: "Scope text" }] });

  await fireEvent.input(getByTestId("context-url"), {
    target: { value: "https://example.org/call" },
  });
  await fireEvent.submit(getByTestId("context-url").closest("form")!);
  expect(oncontext).toHaveBeenCalledWith({ urls: ["https://example.org/call"] });
});

it("an agent's find shows who found it and is kept or denied in place; the writer's own rows have no buttons (#626)", async () => {
  const onanswer = vi.fn();
  const found = [
    { id: "c1", label: "Candidate", type: "source", paragraphs: [], foundBy: "agent:research" },
    { id: "c2", label: "Kept one", type: "source", paragraphs: [], foundBy: "agent:research", verdict: "agree" as const },
    { id: "own", label: "Mine", type: "source", paragraphs: [] },
  ];
  const { getAllByTestId, getByTestId, getByLabelText } = render(ReferencesTray, {
    items: found,
    onopen: vi.fn(),
    onfocus: vi.fn(),
    onremove: vi.fn(),
    onanswer,
  });
  expect(getAllByTestId("reference-found").map((n) => n.textContent)).toEqual([
    "Suggested, not yet kept · found by agent:research",
    "Kept · found by agent:research",
  ]);
  expect(getAllByTestId("reference-tick")).toHaveLength(1);
  await fireEvent.click(getByLabelText("Keep Candidate"));
  await fireEvent.click(getByLabelText("Deny Candidate"));
  await fireEvent.click(getByTestId("reference-reset"));
  expect(onanswer.mock.calls).toEqual([["c1", "agree"], ["c1", "disagree"], ["c2", "withdrawn"]]);
});

it("a search lists the repository's matches and Add hands back the id; no search without the callbacks (#754)", async () => {
  const onadd = vi.fn();
  const onsearch = (q: string) =>
    q === "small" ? [{ id: "c1", label: "Small groups decide", type: "claim" }] : [];
  const base = { items: [], onopen: vi.fn(), onfocus: vi.fn(), onremove: vi.fn() };
  const { getByTestId, getByLabelText, queryByTestId, rerender } = render(ReferencesTray, { ...base, onsearch, onadd });
  const input = getByTestId("references-find");
  await fireEvent.input(input, { target: { value: "small" } });
  expect(getByTestId("references-found").textContent).toContain("Small groups decide (claim)");
  await fireEvent.click(getByLabelText("Add Small groups decide to references"));
  expect(onadd).toHaveBeenCalledWith("c1");
  expect(queryByTestId("references-found")).toBeNull();
  await fireEvent.input(input, { target: { value: "nothing" } });
  expect(getByTestId("references-found-none")).toBeTruthy();
  await rerender({ ...base, onsearch: undefined, onadd: undefined });
  expect(queryByTestId("references-find")).toBeNull();
});

it("lists a quotation under its source, and as its own row when the source is not in the tray (srs-web#525)", () => {
  const quote = { id: "q1", label: "the words", type: "quotation", sourceId: "r1", paragraphs: [{ id: "p1", label: "Opening" }] };
  const props = { onopen: vi.fn(), onfocus: vi.fn(), onremove: vi.fn() };
  const nested = render(ReferencesTray, { ...props, items: [...items, quote] });
  expect(nested.getAllByTestId("reference-row")).toHaveLength(2);
  const under = nested.getByTestId("reference-quotes");
  expect(under.querySelectorAll('[data-testid="reference-quote"]')).toHaveLength(1);
  expect(under.textContent).toContain("the words");
  nested.unmount();
  const orphan = render(ReferencesTray, { ...props, items: [items[1], quote] });
  expect(orphan.getAllByTestId("reference-row")).toHaveLength(2);
  expect(orphan.queryByTestId("reference-quotes")).toBeNull();
});
