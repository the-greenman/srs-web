// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import InlineText from "../src/lib/components/InlineText.svelte";

async function edit(value: string, next: string, finish: (i: HTMLElement) => Promise<unknown>) {
  const oncommit = vi.fn();
  render(InlineText, { value, label: "Title", placeholder: "Add title", oncommit });
  await fireEvent.click(screen.getByRole("button"));
  const input = screen.getByLabelText("Title") as HTMLInputElement;
  input.value = next;
  await finish(input);
  return oncommit;
}

it("Enter commits the edit", async () => {
  const c = await edit("A", "B", (i) => fireEvent.keyDown(i, { key: "Enter" }));
  expect(c).toHaveBeenCalledExactlyOnceWith("B");
  expect(screen.queryByLabelText("Title")).toBeNull();
});

it("blur commits the edit", async () => {
  const c = await edit("A", "B", (i) => fireEvent.blur(i));
  expect(c).toHaveBeenCalledExactlyOnceWith("B");
});

it("Escape cancels, and the blur that follows does not commit", async () => {
  const c = await edit("A", "B", async (i) => {
    await fireEvent.keyDown(i, { key: "Escape" });
    await fireEvent.blur(i);
  });
  expect(c).not.toHaveBeenCalled();
});

it("does not commit an unchanged value", async () => {
  const c = await edit("A", "A", (i) => fireEvent.keyDown(i, { key: "Enter" }));
  expect(c).not.toHaveBeenCalled();
});

it("F2 on the text starts editing; empty value shows the placeholder", async () => {
  render(InlineText, { value: "", label: "Title", placeholder: "Add title", oncommit: vi.fn() });
  const view = screen.getByRole("button");
  expect(view.textContent).toBe("Add title");
  await fireEvent.keyDown(view, { key: "F2" });
  expect(screen.getByLabelText("Title")).toBeTruthy();
});
