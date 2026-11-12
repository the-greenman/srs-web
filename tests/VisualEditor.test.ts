// @vitest-environment happy-dom
// MarkdownText mode="visual" with the real VisualEditor (srs-web#749): opening and leaving writes
// nothing, an edit commits once on blur, and an image paragraph opens as source, text intact.
// `marked` stands in for the core's renderMarkdown (WASM is stubbed under vitest); the real-core
// judgement is visual-markdown.wasm.test.ts.
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, it, vi } from "vitest";

vi.mock("../src/lib/srs-client.js", async () => {
  const { marked } = await import("marked");
  return {
    renderMarkdown: (md: string, images = true) =>
      marked.parse(images ? md : md.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"), { async: false }) as string,
  };
});
import MarkdownText from "../src/lib/components/MarkdownText.svelte";

const open = async (container: HTMLElement) => {
  await fireEvent.focus(container.querySelector(".block__render")!);
  await tick();
};

it("opening a paragraph visually and leaving it writes nothing", async () => {
  const oncommit = vi.fn();
  const { container } = render(MarkdownText, { value: "Untouched **text**", base: "block", label: "Body", mode: "visual", oncommit });
  await open(container);
  const pm = await waitFor(() => {
    const el = container.querySelector<HTMLElement>(".block__body--visual .ProseMirror");
    expect(el).not.toBeNull();
    return el!;
  });
  expect(pm.querySelector("strong")?.textContent).toBe("text");
  await fireEvent.blur(pm);
  await tick();
  expect(oncommit).not.toHaveBeenCalled();
  expect(container.querySelector(".block__render")).not.toBeNull();
});

it("an image paragraph (images off) opens as source with its text intact and no <img>", async () => {
  const value = "before ![](https://example.com/x.png) after";
  const oncommit = vi.fn();
  const { container } = render(MarkdownText, { value, base: "block", label: "Body", mode: "visual", images: false, oncommit });
  expect(container.querySelector("img")).toBeNull();
  await open(container);
  const src = await waitFor(() => {
    const el = container.querySelector<HTMLElement>('.block__body[contenteditable="plaintext-only"]');
    expect(el).not.toBeNull();
    return el!;
  });
  expect(src.textContent).toBe(value);
  expect(container.querySelector(".block__note")?.textContent).toMatch(/markdown source/);
  expect(container.querySelector("img")).toBeNull();
  await fireEvent.blur(src);
  expect(oncommit).not.toHaveBeenCalled();
});

it("an edit commits once, as markdown, when the paragraph is left", async () => {
  const oncommit = vi.fn();
  const { container } = render(MarkdownText, { value: "one", base: "block", label: "Body", mode: "visual", oncommit });
  await open(container);
  const pm = await waitFor(() => {
    const el = container.querySelector<HTMLElement & { editor?: { commands: { insertContent: (c: unknown) => void } } }>(".block__body--visual .ProseMirror");
    expect(el?.editor).toBeTruthy();
    return el!;
  });
  pm.editor!.commands.insertContent({ type: "text", text: " two", marks: [{ type: "bold" }] });
  await fireEvent.blur(pm);
  await tick();
  expect(oncommit).toHaveBeenCalledExactlyOnceWith("one **two**");
});
