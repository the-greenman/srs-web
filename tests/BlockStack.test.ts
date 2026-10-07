// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlockStack from "../src/lib/components/BlockStack.svelte";
import { DRAG_MIME, endDrag, startDrag } from "../src/lib/components/dnd.js";

afterEach(endDrag);
const row = createRawSnippet((item: () => { id: string }) => ({
  render: () => `<span>${item().id}</span>`,
}));
const mount = (extra: Record<string, unknown> = {}) => {
  const ondrop = vi.fn();
  const r = render(BlockStack, {
    items: [
      { id: "a", depth: 0 },
      { id: "b", depth: 0 },
    ],
    source: "essay",
    ondrop,
    row,
    ...extra,
  });
  return {
    ondrop,
    item: (id: string) => r.container.querySelector<HTMLElement>(`[data-id="${id}"]`)!,
  };
};
const file = new File(["x"], "n.md", { type: "text/markdown" });
const filesDrag = { dataTransfer: { types: ["Files"], files: [file] } };

describe("BlockStack file drops (srs-web#506)", () => {
  it("shows a drop state on the row and calls onfiles with its id and the files", async () => {
    const onfiles = vi.fn();
    const { item, ondrop } = mount({ onfiles });
    await fireEvent.dragOver(item("b"), filesDrag);
    expect(item("b").classList.contains("is-drop-file")).toBe(true);
    await fireEvent.drop(item("b"), filesDrag);
    expect(onfiles).toHaveBeenCalledWith("b", [file]);
    expect(item("b").classList.contains("is-drop-file")).toBe(false);
    expect(ondrop).not.toHaveBeenCalled();
  });

  it("ignores a file drop when there is no callback: no state, no reorder", async () => {
    const { item, ondrop } = mount();
    await fireEvent.dragOver(item("b"), filesDrag);
    expect(item("b").classList.contains("is-drop-file")).toBe(false);
    await fireEvent.drop(item("b"), filesDrag);
    expect(ondrop).not.toHaveBeenCalled();
  });

  it("still reorders for a DRAG_MIME drag, and never calls onfiles", async () => {
    const onfiles = vi.fn();
    const { item, ondrop } = mount({ onfiles });
    startDrag({ dataTransfer: { setData() {} } } as unknown as DragEvent, {
      id: "a",
      from: "essay",
    });
    const move = { dataTransfer: { types: [DRAG_MIME] } };
    await fireEvent.dragOver(item("b"), move);
    await fireEvent.drop(item("b"), move);
    expect(ondrop).toHaveBeenCalledOnce();
    expect(ondrop.mock.calls[0][1].id).toBe("b");
    expect(onfiles).not.toHaveBeenCalled();
  });
});
