// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import AttachDrop from "../src/lib/components/AttachDrop.svelte";
import { DRAG_MIME } from "../src/lib/components/dnd.js";

afterEach(cleanup);
const zone = () => screen.getByRole("button", { name: "Attach text files" });
const drop = (files: File[]) =>
  fireEvent.drop(zone(), { dataTransfer: { types: ["Files"], files } });

describe("AttachDrop", () => {
  it("passes a dropped text file to onfiles", async () => {
    const onfiles = vi.fn();
    render(AttachDrop, { onfiles });
    await drop([new File(["hello"], "a.txt", { type: "text/plain" })]);
    await waitFor(() => expect(onfiles).toHaveBeenCalledOnce());
    expect(onfiles.mock.calls[0][0][0].name).toBe("a.txt");
  });
  it("shows a rejection for a png and does not call onfiles", async () => {
    const onfiles = vi.fn();
    render(AttachDrop, { onfiles });
    await drop([new File(["x"], "photo.png", { type: "image/png" })]);
    await screen.findByText("photo.png: not a text file (image/png)");
    expect(onfiles).not.toHaveBeenCalled();
  });
  it("lists two rejected files with the same name", async () => {
    render(AttachDrop, { onfiles: vi.fn() });
    const png = () => new File(["x"], "same.png", { type: "image/png" });
    await drop([png(), png()]);
    await waitFor(() => expect(screen.getAllByText("same.png: not a text file (image/png)")).toHaveLength(2));
  });
  it("turns pasted text into a .md file", async () => {
    const onfiles = vi.fn();
    render(AttachDrop, { onfiles });
    await fireEvent.paste(zone(), { clipboardData: { files: [], getData: () => "some notes" } });
    await waitFor(() => expect(onfiles).toHaveBeenCalledOnce());
    const file = onfiles.mock.calls[0][0][0];
    expect(file.name).toMatch(/^pasted-.*\.md$/);
    expect(file.name).not.toContain(":");
    expect(file.type).toBe("text/markdown");
  });
  it("ignores a drag carrying only the reorder type", async () => {
    render(AttachDrop, { onfiles: vi.fn() });
    const notPrevented = await fireEvent.dragOver(zone(), { dataTransfer: { types: [DRAG_MIME] } });
    expect(notPrevented).toBe(true);
    expect(await fireEvent.dragOver(zone(), { dataTransfer: { types: ["Files"] } })).toBe(false);
  });
  it("opens the picker on Enter", async () => {
    const { container } = render(AttachDrop, { onfiles: vi.fn() });
    const click = vi.spyOn(container.querySelector("input")!, "click");
    await fireEvent.keyDown(zone(), { key: "Enter" });
    expect(click).toHaveBeenCalledOnce();
  });
});
