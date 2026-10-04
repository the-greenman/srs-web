// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
vi.mock("../src/lib/srs-client.js", () => ({ renderMarkdown: (s: string) => `<p>${s}</p>` }));
import AttachmentGlyph from "../src/lib/components/AttachmentGlyph.svelte";
import PinnedPane from "../src/lib/components/PinnedPane.svelte";

it("glyph shows kind initial, hover card text, and pins on click", async () => {
  const onpin = vi.fn();
  const { getByRole, container } = render(AttachmentGlyph, {
    kind: "source",
    title: "Smith 2020",
    text: "body",
    onpin,
  });
  const btn = getByRole("button");
  expect(btn.querySelector("svg")).not.toBeNull(); // the kind icon, never a letter
  expect(btn.textContent).toBe("");
  expect(container.querySelector(".attachment-preview__text")?.textContent).toBe("body");
  await fireEvent.click(btn);
  expect(onpin).toHaveBeenCalledOnce();
});

it("the glyph takes its hue from the attaching actor, neutral without one", () => {
  const glyph = (actor?: { kind: "ai"; id: string }) =>
    render(AttachmentGlyph, {
      kind: "problem",
      title: "t",
      actor,
    }).container.querySelector<HTMLElement>(".glyph")!;
  expect(glyph({ kind: "ai", id: "agent:x" }).style.getPropertyValue("--actor-hue")).toBe(
    glyph({ kind: "ai", id: "agent:x" }).style.getPropertyValue("--actor-hue")
  );
  expect(glyph({ kind: "ai", id: "agent:x" }).style.getPropertyValue("--actor-hue")).not.toBe("");
  const none = glyph();
  expect(none.style.getPropertyValue("--actor-hue")).toBe("");
  expect(none.classList.contains("hue-pill--neutral")).toBe(true);
});

it("pinned pane lists items and unpins", async () => {
  const onunpin = vi.fn();
  const { getByLabelText } = render(PinnedPane, {
    items: [{ id: "r1", kind: "note", title: "N", text: "t" }],
    onunpin,
  });
  await fireEvent.click(getByLabelText("Unpin N"));
  expect(onunpin).toHaveBeenCalledWith("r1");
});

it("pinned pane opens the full text and copies it", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const { getByText } = render(PinnedPane, {
    items: [{ id: "r1", kind: "note", title: "N", text: "body" }],
    onunpin: vi.fn(),
  });
  await fireEvent.click(getByText("Open"));
  expect(getByText("Close")).toBeTruthy();
  await fireEvent.click(getByText("Copy"));
  expect(writeText).toHaveBeenCalledWith("body");
});

it("hover card shows the relation label and a Remove link action", async () => {
  const onremove = vi.fn();
  const { getByText, container } = render(AttachmentGlyph, {
    kind: "source",
    title: "Smith 2020",
    relation: "counters",
    onremove,
  });
  expect(container.querySelector(".attachment-preview__kind")?.textContent).toBe(
    "source · counters"
  );
  await fireEvent.click(getByText("Remove link"));
  expect(onremove).toHaveBeenCalledOnce();
});

it("pinned item shows the relation label and removes the link", async () => {
  const onremove = vi.fn();
  const { getByText, container } = render(PinnedPane, {
    items: [{ id: "r1", kind: "note", relation: "evidences", title: "N", text: "t" }],
    onunpin: vi.fn(),
    onremove,
  });
  expect(container.querySelector(".pinned__item .attachment-preview__kind")?.textContent).toBe(
    "note · evidences"
  );
  await fireEvent.click(getByText("Remove link"));
  expect(onremove).toHaveBeenCalledWith("r1");
});
