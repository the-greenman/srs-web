// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import AttachmentGlyph from "../src/lib/components/AttachmentGlyph.svelte";
import PinnedPane from "../src/lib/components/PinnedPane.svelte";

it("glyph shows kind initial, hover card text, and pins on click", async () => {
  const onpin = vi.fn();
  const { getByRole, container } = render(AttachmentGlyph, { kind: "source", title: "Smith 2020", text: "body", onpin });
  const btn = getByRole("button");
  expect(btn.textContent).toBe("S");
  expect(container.querySelector(".hover-card__text")?.textContent).toBe("body");
  await fireEvent.click(btn);
  expect(onpin).toHaveBeenCalledOnce();
});

it("same kind gets the same hue", () => {
  const hue = () =>
    render(AttachmentGlyph, { kind: "problem", title: "t" }).container.querySelector<HTMLElement>(".glyph")?.style.getPropertyValue("--glyph-hue");
  expect(hue()).toBe(hue());
});

it("pinned pane lists items and unpins", async () => {
  const onunpin = vi.fn();
  const { getByLabelText } = render(PinnedPane, { items: [{ id: "r1", kind: "note", title: "N", text: "t" }], onunpin });
  await fireEvent.click(getByLabelText("Unpin N"));
  expect(onunpin).toHaveBeenCalledWith("r1");
});
