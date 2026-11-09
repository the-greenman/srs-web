// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import DocumentPicker from "../src/lib/components/DocumentPicker.svelte";
import { moveActive, pickerRows, pushRecent } from "../src/lib/document-picker.js";

const options = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Beta, with a rather long title that would be cut off" },
  { id: "c", title: "Gamma" },
];

describe("document-picker rules", () => {
  it("puts recents first, then the rest in order", () => {
    const rows = pickerRows(options, ["c", "zz"], "");
    expect(rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(rows[0].recent).toBe(true);
  });
  it("a query filters by title and drops the Recent group", () => {
    const rows = pickerRows(options, ["c"], "a");
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => !r.recent)).toBe(true);
    expect(pickerRows(options, [], "gam").map((r) => r.id)).toEqual(["c"]);
  });
  it("pushRecent moves to the front without duplicates, capped at five", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushRecent(["1", "2", "3", "4", "5"], "6")).toEqual(["6", "1", "2", "3", "4"]);
  });
  it("moveActive wraps and starts at the ends", () => {
    expect(moveActive(3, -1, "ArrowDown")).toBe(0);
    expect(moveActive(3, -1, "ArrowUp")).toBe(2);
    expect(moveActive(3, 2, "ArrowDown")).toBe(0);
    expect(moveActive(0, -1, "ArrowDown")).toBe(-1);
  });
});

describe("DocumentPicker", () => {
  it("shows the current title as the control with the full title on hover", () => {
    const { getByTestId } = render(DocumentPicker, { props: { options, currentId: "b", label: "Essay", onselect: vi.fn() } });
    const t = getByTestId("doc-picker-trigger");
    expect(t.getAttribute("title")).toBe(options[1].title);
    expect(t.textContent).toContain("Beta");
  });
  it("lists every document, marks the current one, filters and chooses", async () => {
    const onselect = vi.fn();
    const { getByTestId, getAllByTestId, getByRole } = render(DocumentPicker, {
      props: { options, currentId: "a", label: "Essay", onselect },
    });
    await fireEvent.click(getByTestId("doc-picker-trigger"));
    const opts = getAllByTestId("doc-picker-option");
    expect(opts).toHaveLength(3);
    expect(opts[0].getAttribute("aria-selected")).toBe("true");
    const search = getByRole("combobox", { name: /search essays/i });
    await fireEvent.input(search, { target: { value: "gam" } });
    expect(getAllByTestId("doc-picker-option")).toHaveLength(1);
    await fireEvent.keyDown(search, { key: "Enter" });
    expect(onselect).toHaveBeenCalledWith("c");
  });
  it("offers New document when given a handler", async () => {
    const onnew = vi.fn();
    const { getByTestId } = render(DocumentPicker, { props: { options, currentId: "a", label: "Essay", onselect: vi.fn(), onnew } });
    await fireEvent.click(getByTestId("doc-picker-trigger"));
    await fireEvent.click(getByTestId("doc-picker-new"));
    expect(onnew).toHaveBeenCalled();
  });
});
