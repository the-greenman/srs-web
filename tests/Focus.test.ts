// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/srs-client.js", async (orig) => ({
  ...(await orig<object>()),
  renderMarkdown: (s: string) => `<p>${s}</p>`,
}));
import Focus from "../src/lib/lens/Focus.svelte";
import type { FocusData, ReadData } from "../src/lib/lens/lens-data.js";

const block = (id: string, label: string): ReadData => ({
  id,
  label,
  record: { instanceId: id, typeId: "t", typeVersion: 1, displayLabel: label, fieldValues: { body: `${label} body` } },
  fields: [{ name: "body", label: "Body", valueType: "markdown", required: false }],
  composites: [],
});
const reading: FocusData = { kind: "read", block: block("a", "Alpha") };
const doc: FocusData = { kind: "blocks", title: "Part", blocks: [block("a", "Alpha"), block("b", "Beta")] };

describe("Focus", () => {
  it("Edit absent when onEdit absent", () => {
    const ro = render(Focus, { data: reading, onMode: () => {} });
    expect(ro.container.querySelector('[data-testid="lens-edit"]')).toBeNull();
    ro.unmount();
    const rw = render(Focus, { data: reading, onMode: () => {}, onEdit: () => {} });
    expect(rw.container.querySelector('[data-testid="lens-edit"]')?.textContent).toBe("Edit");
  });

  it("clicking a block selects it", async () => {
    const onSelect = vi.fn();
    const { container } = render(Focus, { data: doc, mode: "document", selectedId: "a", onSelect });
    const blocks = container.querySelectorAll('[data-testid="lens-block"]');
    expect(blocks[0].classList.contains("lens-block--selected")).toBe(true);
    await fireEvent.click(blocks[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("As published offered only when published", () => {
    const values = (published: boolean) => {
      const r = render(Focus, { data: reading, published, onMode: () => {} });
      const v = [...r.container.querySelectorAll<HTMLOptionElement>('[data-testid="lens-mode"] option')].map((o) => o.value);
      r.unmount();
      return v;
    };
    expect(values(false)).toEqual(["read", "document"]);
    expect(values(true)).toEqual(["read", "document", "published"]);
  });
});
